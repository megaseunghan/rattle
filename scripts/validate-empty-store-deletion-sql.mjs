// Local PGlite only: validates the migration without production credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const store = '00000000-0000-4000-8000-000000000003';
let checks = 0;

async function as(uid, sql) {
  await db.exec('BEGIN');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid]);
    await db.exec('SET LOCAL ROLE authenticated');
    const result = await db.query(sql, [store]);
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function rejects(uid, code) {
  await assert.rejects(as(uid, 'SELECT delete_empty_owned_store($1)'), error => error.message.includes(code));
  checks++;
  assert.equal((await db.query('SELECT count(*)::int AS count FROM stores')).rows[0].count, 1);
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid, toss_merchant_id text);
    CREATE TABLE store_members(store_id uuid REFERENCES stores(id) ON DELETE CASCADE, user_id uuid);
    CREATE TABLE store_taxonomies(store_id uuid REFERENCES stores(id) ON DELETE CASCADE, name text);
    CREATE TABLE purchases(store_id uuid REFERENCES stores(id) ON DELETE CASCADE);
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261028010000_delete_empty_owned_store.sql', import.meta.url), 'utf8'));
  await db.query('INSERT INTO stores VALUES($1,$2,NULL)', [store, owner]);
  await db.query("INSERT INTO store_taxonomies VALUES($1,'default')", [store]);

  await rejects(other, 'STORE_DELETE_OWNER_REQUIRED');
  await db.query('INSERT INTO store_members VALUES($1,$2)', [store, other]);
  await rejects(owner, 'STORE_DELETE_HAS_MEMBERS');
  await db.query('DELETE FROM store_members');
  await db.query('INSERT INTO purchases VALUES($1)', [store]);
  await rejects(owner, 'STORE_DELETE_HAS_DATA');
  await db.query('DELETE FROM purchases');
  await db.exec('CREATE TABLE future_records(store_id uuid REFERENCES stores(id) ON DELETE CASCADE);');
  await db.query('INSERT INTO future_records VALUES($1)', [store]);
  await rejects(owner, 'STORE_DELETE_HAS_DATA');
  await db.query('DELETE FROM future_records');
  await db.query("UPDATE stores SET toss_merchant_id='connected'");
  await rejects(owner, 'STORE_DELETE_POS_CONNECTED');
  await db.query('UPDATE stores SET toss_merchant_id=NULL');
  await as(owner, 'SELECT delete_empty_owned_store($1)');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM stores')).rows[0].count, 0);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM store_taxonomies')).rows[0].count, 0);
  checks += 2;
  console.log(`Empty store deletion SQL: ${checks} assertions passed`);
} finally {
  await db.close();
}
