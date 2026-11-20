// Extends the isolated evidence fixture with the released taxonomy and purchase triggers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

export async function validatePurchaseAmounts({ db, as, reserve, id, admin, member, outsider, store, otherStore }) {
  await db.exec(`RESET ROLE;
    ALTER TABLE stores ADD COLUMN categories jsonb DEFAULT '["재료전용"]',
      ADD COLUMN purchase_categories text[] DEFAULT ARRAY['주류','별도'],
      ADD COLUMN purchase_types text[] DEFAULT ARRAY['수기'];
    ALTER TABLE ingredients ADD COLUMN category text, ADD COLUMN unit text DEFAULT 'kg';
    ALTER TABLE purchases ALTER COLUMN amount TYPE numeric(12,0);
    CREATE TABLE toss_orders(store_id uuid,status text,order_at timestamptz,card_amount numeric,cash_amount numeric,total_amount numeric);
    CREATE TABLE manual_sales(store_id uuid,date date,card_amount numeric,cash_amount numeric);
    ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qa_purchase_delete ON purchases FOR DELETE USING (is_store_member(store_id) AND can_read_store_financials(store_id));
    CREATE POLICY qa_purchase_scope ON purchases FOR SELECT USING (is_store_member(store_id) AND supplier IS DISTINCT FROM 'QA-RLS-hidden');`);
  await db.exec(await migration('20261118141000_home_daily_sources.sql'));
  const mapping = await migration('20260914_unify_bipum_category.sql');
  await db.exec('DROP FUNCTION map_purchase_category(text);' + mapping.slice(mapping.indexOf('CREATE OR REPLACE FUNCTION map_purchase_category')));
  const visibility = await migration('20261117160000_store_visibility.sql');
  await db.exec(visibility.slice(visibility.indexOf('CREATE OR REPLACE FUNCTION private.can_read_shared_domain'),
    visibility.indexOf('CREATE OR REPLACE FUNCTION public.can_read_other_attendance')));
  const taxonomy = await migration('20261023120000_read_models_and_integrity.sql');
  await db.exec(taxonomy.slice(0, taxonomy.indexOf('CREATE OR REPLACE FUNCTION public.change_purchase_type')) + 'COMMIT;');
  const integrity = await migration('20261020_01_access_and_purchase_integrity.sql');
  await db.exec(integrity.slice(integrity.indexOf('CREATE OR REPLACE FUNCTION public.validate_purchase_item_store'),
    integrity.indexOf('CREATE OR REPLACE FUNCTION public.create_purchase_with_items')));
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
  await db.exec('RESET ROLE');
  const entryMigration = await migration('20261120121000_purchase_entry_modes.sql');
  await db.exec(entryMigration);
  await db.query('INSERT INTO stores(id) VALUES($1)', [id(1018)]);
  assert.deepEqual(await categories(id(1018)), ['식자재','비품','소모품']);
  assert.deepEqual(await categories(fresh), ['식자재','주류','비품','소모품']);
  await as(admin);
  const entry = (mode, rows, sid=store) => db.query(
    "SELECT create_purchase_entry($1,'2026-11-21','QA-분류','수기',$2,$3) AS id", [sid,mode,JSON.stringify(rows)]);
  const splitItems = [
    {name:'품목1',category:'별도',amount:10000,quantity:3,ingredient_id:id(910)},
    {name:'품목2',category:'소모품',amount:701}, {name:'품목3',category:'별도',amount:27}];
  const splitAmounts = [{category:'주류',amount:20200},{category:'소모품',amount:299},{category:'별도',amount:0},
    {category:'별도',amount:''},{category:'별도',amount:null}];
  const itemId = (await entry('items',splitItems)).rows[0].id;
  const balances = () => db.query('SELECT current_stock,last_price FROM ingredients WHERE id=$1',[id(910)]).then(r=>r.rows[0]);
  const afterItems = await balances();
  assert.equal(afterItems.current_stock,'20');
  const amountId = (await entry('amounts',[...splitAmounts].reverse())).rows[0].id;
  const breakdown = pid => db.query('SELECT amount,category_amounts(p) AS cats FROM purchases p WHERE id=$1',[pid]).then(r=>r.rows[0]);
  assert.deepEqual(await breakdown(itemId), {amount:'10728',cats:{'별도':10027,'소모품':701}});
  assert.deepEqual(await breakdown(amountId), {amount:'20499',cats:{'주류':20200,'소모품':299}});
  assert.equal((await db.query('SELECT count(*)::int n FROM purchase_items WHERE purchase_id=$1',[amountId])).rows[0].n,0);
  assert.equal((await db.query("SELECT unit FROM purchase_items WHERE purchase_id=$1 AND ingredient_id IS NOT NULL",[itemId])).rows[0].unit,'kg');
  assert.deepEqual(await balances(),afterItems);
  assert.equal((await reserve(id(1021),{p_purchase_id:amountId})).purchase_id,amountId);
  const headerCategory = pid => db.query('SELECT category FROM purchases WHERE id=$1',[pid]).then(r=>r.rows[0].category);
  assert.equal(await headerCategory(amountId),'주류');
  const filtered = await db.query(`SELECT sum((category_amounts(p)->>'소모품')::numeric) AS cost,sum(p.amount) AS total
    FROM purchases p WHERE p.store_id=$1 AND p.supplier='QA-분류' AND p.date BETWEEN '2026-11-01' AND '2026-11-30'`,[store]);
  assert.deepEqual(filtered.rows[0],{cost:'1000',total:'31227'});
  assert.equal((await db.query("SELECT purchase FROM get_home_daily_sources($1,'2026-11-21','2026-11-21','2026-11-21','2026-11-22',0)",[store])).rows[0].purchase,'31227');
  for (const [mode, rows] of [
    ['items',[...splitItems, {name:'타매장',category:'다른매장전용',amount:2}]],
    ['items',[{...splitItems[0], unit:'g'}]], ['items',[{...splitItems[0],ingredient_id:id(911)}]],
    ['amounts',[{category:'주류',amount:-1}]], ['amounts',[{category:'주류',amount:1.5}]],
    ['amounts',[{category:'별도',amount:0}]], ['amounts',[...splitAmounts,splitAmounts[0]]],
    ['amounts',[...splitAmounts,{category:'숨김',amount:1}]], ['unknown',splitAmounts]]) {
    await assert.rejects(entry(mode,rows));
  }
  assert.deepEqual(await balances(),afterItems);
  assert.equal((await db.query("SELECT count(*)::int n FROM purchases WHERE supplier='QA-분류'")).rows[0].n,2);
  const edit = (pid,rows) => db.query("SELECT create_purchase_entry($1,'2026-11-21','QA-분류','수기','amounts',$2,$3) AS id",
    [store,JSON.stringify(rows),pid]);
  await assert.rejects(edit(itemId,splitAmounts),/PURCHASE_AMOUNT_ENTRY_NOT_FOUND/);
  await assert.rejects(edit(amountId,[{category:'미등록',amount:1}]),/PURCHASE_INVALID_CATEGORY/);
  assert.deepEqual(await breakdown(amountId),{amount:'20499',cats:{'주류':20200,'소모품':299}});
  assert.equal((await edit(amountId,[{category:'소모품',amount:350}])).rows[0].id,amountId);
  assert.deepEqual(await breakdown(amountId),{amount:'350',cats:{'소모품':350}});
  assert.equal((await db.query('SELECT purchase_id FROM transaction_evidence WHERE id=$1',[id(1021)])).rows[0].purchase_id,amountId);
  assert.deepEqual(await balances(),afterItems);
  await assert.rejects(db.query('DELETE FROM purchase_amount_lines WHERE purchase_id=$1',[amountId]),/permission denied/);
  const disposable = (await entry('amounts',splitAmounts)).rows[0].id;
  await db.exec('RESET ROLE');
  await assert.rejects(db.query('UPDATE purchases SET amount=1 WHERE id=$1',[disposable]),/PURCHASE_AMOUNT_MISMATCH/);
  await assert.rejects(db.query(`INSERT INTO purchase_items(purchase_id,store_id,name,category,quantity,unit_price,subtotal)
    VALUES($1,$2,'금지','소모품',1,1,1)`,[disposable,store]),/PURCHASE_MODE_MISMATCH/);
  await db.exec(entryMigration);
  assert.deepEqual(await breakdown(amountId),{amount:'350',cats:{'소모품':350}});
  await db.query('DELETE FROM purchases WHERE id=$1',[disposable]);
  assert.equal((await db.query('SELECT count(*)::int n FROM purchase_amount_lines WHERE purchase_id=$1',[disposable])).rows[0].n,0);
  await as(admin);
  const change = (oldName,newName,action) => db.query("SELECT change_store_taxonomy($1,'purchase',$2,$3,$4)",[store,oldName,newName,action]);
  await change(null,'기타','add');
  const renamed = (await entry('amounts',[{category:'주류',amount:40},{category:'기타',amount:60},{category:'별도',amount:90}])).rows[0].id;
  assert.equal(await headerCategory(renamed),'별도');
  await change('주류','음료','rename');
  assert.deepEqual((await breakdown(renamed)).cats,{'음료':40,'기타':60,'별도':90});
  await change('음료',null,'remove');
  await change(null,'음료','add');
  assert.deepEqual((await breakdown(renamed)).cats,{'기타':100,'별도':90});
  assert.equal(await headerCategory(renamed),'기타');
  const itemKey = (await db.query('SELECT id FROM purchase_items WHERE purchase_id=$1 AND ingredient_id=$2',[itemId,id(910)])).rows[0].id;
  const editItem = (key,qty,amount) => db.query('SELECT update_purchase_item_amount($1,$2,$3)',[key,qty,amount]);
  const remove = pid => db.query('SELECT delete_purchase_entry($1) AS removed',[pid]).then(r=>r.rows[0].removed);
  const currentItem = () => db.query('SELECT quantity,unit_price,subtotal FROM purchase_items WHERE id=$1',[itemKey]).then(r=>r.rows[0]);

  // 10,000원/3개 → 2개: 구앱의 JS 숫자로 돌아온 단가도 수량 수정으로 인식한다.
  await db.query('SELECT update_purchase_item($1,2,$2)',[itemKey,10000/3]);
  assert.deepEqual(await breakdown(itemId),{amount:'10728',cats:{'별도':10027,'소모품':701}});
  assert.equal(Number((await currentItem()).unit_price),5000);
  assert.equal((await balances()).current_stock,'19');
  await assert.rejects(db.query('SELECT update_purchase_item($1,2,4999)',[itemKey]),/PURCHASE_EDIT_AMOUNT_REQUIRED/);
  await editItem(itemKey,2,null);
  assert.equal((await currentItem()).subtotal,'10000');
  assert.equal((await balances()).current_stock,'19');
  await assert.rejects(editItem(itemKey,2,10.5),/PURCHASE_INVALID_AMOUNT/);
  await editItem(itemKey,2,1);
  assert.deepEqual(await breakdown(itemId),{amount:'729',cats:{'별도':28,'소모품':701}});
  assert.equal(await headerCategory(itemId),'소모품');
  assert.equal(Number((await currentItem()).unit_price),0.5);
  assert.equal((await balances()).current_stock,'19');

  // 증빙이 남으면 부모와 입고량이 모두 유지된다.
  await assert.rejects(remove(purchaseId),/foreign key constraint/);
  assert.equal((await balances()).current_stock,'19');
  await as(outsider);
  await assert.rejects(editItem(itemKey,3,4),/FINANCIAL_SHARING_DENIED/);
  assert.equal(await remove(itemId),false);
  await as(admin);
  assert.equal(await remove(itemId),true);
  assert.equal(await remove(itemId),false);
  assert.equal((await balances()).current_stock,'17');

  const rawDeleteId = (await entry('items',[{...splitItems[0],quantity:1},{...splitItems[0],quantity:2}])).rows[0].id;
  assert.equal((await balances()).current_stock,'20');
  await db.query('DELETE FROM purchases WHERE id=$1',[rawDeleteId]);
  assert.equal((await balances()).current_stock,'17');
  const oldKey = (await db.query('SELECT id FROM purchase_items WHERE purchase_id=$1',[legacy.rows[0].id])).rows[0].id;
  await editItem(oldKey,4,null);
  assert.deepEqual(await breakdown(legacy.rows[0].id),{amount:'6',cats:{'소모품':6}});
  // 과거 0.49원 두 줄(헤더 1원)은 수량을 수정해도 합계가 0원으로 줄지 않는다.
  const fractional = (await db.query("SELECT create_purchase_with_evidence($1,current_date,'QA-legacy','수기',$2) AS id",
    [store,JSON.stringify(['A','B'].map(name=>({name,quantity:1,unit_price:0.49,category:'소모품'})))])).rows[0].id;
  const fractionalLine = (await db.query("SELECT id FROM purchase_items WHERE purchase_id=$1 AND name='A'",[fractional])).rows[0].id;
  await editItem(fractionalLine,2,null);
  assert.deepEqual(await breakdown(fractional),{amount:'1',cats:{'소모품':1}});
  assert.equal((await db.query('SELECT bool_and(subtotal=round(subtotal)) AS exact FROM purchase_items WHERE purchase_id=$1',[fractional])).rows[0].exact,true);
  await as(outsider);
  await assert.rejects(entry('items',splitItems),/FINANCIAL_SHARING_DENIED/);
  assert.equal((await db.query('SELECT * FROM purchase_amount_lines WHERE purchase_id=$1',[amountId])).rows.length,0);
  await assert.rejects(edit(amountId,splitAmounts),/FINANCIAL_SHARING_DENIED/);
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
  await assert.rejects(entry('amounts',splitAmounts),/permission denied/);
  await db.exec('RESET ROLE');
  console.log('Purchase amount SQL passed: legacy RPCs, both entry modes, category totals, stock, edits, evidence, rollback and RLS.');
}
