// Local reduced schema only. No connection to production.
// get_my_store_bootstrap() must return exactly what the legacy 3-step load computed:
// owned stores + approved member stores (RLS-visible) + roles + financial access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const u = n => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const s = n => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;
const users = { owner: u(1), admin: u(2), regular: u(3), part: u(4), pending: u(5), rejected: u(6), outsider: u(7), multi: u(8) };
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function legacy(user) {
  const owned = (await as(user, 'SELECT * FROM stores WHERE owner_id=$1 ORDER BY created_at', [user])).rows;
  const member = (await as(user, `SELECT m.store_id, m.role, to_jsonb(st) AS store FROM store_members m
    LEFT JOIN stores st ON st.id=m.store_id WHERE m.user_id=$1 AND m.status='approved'`, [user])).rows;
  const roles = {}; const list = new Map(owned.map(r => [r.id, r]));
  for (const m of member) if (m.store) { roles[m.store_id] = m.role; if (!list.has(m.store_id)) list.set(m.store_id, m.store); }
  const ids = [...list.keys()];
  const access = Object.fromEntries((await as(user, 'SELECT * FROM get_my_store_financial_access($1)', [ids])).rows.map(r => [r.store_id, r.allowed === true]));
  return { ids: new Set(ids), roles, access };
}
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL, financial_share_scope text NOT NULL DEFAULT 'none',
      closing_time time DEFAULT '23:00', created_at timestamptz NOT NULL);
    CREATE TABLE store_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES stores(id), user_id uuid NOT NULL,
      role text NOT NULL, status text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(store_id,user_id));
    CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, user_id uuid, is_active boolean, employment_type text);
    CREATE FUNCTION is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS (SELECT 1 FROM stores WHERE id=sid AND owner_id=auth.uid() UNION SELECT 1 FROM store_members WHERE store_id=sid AND user_id=auth.uid() AND status='approved') $$;
    CREATE FUNCTION is_store_admin(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS (SELECT 1 FROM stores WHERE id=sid AND owner_id=auth.uid() UNION SELECT 1 FROM store_members WHERE store_id=sid AND user_id=auth.uid() AND role='admin' AND status='approved') $$;
    CREATE FUNCTION public.can_read_store_financials(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT auth.uid() IS NOT NULL AND (public.is_store_admin(p_store_id) OR EXISTS(SELECT 1 FROM public.stores s
      JOIN public.store_members m ON m.store_id=s.id AND m.user_id=auth.uid() AND m.status='approved'
      JOIN public.employees e ON e.store_id=s.id AND e.user_id=auth.uid() AND e.is_active AND e.employment_type IN ('regular','part_time')
      WHERE s.id=p_store_id AND (s.financial_share_scope='all_staff' OR (s.financial_share_scope='regular_only' AND e.employment_type='regular')))) $$;
    CREATE FUNCTION public.get_my_store_financial_access(p_store_ids uuid[]) RETURNS TABLE(store_id uuid,allowed boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT s,public.can_read_store_financials(s) FROM (SELECT DISTINCT unnest(p_store_ids) s) q WHERE cardinality(p_store_ids)<=100 AND public.is_store_member(s) $$;
    ALTER TABLE stores ENABLE ROW LEVEL SECURITY; ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view own stores" ON stores FOR SELECT USING ((SELECT auth.uid()) = owner_id);
    CREATE POLICY stores_select_member ON stores FOR SELECT USING (owner_id = (SELECT auth.uid()) OR is_store_member(id));
    CREATE POLICY store_members_select ON store_members FOR SELECT USING (user_id = (SELECT auth.uid()) OR store_id IN (SELECT id FROM stores WHERE owner_id=(SELECT auth.uid())) OR is_store_admin(store_id));
    GRANT SELECT ON stores, store_members TO authenticated;
    INSERT INTO stores VALUES
      ('${s(1)}','${users.owner}','본점','none','23:00','2026-01-01'),
      ('${s(2)}','${users.owner}','2호점','regular_only','02:00','2026-02-01'),
      ('${s(3)}','${users.multi}','남의 매장','all_staff','23:00','2026-03-01'),
      ('${s(4)}','${users.outsider}','외부 매장','all_staff','23:00','2026-04-01');
    INSERT INTO store_members(store_id,user_id,role,status) VALUES
      ('${s(1)}','${users.admin}','admin','approved'),
      ('${s(2)}','${users.regular}','member','approved'), ('${s(2)}','${users.part}','member','approved'),
      ('${s(2)}','${users.pending}','member','pending'), ('${s(1)}','${users.rejected}','member','rejected'),
      ('${s(1)}','${users.multi}','member','approved'), ('${s(2)}','${users.multi}','admin','approved'),
      ('${s(3)}','${users.owner}','member','approved');
    INSERT INTO employees(store_id,user_id,is_active,employment_type) VALUES
      ('${s(2)}','${users.regular}',true,'regular'), ('${s(2)}','${users.part}',true,'part_time'), ('${s(3)}','${users.owner}',true,'regular');`);
  const migration = await readFile(new URL('../supabase/migrations/20261118131000_store_bootstrap.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);

  for (const [name, user] of Object.entries(users)) {
    const expected = await legacy(user);
    const rows = (await as(user, 'SELECT * FROM get_my_store_bootstrap()')).rows;
    const ids = rows.map(r => r.store.id);
    assert.deepEqual(new Set(ids), expected.ids, `${name}: store set`);
    assert.equal(ids.length, new Set(ids).size, `${name}: no duplicates`);
    for (const r of rows) {
      assert.equal(r.member_role ?? undefined, expected.roles[r.store.id], `${name}: role ${r.store.name}`);
      assert.equal(r.financial_access, expected.access[r.store.id] === true, `${name}: access ${r.store.name}`);
    }
    const ownedIds = ids.filter(id => rows.find(r => r.store.id === id).store.owner_id === user);
    assert.deepEqual(ids.slice(0, ownedIds.length), ownedIds, `${name}: owned stores first`);
  }
  const owner = (await as(users.owner, 'SELECT * FROM get_my_store_bootstrap()')).rows;
  assert.deepEqual(owner.map(r => r.store.name), ['본점', '2호점', '남의 매장']);
  assert.deepEqual(Object.keys(owner[0].store).sort(), ['closing_time', 'created_at', 'financial_share_scope', 'id', 'name', 'owner_id']);
  assert.equal(owner[1].store.closing_time, '02:00:00');
  assert.equal((await as(users.outsider, 'SELECT * FROM get_my_store_bootstrap()')).rows.length, 1);
  assert.equal((await as(null, 'SELECT * FROM get_my_store_bootstrap()')).rows.length, 0);
  await db.exec('SET ROLE anon');
  await assert.rejects(() => db.query('SELECT * FROM get_my_store_bootstrap()'));
  await db.exec('RESET ROLE');
  console.log('Store bootstrap SQL: matches legacy owned/member/role/access load for 8 user shapes, owned-first order, anon rejected, replay-safe');
} finally { await db.close(); }
