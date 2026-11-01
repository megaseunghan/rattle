// Isolated synthetic PostgreSQL checks. No Supabase client, credentials, or remote writes.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
let checks = 0;
const sid = 'aaaaaaaa-0000-4000-8000-000000000001';
const admin = '11111111-0000-4000-8000-000000000001';
const regular = '22222222-0000-4000-8000-000000000001';
const partTime = '33333333-0000-4000-8000-000000000001';
const ingredient = 'aaaaaaaa-0000-4000-8000-000000000010';
const recipe = 'aaaaaaaa-0000-4000-8000-000000000020';
const line = 'aaaaaaaa-0000-4000-8000-000000000030';
const tables = ['employee_wage_history','employees','expenses','ingredients','manual_sales','payroll','purchase_items','purchases','recipe_ingredients','recipes','toss_order_items','toss_orders'];
const check = (value, message) => { assert.ok(value, message); checks++; };
async function identity(uid, role = 'authenticated') {
 await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE ${role};`);
}
async function rejects(sql, code = '42501') {
 let error;
 try { await db.exec(sql); } catch (e) { error = e; }
 check(error?.code === code, `expected ${code}, received ${error?.code ?? 'success'}`);
}
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
 CREATE FUNCTION public.is_store_admin(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(sid='${sid}' AND auth.uid()='${admin}',false) $$;
 CREATE FUNCTION public.is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(sid='${sid}' AND auth.uid() IN ('${admin}','${regular}','${partTime}'),false) $$;
 CREATE FUNCTION public.is_store_part_timer(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(sid='${sid}' AND auth.uid()='${partTime}',false) $$;
 CREATE FUNCTION public.can_manage_recipes(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT is_store_member(sid) AND NOT is_store_part_timer(sid) $$;
 CREATE TABLE ingredients(id uuid PRIMARY KEY,store_id uuid NOT NULL,name text,current_stock numeric,min_stock numeric,last_price numeric,category text,unit text,unit_volume numeric,unit_volume_unit text,updated_at timestamptz DEFAULT now());
 CREATE TABLE recipes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,name text,category text,selling_price numeric,cost numeric DEFAULT 0,margin_rate numeric DEFAULT 0);
 CREATE TABLE recipe_ingredients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,ingredient_id uuid REFERENCES ingredients(id),quantity numeric,unit text);
 INSERT INTO ingredients(id,store_id,name,current_stock,min_stock,last_price,category,unit) VALUES('${ingredient}','${sid}','재료',3,1,100,'식자재','kg');
 INSERT INTO recipes(id,store_id,name,selling_price) VALUES('${recipe}','${sid}','레시피',1000);
 INSERT INTO recipe_ingredients(id,recipe_id,ingredient_id,quantity) VALUES('${line}','${recipe}','${ingredient}',1);
 ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY; ALTER TABLE recipes ENABLE ROW LEVEL SECURITY; ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
 CREATE POLICY ingredients_member_all ON ingredients FOR ALL USING(is_store_member(store_id)) WITH CHECK(is_store_member(store_id));
 CREATE POLICY recipes_select ON recipes FOR SELECT USING(is_store_member(store_id));
 CREATE POLICY recipes_manage ON recipes FOR ALL USING(can_manage_recipes(store_id)) WITH CHECK(can_manage_recipes(store_id));
 CREATE POLICY recipes_member_insert ON recipes FOR INSERT WITH CHECK(is_store_member(store_id));
 CREATE POLICY recipes_member_update ON recipes FOR UPDATE USING(is_store_member(store_id));
 CREATE POLICY recipe_lines_read ON recipe_ingredients FOR SELECT USING(EXISTS(SELECT 1 FROM recipes WHERE id=recipe_id AND is_store_member(store_id)));
 CREATE POLICY recipe_lines_manage ON recipe_ingredients FOR ALL USING(EXISTS(SELECT 1 FROM recipes WHERE id=recipe_id AND can_manage_recipes(store_id))) WITH CHECK(EXISTS(SELECT 1 FROM recipes WHERE id=recipe_id AND can_manage_recipes(store_id)));`);
 for (const table of tables.filter(t => !['recipes','recipe_ingredients','ingredients'].includes(t))) await db.exec(`CREATE TABLE ${table}(id integer PRIMARY KEY); INSERT INTO ${table} VALUES(1);`);
 const rpcSource = await readFile(new URL('../supabase/migrations/20260609_stock_member_access.sql',import.meta.url),'utf8');
 for (const name of ['create_recipe_with_ingredients','update_recipe_full']) {
  const statement=rpcSource.match(new RegExp('CREATE OR REPLACE FUNCTION '+name+'\\([\\s\\S]+?\\$\\$;'))?.[0];
  assert.ok(statement, `RPC definition ${name}`); await db.exec(statement);
 }
 await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated;`);
 for (const file of ['20261101010000_revoke_client_truncate.sql','20261101011000_part_time_catalog_write_guards.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
 for (const table of tables) {
  for (const role of ['anon','authenticated']) {
   const { rows } = await db.query(`SELECT has_table_privilege('${role}','${table}','TRUNCATE') AS truncate,has_table_privilege('${role}','${table}','SELECT') AS read`);
   check(!rows[0].truncate, `${role} ${table}: TRUNCATE removed`); check(rows[0].read, `${role} ${table}: SELECT ACL preserved`);
  }
 }
 await identity(partTime);
 check((await db.query('SELECT * FROM recipes')).rows.length === 1, 'part-time recipe read');
 check((await db.query('SELECT * FROM recipe_ingredients')).rows.length === 1, 'part-time recipe lines read');
 await db.exec(`UPDATE ingredients SET current_stock=7,updated_at=now() WHERE id='${ingredient}'`);
 check(Number((await db.query('SELECT current_stock FROM ingredients')).rows[0].current_stock) === 7, 'quantity update');
 for (const patch of ["name='변경'",'last_price=200','min_stock=2',"category='다른분류'","unit='g'",'unit_volume=10',"unit_volume_unit='ml'",'current_stock=9,last_price=200']) await rejects(`UPDATE ingredients SET ${patch} WHERE id='${ingredient}'`);
 await rejects(`INSERT INTO ingredients(id,store_id,name) VALUES(gen_random_uuid(),'${sid}','금지')`);
 await rejects(`DELETE FROM ingredients WHERE id='${ingredient}'`);
 await rejects(`INSERT INTO recipes(id,store_id,name,selling_price) VALUES(gen_random_uuid(),'${sid}','금지',100)`);
 await db.exec(`UPDATE recipes SET name='금지' WHERE id='${recipe}'; DELETE FROM recipes WHERE id='${recipe}';`);
 check((await db.query('SELECT name FROM recipes')).rows[0].name === '레시피', 'part-time update/delete filtered by RLS');
 // Existing recipe RPCs run as the owner but must reject the original part-time caller.
 await rejects(`SELECT public.create_recipe_with_ingredients('${sid}','금지','분류',100,'[]'::jsonb)`, 'P0001');
 await rejects(`SELECT public.update_recipe_full('${recipe}','금지','분류',100,'[]'::jsonb)`, 'P0001');
 await rejects(`INSERT INTO recipe_ingredients(id,recipe_id,ingredient_id,quantity) VALUES(gen_random_uuid(),'${recipe}','${ingredient}',1)`);
 await db.exec(`UPDATE recipe_ingredients SET quantity=9 WHERE id='${line}'; DELETE FROM recipe_ingredients WHERE id='${line}';`);
 check(Number((await db.query('SELECT quantity FROM recipe_ingredients')).rows[0].quantity)===1,'part-time recipe line update/delete blocked');
 await rejects(`UPDATE ingredients SET store_id='bbbbbbbb-0000-4000-8000-000000000001' WHERE id='${ingredient}'`);
 // Inventory guard must hold even for a SECURITY DEFINER write using owner privileges.
 await identity(partTime,'postgres');
 for (const sql of [`UPDATE ingredients SET last_price=200 WHERE id='${ingredient}'`,`INSERT INTO ingredients(id,store_id,name) VALUES(gen_random_uuid(),'${sid}','우회')`,`DELETE FROM ingredients WHERE id='${ingredient}'`]) await rejects(sql);
 await identity(regular);
 await db.exec(`UPDATE recipes SET name='직원 수정' WHERE id='${recipe}'; UPDATE recipe_ingredients SET quantity=2 WHERE id='${line}'; UPDATE ingredients SET name='직원 재료' WHERE id='${ingredient}';`);
 check((await db.query('SELECT name FROM recipes')).rows[0].name === '직원 수정','regular write preserved');
 const made = (await db.query(`SELECT public.create_recipe_with_ingredients('${sid}','추가','분류',100,'[{"ingredient_id":"${ingredient}","quantity":1,"unit":"kg"}]'::jsonb) AS id`)).rows[0].id;
 check((await db.query('SELECT count(*)::int AS n FROM recipe_ingredients')).rows[0].n===2,'regular recipe RPC creates recipe and line');
 await db.exec(`SELECT public.update_recipe_full('${recipe}','직원 RPC 수정','분류',200,'[{"ingredient_id":"${ingredient}","quantity":2,"unit":"kg"}]'::jsonb)`);
 check((await db.query(`SELECT name FROM recipes WHERE id='${recipe}'`)).rows[0].name==='직원 RPC 수정','regular recipe update RPC preserved');
 await identity(admin); await db.exec(`DELETE FROM recipes WHERE id='${made}'`);
 check((await db.query('SELECT count(*)::int AS n FROM recipe_ingredients')).rows[0].n===1,'admin parent deletion cascades without guard regression');
 await db.exec(`UPDATE ingredients SET last_price=300 WHERE id='${ingredient}'`);
 check(Number((await db.query('SELECT last_price FROM ingredients')).rows[0].last_price)===300,'admin write preserved');
 await identity('44444444-0000-4000-8000-000000000001');
 check((await db.query('SELECT * FROM recipes')).rows.length===0,'nonmember read denied');
 await identity('', 'anon'); check((await db.query('SELECT * FROM recipes')).rows.length===0,'anonymous read denied');
 await db.exec('RESET ROLE');
 for (const table of tables) check((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count===1, `${table}: rows preserved`);
 console.log(`PASS: ${checks} synthetic catalog-permission SQL checks; no remote database accessed.`);
} finally { await db.close(); }
