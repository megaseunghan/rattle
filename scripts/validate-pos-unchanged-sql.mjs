// 로컬 PGlite 전용. QA-POS-IO-20261117, 가상 매장/주문만 사용, 원격 연결 없음.
// --baseline demonstrates that the old function rewrites identical orders/items.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const user = '00000000-0000-0000-0000-000000000001';
const store = '00000000-0000-0000-0000-000000000002';
const other = '00000000-0000-0000-0000-000000000003';
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const migration = new URL('../supabase/migrations/20261117100000_pos_skip_unchanged.sql', import.meta.url);
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid,closing_time time,share boolean DEFAULT true);
    CREATE FUNCTION user_has_store_access(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) $$;
    CREATE FUNCTION can_read_store_financials(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid() AND share) $$;
    CREATE TABLE toss_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,toss_order_id text UNIQUE,order_at timestamptz,total_amount numeric,status text,card_amount numeric(12,0) NOT NULL DEFAULT 0,cash_amount numeric(12,0) NOT NULL DEFAULT 0);
    CREATE TABLE toss_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES toss_orders(id),store_id uuid,item_id text,item_name text,category_name text,quantity numeric,unit_price numeric,total_price numeric,option_choices jsonb);
    CREATE TABLE toss_catalog(store_id uuid,item_id text,category_name text,UNIQUE(store_id,item_id));
    CREATE TABLE qa_writes(table_name text,operation text);
    CREATE FUNCTION qa_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO qa_writes VALUES(TG_TABLE_NAME,TG_OP); RETURN NULL; END $$;
    CREATE TRIGGER qa_orders AFTER INSERT OR UPDATE OR DELETE ON toss_orders FOR EACH ROW EXECUTE FUNCTION qa_audit();
    CREATE TRIGGER qa_items AFTER INSERT OR UPDATE OR DELETE ON toss_order_items FOR EACH ROW EXECUTE FUNCTION qa_audit();
    INSERT INTO stores(id,owner_id,closing_time) VALUES('${store}','${user}','16:00'),('${other}','${user}','16:00');
    SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261023121000_pos_read_models.sql', import.meta.url), 'utf8'));
  const acl = async () => (await db.query("SELECT proacl::text acl FROM pg_proc WHERE oid='upsert_pos_order_batch(uuid,jsonb)'::regprocedure")).rows;
  const beforeAcl = await acl();
  if (!process.argv.includes('--baseline')) {
    await db.exec(await readFile(migration, 'utf8'));
    check(await acl(), beforeAcl, 'function ACL unchanged');
    await db.exec(await readFile(migration, 'utf8'));
    check(await acl(), beforeAcl, 'migration reapplication preserves ACL');
  }
  const batch = async (orders, s = store) => (await db.query('SELECT upsert_pos_order_batch($1,$2::jsonb) n', [s, JSON.stringify(orders)])).rows[0].n;
  const item = { itemId: 'QA-item', itemName: 'QA 메뉴', quantity: 1, unitPrice: 100, totalPrice: 100 };
  const order = id => ({ orderId: id, orderAt: '2026-11-17T01:00:00Z', totalAmount: 100, cardAmount: 100, cashAmount: 0, status: 'COMPLETED', items: [item] });
  const orders = [order('QA-a'), order('QA-b')];
  const snapshot = async table => (await db.query(`SELECT id,xmin::text xmin FROM ${table} ORDER BY id`)).rows;
  const writes = async () => (await db.query('SELECT table_name,operation,count(*)::int n FROM qa_writes GROUP BY 1,2 ORDER BY 1,2')).rows;
  const reset = () => db.exec('TRUNCATE qa_writes');
  check(await batch(orders), 2, 'processed count on insert');
  const masters = await snapshot('toss_orders'), details = await snapshot('toss_order_items');
  await reset();
  check(await batch(orders), 2, 'processed count remains 2 for no-op');
  check(await writes(), [], 'identical second batch has ZERO order/item DML');
  check(await snapshot('toss_orders'), masters, 'order xmin unchanged');
  check(await snapshot('toss_order_items'), details, 'item ID/xmin unchanged');

  orders[0] = { ...orders[0], status: 'REFUNDED', cardAmount: 0, cashAmount: 100 };
  await reset(); await batch(orders);
  check(await writes(), [{ table_name: 'toss_orders', operation: 'UPDATE', n: 1 }], 'only changed master updates');
  check(await snapshot('toss_order_items'), details, 'master change preserves details');
  const afterMaster = await snapshot('toss_orders');
  orders[0].items = [{ ...item, categoryName: 'QA 분류', optionChoices: ['extra'] }, item, item];
  await reset(); await batch(orders);
  check(await snapshot('toss_orders'), afterMaster, 'item-only change preserves order xmin');
  check(await writes(), [{ table_name: 'toss_order_items', operation: 'DELETE', n: 1 }, { table_name: 'toss_order_items', operation: 'INSERT', n: 3 }], 'only affected order details replaced');
  const afterItems = await snapshot('toss_order_items');
  orders[0].items.reverse();
  orders[1].items = [{ ...item, categoryName: '', optionChoices: [] }];
  await reset(); await batch(orders);
  check(await writes(), [], 'order-independent multiset and default values are no-ops');
  check(await snapshot('toss_order_items'), afterItems, 'reordering preserves detail identities');
  orders[0].items.pop();
  await reset(); await batch(orders);
  check((await writes()).length, 2, 'duplicate count matters');
  orders[0].items = [];
  await reset(); await batch(orders);
  check(await writes(), [{ table_name: 'toss_order_items', operation: 'DELETE', n: 2 }], 'empty list removes details');
  await reset(); await batch(orders);
  check(await writes(), [], 'empty list repeated is a no-op');

  // P3-01: one field at a time, then identical replay. A peer order stays in
  // each batch so the audit proves that unrelated masters/details are untouched.
  const masterUpdate = [{ table_name: 'toss_orders', operation: 'UPDATE', n: 1 }];
  const itemReplacement = [{ table_name: 'toss_order_items', operation: 'DELETE', n: 1 },
    { table_name: 'toss_order_items', operation: 'INSERT', n: 1 }];
  const masterChanges = {
    orderAt: '2026-11-17T02:00:00Z', totalAmount: 150,
    status: 'CANCELLED', cardAmount: 50, cashAmount: 50,
  };
  for (const [field, value] of Object.entries(masterChanges)) {
    const original = order(`QA-master-${field}`);
    await batch([original]);
    const changed = { ...original, [field]: value };
    await reset(); await batch([changed, orders[1]]);
    check(await writes(), masterUpdate, `master ${field} alone updates only one master`);
    const changedSnapshot = await snapshot('toss_orders');
    await reset(); await batch([changed, orders[1]]);
    check(await writes(), [], `master ${field} replay has zero DML`);
    check(await snapshot('toss_orders'), changedSnapshot, `master ${field} replay keeps xmin`);
  }
  const itemChanges = {
    itemId: 'QA-other-item', itemName: 'QA 다른 메뉴', categoryName: 'QA 분류',
    quantity: 2, unitPrice: 150, totalPrice: 175, optionChoices: ['extra'],
  };
  for (const [field, value] of Object.entries(itemChanges)) {
    const original = order(`QA-item-${field}`);
    await batch([original]);
    const changed = { ...original, items: [{ ...item, [field]: value }] };
    const masterSnapshot = await snapshot('toss_orders');
    await reset(); await batch([changed, orders[1]]);
    check(await writes(), itemReplacement, `item ${field} alone replaces only its order details`);
    check(await snapshot('toss_orders'), masterSnapshot, `item ${field} leaves masters unchanged`);
    const itemSnapshot = await snapshot('toss_order_items');
    await reset(); await batch([changed, orders[1]]);
    check(await writes(), [], `item ${field} replay has zero DML`);
    check(await snapshot('toss_order_items'), itemSnapshot, `item ${field} replay keeps ID/xmin`);
  }
  const nullable = order('QA-null-item');
  await batch([nullable]);
  for (const itemId of [null, 'QA-restored-item', null]) {
    nullable.items = [{ ...item, itemId }];
    await reset(); await batch([nullable]);
    check(await writes(), itemReplacement, `item_id transition to ${itemId} is detected`);
    await reset(); await batch([nullable]);
    check(await writes(), [], `item_id ${itemId} replay has zero DML`);
  }
  // Legacy nullable status is repaired once without replacing unchanged items.
  const legacy = order('QA-legacy-null');
  await batch([legacy]);
  await db.exec("UPDATE toss_orders SET status=NULL WHERE toss_order_id='QA-legacy-null'");
  await reset(); await batch([legacy]);
  check(await writes(), masterUpdate, 'legacy NULL status is restored once');
  await reset(); await batch([legacy]);
  check(await writes(), [], 'restored legacy status replay has zero DML');
  // Payment typmod matches 20260605_toss_orders_card_cash.sql. Fractions are
  // coerced before ON CONFLICT comparison; repeating them must stay a no-op.
  const rounded = { ...order('QA-numeric-12-0'), cardAmount: 100.4, cashAmount: 0.4 };
  await batch([rounded]);
  check((await db.query("SELECT card_amount::text card,cash_amount::text cash FROM toss_orders WHERE toss_order_id='QA-numeric-12-0'")).rows,
    [{ card: '100', cash: '0' }], 'actual numeric(12,0) rounds payment values');
  await reset(); await batch([rounded]);
  check(await writes(), [], 'numeric(12,0) fractional replay has zero DML');

  const matrixMasters = await snapshot('toss_orders');

  await assert.rejects(() => batch(orders, other), { code: '42501' }); checks++;
  check(await snapshot('toss_orders'), matrixMasters, 'cross-store collision leaves orders intact');
  const stable = await snapshot('toss_order_items');
  await assert.rejects(() => batch([order('QA-new'), { ...orders[1], items: [{ ...item, optionChoices: null }] }]), { code: '22023' }); checks++;
  check((await db.query("SELECT count(*)::int n FROM toss_orders WHERE toss_order_id='QA-new'")).rows[0].n, 0, 'invalid item rolls back entire batch');
  check(await snapshot('toss_order_items'), stable, 'rollback preserves details');
  await assert.rejects(() => batch(Array(501).fill(order('QA-limit'))), { code: '22023' }); checks++;
  await assert.rejects(() => batch([{ ...order('QA-limit'), items: Array(1001).fill(item) }]), { code: '22023' }); checks++;
  check(await batch([]), 0, 'empty batch return');
  await db.exec(`UPDATE stores SET share=false WHERE id='${store}'`);
  await assert.rejects(() => batch(orders), { code: '42501' }); checks++;
  await db.exec(`UPDATE stores SET share=true WHERE id='${store}'; SELECT set_config('request.jwt.claim.sub','',false)`);
  await assert.rejects(() => batch(orders), { code: '42501' }); checks++;
  await db.exec('SET ROLE anon');
  await assert.rejects(() => batch(orders), { code: '42501' }); checks++;
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated`);
  check(await batch(orders), 2, 'authenticated still has execution privilege');
  console.log(`POS unchanged SQL: ${checks} checks passed (local PGlite only)`);
} finally { await db.close(); }
