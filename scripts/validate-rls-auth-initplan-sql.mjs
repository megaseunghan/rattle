// Local reduced schema only. No connection to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001', member = '00000000-0000-0000-0000-000000000002', outsider = '00000000-0000-0000-0000-000000000003';
const store = '00000000-0000-0000-0000-000000000010';
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
const policies = async () => (await db.query(`SELECT tablename, policyname, cmd, roles::text AS roles, permissive, qual, with_check
  FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`)).rows;
const bare = /(?<!SELECT )auth\.(uid|jwt|role|email)\(\)/;
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub', current_setting('request.jwt.claim.sub',true)) $$;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text);
    CREATE TABLE store_members(store_id uuid, user_id uuid, status text);
    CREATE TABLE home_alert_reads(store_id uuid, user_id uuid, alert_key text);
    CREATE TABLE already_wrapped(user_id uuid);
    CREATE TABLE helper_only(store_id uuid);
    CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
      $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM store_members WHERE store_id=s AND user_id=auth.uid() AND status='approved') $$;
    ALTER TABLE stores ENABLE ROW LEVEL SECURITY; ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE home_alert_reads ENABLE ROW LEVEL SECURITY; ALTER TABLE already_wrapped ENABLE ROW LEVEL SECURITY; ALTER TABLE helper_only ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
    CREATE POLICY "Users can view own stores" ON stores FOR SELECT USING (auth.uid() = owner_id);
    CREATE POLICY stores_select_member ON stores FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM store_members m WHERE m.store_id = stores.id AND m.user_id = auth.uid() AND m.status = 'approved'));
    CREATE POLICY "Users can update own stores" ON stores FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id AND name IS NOT NULL);
    CREATE POLICY store_members_select ON store_members FOR SELECT USING (user_id = auth.uid() OR (auth.jwt() ->> 'sub')::uuid = user_id);
    CREATE POLICY home_alert_reads_self_insert ON home_alert_reads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_store_member(store_id));
    CREATE POLICY already ON already_wrapped FOR SELECT USING (user_id = (SELECT auth.uid()));
    CREATE POLICY helper ON helper_only FOR SELECT USING (is_store_member(store_id));
    INSERT INTO stores VALUES('${store}','${owner}','매장');
    INSERT INTO store_members VALUES('${store}','${member}','approved');`);
  const before = await policies();
  const migration = await readFile(new URL('../supabase/migrations/20261118121000_rls_auth_initplan.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const forwardRepair = await readFile(new URL('../supabase/migrations/20261119120000_release_rls_auth_initplan.sql', import.meta.url), 'utf8');
  // A policy imported/applied after the original fix must also be repaired.
  await db.exec('ALTER POLICY already ON already_wrapped USING (user_id = auth.uid())');
  await db.exec(forwardRepair);
  const once = await policies();
  await db.exec(forwardRepair);
  assert.deepEqual(await policies(), once, 'migration replay must not change policies again');

  assert.equal(once.length, before.length);
  for (const [i, p] of once.entries()) {
    const b = before[i];
    for (const key of ['tablename', 'policyname', 'cmd', 'roles', 'permissive']) assert.equal(p[key], b[key], `${p.policyname} ${key}`);
    assert.equal(bare.test(p.qual ?? ''), false, `${p.policyname} USING still has bare auth call: ${p.qual}`);
    assert.equal(bare.test(p.with_check ?? ''), false, `${p.policyname} WITH CHECK still has bare auth call: ${p.with_check}`);
    assert.equal(p.qual === null, b.qual === null); assert.equal(p.with_check === null, b.with_check === null);
  }
  const byName = Object.fromEntries(once.map(p => [p.policyname, p]));
  assert.equal(byName.helper.qual, before.find(p => p.policyname === 'helper').qual, 'helper-only policy untouched');
  assert.equal(byName.already.qual, before.find(p => p.policyname === 'already').qual, 'already wrapped policy untouched');
  assert.match(byName['Users can update own stores'].with_check, /name IS NOT NULL/);

  assert.equal((await as(owner, 'SELECT id FROM stores')).rows.length, 1);
  assert.equal((await as(member, 'SELECT id FROM stores')).rows.length, 1);
  assert.equal((await as(outsider, 'SELECT id FROM stores')).rows.length, 0);
  assert.equal((await as(member, 'SELECT * FROM store_members')).rows.length, 1);
  assert.equal((await as(outsider, 'SELECT * FROM store_members')).rows.length, 0);
  assert.equal((await as(owner, "UPDATE stores SET name='새 이름' RETURNING id")).rows.length, 1);
  assert.equal((await as(member, "UPDATE stores SET name='침범' RETURNING id")).rows.length, 0);
  await assert.rejects(() => as(owner, 'UPDATE stores SET name=NULL'));
  await as(member, "INSERT INTO home_alert_reads VALUES($1,$2,'k')", [store, member]);
  await assert.rejects(() => as(member, "INSERT INTO home_alert_reads VALUES($1,$2,'k')", [store, owner]));
  await assert.rejects(() => as(outsider, "INSERT INTO home_alert_reads VALUES($1,$2,'k')", [store, outsider]));
  console.log('RLS auth initplan: wraps bare auth calls, keeps policy shape and access, replay-safe');
} finally { await db.close(); }
