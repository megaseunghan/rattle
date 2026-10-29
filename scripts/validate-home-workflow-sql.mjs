// Local reduced schema only. No connection to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001', member = '00000000-0000-0000-0000-000000000002', outsider = '00000000-0000-0000-0000-000000000003';
const store = '00000000-0000-0000-0000-000000000010', other = '00000000-0000-0000-0000-000000000011';
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid); CREATE TABLE members(store_id uuid,user_id uuid);
    CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) $$;
    CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT is_store_admin(s) OR EXISTS(SELECT 1 FROM members WHERE store_id=s AND user_id=auth.uid()) $$;
    INSERT INTO stores VALUES('${store}','${owner}'),('${other}','${outsider}'); INSERT INTO members VALUES('${store}','${member}');`);
  const migration = await readFile(new URL('../supabase/migrations/20261026180000_store_home_workflows.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const config = { open: ['stock', 'schedule'], business: [], close: ['close_check'] };
  await as(owner, 'INSERT INTO store_home_workflows(store_id,configuration) VALUES($1,$2)', [store, config]);
  assert.deepEqual((await as(member, 'SELECT configuration FROM store_home_workflows')).rows[0].configuration, config);
  assert.equal((await as(outsider, 'SELECT * FROM store_home_workflows')).rows.length, 0);
  assert.equal((await as(member, 'UPDATE store_home_workflows SET configuration=$1 RETURNING *', [config])).rows.length, 0);
  await assert.rejects(() => as(member, 'INSERT INTO store_home_workflows VALUES($1,$2)', [other, config]));
  await assert.rejects(() => as(owner, 'INSERT INTO store_home_workflows VALUES($1,$2)', [other, config]));
  for (const bad of [{ open: [], close: [] }, { open: ['stock', 'stock'], business: [], close: [] }, { open: [null], business: [], close: [] }, { open: ['unknown'], business: [], close: [] }]) {
    await assert.rejects(() => as(owner, 'UPDATE store_home_workflows SET configuration=$1 WHERE store_id=$2', [bad, store]));
  }
  const updated = { open: [], business: ['sales', 'purchase'], close: [] };
  await as(owner, 'INSERT INTO store_home_workflows(store_id,configuration) VALUES($1,$2) ON CONFLICT(store_id) DO UPDATE SET configuration=excluded.configuration', [store, updated]);
  assert.deepEqual((await as(member, 'SELECT configuration FROM store_home_workflows')).rows[0].configuration, updated);
  console.log('Home workflow: migration replay, validation, owner writes, member reads, foreign-store isolation passed');
} finally { await db.close(); }
