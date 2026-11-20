// Extends the isolated evidence fixture with the released taxonomy and purchase triggers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

export async function validatePurchaseAmounts({ db, as, reserve, id, admin, member, outsider, store, otherStore }) {
  await db.exec(`RESET ROLE;
    ALTER TABLE stores ADD COLUMN categories jsonb DEFAULT '["재료전용"]',
      ADD COLUMN purchase_categories text[] DEFAULT ARRAY['주류','별도'],
      ADD COLUMN purchase_types text[] DEFAULT ARRAY['수기'];
    ALTER TABLE ingredients ADD COLUMN category text;
    ALTER TABLE purchases ALTER COLUMN amount TYPE numeric(12,0);
    CREATE TABLE toss_orders(store_id uuid,status text,order_at timestamptz,card_amount numeric,cash_amount numeric,total_amount numeric);
    CREATE TABLE manual_sales(store_id uuid,date date,card_amount numeric,cash_amount numeric);
    ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_purchase_scope ON purchases FOR SELECT USING (is_store_member(store_id) AND supplier IS DISTINCT FROM 'QA-RLS-hidden');`);
  await db.exec(await migration('20261118141000_home_daily_sources.sql'));
  const mapping = await migration('20260914_unify_bipum_category.sql');
  await db.exec('DROP FUNCTION map_purchase_category(text);' + mapping.slice(mapping.indexOf('CREATE OR REPLACE FUNCTION map_purchase_category')));
  const visibility = await migration('20261117160000_store_visibility.sql');
  await db.exec(visibility.slice(visibility.indexOf('CREATE OR REPLACE FUNCTION private.can_read_shared_domain'),
    visibility.indexOf('CREATE OR REPLACE FUNCTION public.can_read_other_attendance')));
  const taxonomy = await migration('20261023120000_read_models_and_integrity.sql');
  await db.exec(taxonomy.slice(0, taxonomy.indexOf('CREATE FUNCTION public.change_store_taxonomy')) + 'COMMIT;');
  const type = await migration('20261019_purchase_types.sql');
  await db.exec(type.slice(type.indexOf('CREATE FUNCTION public.validate_purchase_type()'), type.lastIndexOf('COMMIT;')));
  await db.query("UPDATE stores SET purchase_categories=ARRAY['다른매장전용','소모품'] WHERE id=$1", [otherStore]);
  const deleted = id(1010), disabled = id(1011), fresh = id(1012);
  await db.query('INSERT INTO stores(id) VALUES($1),($2)', [deleted, disabled]);
  await db.query("UPDATE stores SET deleted_at=now()-interval '1 day' WHERE id=$1", [deleted]);
  await db.query("INSERT INTO store_taxonomies(store_id,domain,name,is_active) VALUES($1,'purchase','소모품',false)", [disabled]);
  const oldPurchases = (await db.query('SELECT * FROM purchases ORDER BY id')).rows;
  const oldItems = (await db.query('SELECT * FROM purchase_items ORDER BY id')).rows;
  const purchaseMigration = await migration('20261120120000_purchase_explicit_category_amounts.sql');
  await db.exec(purchaseMigration);
  await db.exec(purchaseMigration);
  assert.deepEqual((await db.query('SELECT * FROM purchases ORDER BY id')).rows, oldPurchases);
  assert.deepEqual((await db.query('SELECT * FROM purchase_items ORDER BY id')).rows, oldItems);

  const categories = async sid => (await db.query('SELECT purchase_categories FROM stores WHERE id=$1', [sid])).rows[0].purchase_categories;
  assert.deepEqual(await categories(store), ['주류','별도','소모품']);
  assert.deepEqual(await categories(otherStore), ['다른매장전용','소모품']);
  assert.deepEqual(await categories(disabled), ['주류','별도']);
  assert.deepEqual(await categories(deleted), ['주류','별도']);
  await db.query('UPDATE stores SET deleted_at=NULL WHERE id=$1', [deleted]);
  assert.deepEqual(await categories(deleted), ['주류','별도','소모품']);
  await db.query('INSERT INTO stores(id) VALUES($1)', [fresh]);
  assert.deepEqual(await categories(fresh), ['식자재','주류','비품','소모품']);

  const write = (items, category='소모품', sid=store) => db.query(
    "SELECT create_purchase_with_amounts($1,'2026-11-20',' QA-납품 ','수기',$2,$3) AS id",
    [sid, category, JSON.stringify(items)]);
  const lines = [{name:'세제', amount:10000, quantity:3, ingredient_id:id(910), unit:'개', category:'주류'},
    {name:'봉투', amount:55}, {name:'샘플', amount:0, quantity:null}];
  const suppliers = async sid => (await db.query('SELECT * FROM list_purchase_suppliers($1)', [sid])).rows.map(r=>r.supplier);
  await db.query(`INSERT INTO purchases(store_id,date,supplier,category,type,amount) VALUES
    ($1,'2026-11-18','QA-납품','주류','수기',1),($1,'2026-11-18','  ','주류','수기',1),
    ($1,'2026-11-19','QA-RLS-hidden','주류','수기',1),($2,'2026-11-19','QA-타매장','소모품','수기',2)`, [store, otherStore]);
  await db.query("INSERT INTO store_taxonomies(store_id,domain,name,is_active) VALUES($1,'purchase','숨김',false)", [store]);
  await as(admin);
  const legacy = await db.query("SELECT create_purchase_with_evidence($1,'2026-11-18','','수기',$2) AS id",
    [store, JSON.stringify([{name:'구버전',quantity:2,unit_price:3,category:'소모품'}])]);
  assert.deepEqual((await db.query('SELECT category,amount FROM purchases WHERE id=$1', [legacy.rows[0].id])).rows[0],
    {category:'비품',amount:'6'});
  const purchaseId = (await write(lines)).rows[0].id;
  const day = await db.query("SELECT purchase FROM get_home_daily_sources($1,'2026-11-20','2026-11-20','2026-11-20','2026-11-21',0)", [store]);
  assert.equal(day.rows[0].purchase, '10055');
  assert.equal((await reserve(id(1015), {p_purchase_id:purchaseId})).purchase_id, purchaseId);
  const stored = (await db.query(`SELECT p.supplier,p.amount=10055 AND p.amount=sum(i.subtotal) AS exact,
    p.category, bool_and(i.category=p.category AND i.category_id=p.category_id) AS same_category
    FROM purchases p JOIN purchase_items i ON i.purchase_id=p.id WHERE p.id=$1 GROUP BY p.id`, [purchaseId])).rows[0];
  assert.deepEqual(stored, {supplier:'QA-납품', exact:true, category:'소모품', same_category:true});
  assert.equal((await db.query(`SELECT bool_and(CASE WHEN name='세제' THEN quantity=3 AND unit_price=10000::numeric/3 AND subtotal=10000
    ELSE quantity=1 AND unit_price=subtotal END) AS exact FROM purchase_items WHERE purchase_id=$1`, [purchaseId])).rows[0].exact, true);
  assert.equal((await db.query('SELECT current_stock=17 AND last_price=10000::numeric/3 AS correct FROM ingredients WHERE id=$1', [id(910)])).rows[0].correct, true);
  const names = await suppliers(store);
  assert.equal(names[0], 'QA-납품');
  assert.equal(names.filter(n=>n==='QA-납품').length, 1);
  assert.ok(['', 'QA-타매장','QA-RLS-hidden'].every(n=>!names.includes(n)));
  assert.deepEqual(await suppliers(otherStore), []);

  await assert.rejects(db.query("SELECT create_purchase_with_amounts($1,current_date,' ','수기','소모품',$2)", [store, JSON.stringify(lines)]), /PURCHASE_INVALID_SUPPLIER/);
  for (const category of ['숨김','재료전용','다른매장전용','수기','미등록']) {
    await assert.rejects(write(lines, category), /PURCHASE_INVALID_CATEGORY/);
  }
  for (const bad of [{name:' ',amount:25}, {name:'오류'}, {name:'오류',amount:1.1}, {name:'오류',amount:-1},
    {name:'오류',amount:'25'}, {name:'오류',amount:1,quantity:0}, {name:'오류',amount:1,ingredient_id:id(911)}]) {
    await assert.rejects(write([lines[0], bad]));
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM purchases WHERE supplier='QA-납품'")).rows[0].n, 2);
  assert.equal((await db.query('SELECT current_stock=17 AS unchanged FROM ingredients WHERE id=$1', [id(910)])).rows[0].unchanged, true);
  await assert.rejects(write(lines, '소모품', otherStore), /FINANCIAL_SHARING_DENIED/);
  await as(outsider);
  await assert.rejects(write(lines), /FINANCIAL_SHARING_DENIED/);
  assert.deepEqual(await suppliers(store), []);
  await db.exec('RESET ROLE');
  // Isolate financial sharing from membership for a member whose store has disabled it.
  await db.query("UPDATE stores SET financial_share_scope='none' WHERE id=$1", [store]);
  await as(member);
  await assert.rejects(write(lines), /FINANCIAL_SHARING_DENIED/);
  assert.deepEqual(await suppliers(store), []);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(write(lines), /permission denied/);
  await assert.rejects(suppliers(store), /permission denied/);
  await db.exec('RESET ROLE');
  console.log('Purchase amount SQL passed: exact won, taxonomies, inventory rollback, evidence parent and scoped supplier history.');
}
