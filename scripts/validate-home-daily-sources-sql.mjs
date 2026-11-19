// Local reduced schema only. No connection to production.
// get_home_daily_sources must equal the app's previous raw-row aggregation per business date.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001', outsider = '00000000-0000-0000-0000-000000000003';
const store = '00000000-0000-0000-0000-000000000010', other = '00000000-0000-0000-0000-000000000011';
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
// Same as lib/services/posAnalytics.getBusinessDayRange + homeFinancialTimeline range logic.
function range(month, through, closing, current, asOf) {
  const start = `${month}-01`, end = `${month}-${String(through).padStart(2, '0')}`;
  const at = d => new Date(`${d}T${closing.slice(0, 5)}:00+09:00`);
  const from = at(start).toISOString(), until = new Date(at(end).getTime() + 86_400_000).toISOString();
  const to = current ? new Date(Math.min(Date.parse(until), asOf.getTime())).toISOString() : until;
  return { start, end, from, to };
}
// Previous client aggregation (raw rows → DailyAmount rows), then grouped by date for comparison.
function legacy(orders, manual, purchases, r, closing) {
  const [hour, minute] = closing.slice(0, 5).split(':').map(Number);
  const rows = [
    ...(r.from < r.to ? orders.filter(o => o.store_id === store && o.status === 'COMPLETED' && o.order_at >= r.from && o.order_at < r.to) : [])
      .map(o => ({ date: new Date(Date.parse(o.order_at) + 9 * 3600000 - (hour * 60 + minute) * 60000).toISOString().slice(0, 10),
        revenue: o.card_amount + o.cash_amount > 0 ? o.card_amount + o.cash_amount : o.total_amount, purchase: 0, card: o.card_amount })),
    ...manual.filter(m => m.store_id === store && m.date >= r.start && m.date <= r.end).map(m => ({ date: m.date, revenue: m.card_amount + m.cash_amount, purchase: 0, card: m.card_amount })),
    ...purchases.filter(p => p.store_id === store && p.date >= r.start && p.date <= r.end).map(p => ({ date: p.date, revenue: 0, purchase: p.amount, card: 0 })),
  ];
  const byDate = {};
  for (const row of rows) { const t = byDate[row.date] ??= { revenue: 0, card: 0, purchase: 0 }; t.revenue += row.revenue; t.card += row.card; t.purchase += row.purchase; }
  return byDate;
}
const iso = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
let seed = 7; const rnd = n => { seed = (seed * 48271) % 2147483647; return seed % n; };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid);
    CREATE TABLE toss_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, order_at timestamptz, status text,
      total_amount numeric(12,0) NOT NULL DEFAULT 0, card_amount numeric(12,0) NOT NULL DEFAULT 0, cash_amount numeric(12,0) NOT NULL DEFAULT 0);
    CREATE TABLE manual_sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, date date, card_amount numeric(12,0) NOT NULL DEFAULT 0, cash_amount numeric(12,0) NOT NULL DEFAULT 0);
    CREATE TABLE purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, date date, amount numeric(12,0) NOT NULL DEFAULT 0);
    CREATE FUNCTION can_read(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) $$;
    ALTER TABLE toss_orders ENABLE ROW LEVEL SECURITY; ALTER TABLE manual_sales ENABLE ROW LEVEL SECURITY; ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
    CREATE POLICY o ON toss_orders FOR SELECT USING (can_read(store_id)); CREATE POLICY m ON manual_sales FOR SELECT USING (can_read(store_id));
    CREATE POLICY p ON purchases FOR SELECT USING (can_read(store_id));
    GRANT SELECT ON toss_orders, manual_sales, purchases TO authenticated;
    INSERT INTO stores VALUES ('${store}','${owner}'), ('${other}','${outsider}');`);
  const orders = [], manual = [], purchases = [];
  const base = Date.parse('2026-10-25T00:00:00Z');
  for (let i = 0; i < 400; i++) {
    const at = new Date(base + rnd(45 * 24 * 60) * 60000 + rnd(60) * 1000).toISOString();
    const card = [0, 0, 1000, 15500, 3300][rnd(5)], cash = [0, 0, 0, 7000][rnd(4)];
    orders.push({ store_id: rnd(6) === 0 ? other : store, order_at: at, status: rnd(8) === 0 ? 'CANCELLED' : 'COMPLETED', total_amount: [0, 9900, 12000][rnd(3)], card_amount: card, cash_amount: cash });
  }
  // Business-day boundaries exactly at closing time (23:00 / 02:00 KST)
  for (const at of ['2026-11-01T14:00:00.000Z', '2026-11-01T13:59:59.000Z', '2026-11-04T17:00:00.000Z', '2026-11-04T16:59:59.000Z', '2026-10-31T14:00:00.000Z'])
    orders.push({ store_id: store, order_at: at, status: 'COMPLETED', total_amount: 5000, card_amount: 5000, cash_amount: 0 });
  for (let i = 0; i < 60; i++) manual.push({ store_id: rnd(5) === 0 ? other : store, date: `2026-${rnd(2) ? '10' : '11'}-${String(1 + rnd(28)).padStart(2, '0')}`, card_amount: [0, 20000][rnd(2)], cash_amount: [0, 0, 5000][rnd(3)] });
  for (let i = 0; i < 60; i++) purchases.push({ store_id: rnd(5) === 0 ? other : store, date: `2026-${rnd(2) ? '10' : '11'}-${String(1 + rnd(28)).padStart(2, '0')}`, amount: [0, 12000, 87000][rnd(3)] });
  for (const o of orders) await db.query('INSERT INTO toss_orders(store_id,order_at,status,total_amount,card_amount,cash_amount) VALUES($1,$2,$3,$4,$5,$6)', [o.store_id, o.order_at, o.status, o.total_amount, o.card_amount, o.cash_amount]);
  for (const m of manual) await db.query('INSERT INTO manual_sales(store_id,date,card_amount,cash_amount) VALUES($1,$2,$3,$4)', [m.store_id, m.date, m.card_amount, m.cash_amount]);
  for (const p of purchases) await db.query('INSERT INTO purchases(store_id,date,amount) VALUES($1,$2,$3)', [p.store_id, p.date, p.amount]);

  const migration = await readFile(new URL('../supabase/migrations/20261118141000_home_daily_sources.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const call = (user, r, closing) => as(user, 'SELECT * FROM get_home_daily_sources($1,$2,$3,$4,$5,$6)',
    [store, r.start, r.end, r.from, r.to, Number(closing.slice(0, 2)) * 60 + Number(closing.slice(3, 5))]);
  const asOf = new Date('2026-11-18T05:30:00Z');
  let compared = 0;
  for (const closing of ['23:00', '02:00', '00:00', '05:30:00']) {
    for (const [month, through, current] of [['2026-11', 18, true], ['2026-10', 18, false], ['2026-10', 31, false]]) {
      const r = range(month, through, closing, current, asOf);
      const expected = legacy(orders, manual, purchases, r, closing);
      const rows = (await call(owner, r, closing)).rows;
      const actual = Object.fromEntries(rows.map(x => [iso(x.date),
        { revenue: Number(x.revenue), card: Number(x.card_revenue), purchase: Number(x.purchase) }]));
      assert.deepEqual(actual, expected, `${closing} ${month} through ${through}`);
      assert.deepEqual(rows.map(x => iso(x.date)), rows.map(x => iso(x.date)).sort(), 'ordered by date');
      compared += Object.keys(expected).length;
    }
  }
  const empty = range('2026-11', 18, '23:00', true, new Date('2026-10-01T00:00:00Z'));
  assert.ok(empty.from >= empty.to);
  const onlyBook = (await call(owner, empty, '23:00')).rows;
  assert.deepEqual(Object.keys(Object.fromEntries(onlyBook.map(x => [iso(x.date), 1]))).length, Object.keys(legacy(orders, manual, purchases, empty, '23:00')).length, 'no POS orders when from >= to');
  assert.equal((await call(outsider, range('2026-11', 18, '23:00', true, asOf), '23:00')).rows.length, 0, 'RLS hides other store data');
  await db.exec('SET ROLE anon');
  await assert.rejects(() => db.query('SELECT * FROM get_home_daily_sources($1,$2,$3,$4,$5,$6)', [store, '2026-11-01', '2026-11-18', asOf.toISOString(), asOf.toISOString(), 0]));
  await db.exec('RESET ROLE');
  console.log(`Home daily sources SQL: ${compared} business dates match legacy client aggregation across 4 closing times; RLS, anon, replay passed`);
} finally { await db.close(); }
