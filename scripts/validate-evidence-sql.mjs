// QA-EVIDENCE-20261114: reduced local schema only; no network or real data.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const db = new PGlite({ extensions: { pgcrypto } });
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const [admin, member, part, outsider, store, otherStore, purchase, expense, rule] = Array.from({length:9},(_,i)=>id(i+1));
let checks=0;
const ok = value => { assert.equal(value,true); ++checks; };
async function as(user) { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec('SET ROLE authenticated'); }
async function put(file, name) { return db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', ['transaction-evidence', `${store}/${file.id}/${name}`]); }
async function reserve(file, overrides={}) {
 const p={p_id:file,p_store_id:store,p_purchase_id:purchase,p_expense_id:null,p_rule_id:null,p_month:null,p_name:'QA-증빙.jpg',p_mime:'image/jpeg',...overrides};
 return (await db.query('SELECT reserve_transaction_evidence($1,$2,$3,$4,$5,$6,$7,$8) AS file',Object.values(p))).rows[0].file;
}
async function rejected(fn) { let failed=false; try { await fn(); } catch { failed=true; } ok(failed); }
try {
 await db.exec(`CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated; CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid, deleted_by uuid, deleted_at timestamptz,purge_after timestamptz,financial_share_scope text DEFAULT 'all_staff',attendance_share_scope text,payroll_share_scope text); CREATE TABLE purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,date date,supplier text,amount numeric,category text,type text,note text);
 CREATE TABLE ingredients(id uuid PRIMARY KEY,store_id uuid,current_stock numeric,last_price numeric,updated_at timestamptz);
 CREATE TABLE purchase_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_id uuid REFERENCES purchases(id),store_id uuid,ingredient_id uuid,name text,quantity numeric,unit text,unit_price numeric,subtotal numeric,category text);
 CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT s='${store}' AND auth.uid() IN ('${admin}','${member}','${part}') $$;
 CREATE FUNCTION map_purchase_category(category text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT category $$; CREATE TABLE expenses(id uuid PRIMARY KEY,store_id uuid);
 CREATE TABLE recurring_fixed_expenses(id uuid PRIMARY KEY,store_id uuid,source_expense_id uuid);
 CREATE TABLE employees(store_id uuid,user_id uuid,is_active boolean,employment_type text);
 CREATE TABLE store_members(store_id uuid,user_id uuid,status text);
 CREATE TABLE recurring_fixed_expense_versions(rule_id uuid,revision integer,effective_month text,active boolean,end_month text);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION storage.allow_any_operation(operations text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT current_setting('qa.storage_operation',true)=ANY(operations) $$;
 SELECT set_config('qa.storage_operation','object.upload',false);
 CREATE TABLE store_purge_failures(store_id uuid,sqlstate text,message text);
 CREATE TABLE payroll(store_id uuid); CREATE TABLE payroll_work_submissions(store_id uuid);
 CREATE TABLE payroll_daily_work_history(store_id uuid); CREATE TABLE payroll_daily_work(store_id uuid);
 CREATE TABLE storage.objects(version text,owner uuid REFERENCES auth.users,owner_id text,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text, UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE POLICY qa_broad_storage ON storage.objects FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
 CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT s='${store}' AND auth.uid() IN ('${admin}','${id(610)}') AND EXISTS(SELECT 1 FROM stores WHERE id=s AND deleted_at IS NULL) $$;
 CREATE FUNCTION is_store_part_timer(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()='${part}' $$;
 CREATE FUNCTION can_read_store_financials(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT s='${store}' AND auth.uid() IN ('${admin}','${member}','${part}') $$;
 CREATE FUNCTION create_purchase_with_items(p_store_id uuid,p_date date,p_supplier text,p_type text,p_items jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $body$
 DECLARE v_id uuid;
 BEGIN
 IF NOT can_read_store_financials(p_store_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 INSERT INTO purchases(id,store_id) VALUES(gen_random_uuid(),p_store_id) RETURNING id INTO v_id;
 END $body$;
 INSERT INTO stores(id) VALUES('${store}'),('${otherStore}'); INSERT INTO purchases(id,store_id) VALUES('${purchase}','${store}');
 INSERT INTO expenses VALUES('${expense}','${store}'); INSERT INTO recurring_fixed_expenses(id,store_id) VALUES('${rule}','${store}');
 INSERT INTO employees VALUES('${store}','${member}',true,'regular'),('${store}','${part}',true,'part_time');
 INSERT INTO store_members VALUES('${store}','${member}','approved'),('${store}','${part}','approved');
 INSERT INTO recurring_fixed_expense_versions VALUES('${rule}',1,'2026-11',true,'2026-12');
 GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
 GRANT SELECT ON storage.objects TO anon;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 GRANT SELECT ON purchases TO authenticated;
 `);
 const integritySql = await readFile(new URL('../supabase/migrations/20261020_01_access_and_purchase_integrity.sql',import.meta.url),'utf8');
 await db.exec(integritySql.slice(integritySql.indexOf('CREATE OR REPLACE FUNCTION public.validate_purchase_item_store'),integritySql.indexOf('CREATE OR REPLACE FUNCTION public.create_purchase_with_items')));
 await db.exec(await readFile(new URL('../supabase/migrations/20261114025150_transaction_evidence.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261114025338_transaction_evidence_privileges.sql',import.meta.url),'utf8'));
 ok(!(await db.query("SELECT has_table_privilege('anon','public.transaction_evidence','TRUNCATE') AS allowed")).rows[0].allowed);
 ok(!(await db.query("SELECT has_table_privilege('authenticated','public.transaction_evidence','INSERT,UPDATE,TRUNCATE,TRIGGER') AS allowed")).rows[0].allowed);
 const softDelete = await readFile(new URL('../supabase/migrations/20261114120000_store_soft_delete.sql',import.meta.url),'utf8');
 await db.exec(softDelete.slice(softDelete.indexOf('CREATE OR REPLACE FUNCTION public.deleted_store_ids'),softDelete.indexOf('CREATE OR REPLACE FUNCTION public.guard_deleted_store_row')));
 await db.exec(await readFile(new URL('../supabase/migrations/20261119140000_evidence_review_fixes.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[id(981),id(982)]);
 await db.query("INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('transaction-evidence','legacy-proof',$1,$1::uuid::text),('other','keep',$2,$2::uuid::text)",[id(981),id(982)]);
 // Test doubles never enqueue network traffic. Missing dependencies must roll back installation.
 const reviewMigration = await readFile(new URL('../supabase/migrations/20261119141000_evidence_cleanup_purchase_rpc.sql',import.meta.url),'utf8');
 async function installationFails(pattern) {
   await assert.rejects(db.exec(reviewMigration), pattern);
   await db.exec('ROLLBACK');
   ok((await db.query("SELECT to_regclass('private.evidence_purge_requests') IS NULL AS absent")).rows[0].absent);
 }
 await installationFails(/EVIDENCE_PURGE_PG_NET_AND_PGCRYPTO_REQUIRED/);
 await db.exec(`
   CREATE SCHEMA extensions;
   CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
   CREATE SCHEMA net;
   CREATE TABLE net._http_response(id bigint,status_code int,timed_out boolean,error_msg text);
   CREATE TABLE net.test_queue(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb);
   CREATE FUNCTION net.http_post(url text,body jsonb,params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds int DEFAULT 1000)
   RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.test_queue(url,headers) VALUES($1,$4) RETURNING id $$;
   CREATE SCHEMA vault;
   CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
 `);
 await installationFails(/EVIDENCE_PURGE_VAULT_CONFIGURATION_REQUIRED/);
 await db.exec(`INSERT INTO vault.decrypted_secrets VALUES('evidence_project_url','https://qa.invalid'),('evidence_purge_token','qa-secret')`);
 await installationFails(/cron.job|schema "cron" does not exist/);
 await db.exec(`
   CREATE SCHEMA cron;
   CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,command text,active boolean DEFAULT true,
     database text DEFAULT current_database(),username name DEFAULT current_user);
   CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
     INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING 1::bigint $$;
 `);
 await installationFails(/EVIDENCE_DAILY_PURGE_JOB_REQUIRED/);
 await db.exec("INSERT INTO cron.job(jobname,schedule,command,active) VALUES('rattle-purge-deleted-stores','17 3 * * *','SELECT public.purge_expired_deleted_stores()',false)");
 await installationFails(/EVIDENCE_DAILY_PURGE_JOB_REQUIRED/);
 await db.exec('UPDATE cron.job SET active=true');
 await db.exec(reviewMigration);
 const jobs=(await db.query('SELECT jobname,schedule,command FROM cron.job')).rows;
 assert.deepEqual(Object.fromEntries(jobs.map(j=>[j.jobname,j.schedule])),{
   'rattle-purge-deleted-stores':'17 3 * * *',
   'rattle-expired-evidence-storage':'27 3 * * *',
   'rattle-evidence-storage-results':'30,45 3 * * *',
 });
 const dispatchJob=jobs.find(j=>j.jobname==='rattle-expired-evidence-storage').command;
 const resultsJob=jobs.find(j=>j.jobname==='rattle-evidence-storage-results').command;
 await db.query('DELETE FROM auth.users WHERE id=$1',[id(981)]);
 ok((await db.query("SELECT id FROM storage.objects WHERE name='legacy-proof' AND owner IS NULL AND owner_id IS NULL")).rows.length===1);
 await rejected(()=>db.query('DELETE FROM auth.users WHERE id=$1',[id(982)]));
 await db.exec("DELETE FROM storage.objects WHERE name IN ('keep','legacy-proof')");
 const policyExpressions = (await db.query(
   "SELECT qual,with_check FROM pg_policies WHERE tablename='transaction_evidence' OR (schemaname='storage' AND policyname LIKE 'evidence_%')"
 )).rows;
 for (const policy of policyExpressions) {
   ok(!/(?<!select\s+)auth\.uid\(\)/i.test([policy.qual, policy.with_check].join(' ')));
 }
 const visibility = await readFile(new URL('../supabase/migrations/20261117160000_store_visibility.sql',import.meta.url),'utf8');
 await db.exec('DROP FUNCTION can_read_store_financials(uuid)');
 await db.exec(visibility.slice(visibility.indexOf('CREATE OR REPLACE FUNCTION private.can_read_shared_domain'),visibility.indexOf('CREATE OR REPLACE FUNCTION public.can_read_other_attendance')));
 await as(admin);
 const row=await reserve(id(20)); ok(row.status==='pending');
 ok((await reserve(id(20))).id===row.id); // Lost reservation response remains idempotent.
 await rejected(()=>db.query('SELECT finish_transaction_evidence($1)',[row.id]));
 const base=`${store}/${row.id}/`;
 await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2),($1,$3)',['transaction-evidence',base+'image.jpg',base+'thumb.jpg']);
 await db.query('SELECT finish_transaction_evidence($1)',[row.id]);
 ok((await db.query('SELECT status FROM transaction_evidence WHERE id=$1',[row.id])).rows[0].status==='ready');
 await db.query('SELECT finish_transaction_evidence($1)',[row.id]); // Lost finish response.
 for (const operation of ['object.sign','object.sign_many','object.list']) {
   await db.query("SELECT set_config('qa.storage_operation',$1,false)",[operation]);
   ok((await db.query('SELECT id FROM storage.objects')).rows.length===0);
 }
 await db.exec("SELECT set_config('qa.storage_operation','object.delete_many',false)");
 ok((await db.query("DELETE FROM storage.objects WHERE name=$1 RETURNING id",[base+'image.jpg'])).rows.length===0);
 await rejected(()=>db.query('UPDATE storage.objects SET name=name WHERE name=$1 RETURNING id',[base+'image.jpg']).then(r=>{ if (!r.rows.length) throw Error('Denied'); }));
 await rejected(()=>db.query('SELECT begin_pending_evidence_discard($1)',[row.id]));
 ok((await db.query('SELECT status FROM transaction_evidence WHERE id=$1',[row.id])).rows[0].status==='ready');
 await rejected(()=>reserve(id(21),{p_store_id:otherStore}));
 await db.exec('RESET ROLE; SET ROLE anon');
 ok((await db.query('SELECT * FROM storage.objects')).rows.length===0);
 for (const share of ['none','regular_only','all_staff']) {
   await db.exec('RESET ROLE');
   await db.query('UPDATE stores SET financial_share_scope=$1 WHERE id=$2',[share,store]);
   for (const user of [admin,id(610),member,part]) {
     await as(user);
     const manager = user===admin || user===id(610);
     const canRead = manager || share==='all_staff' || (share==='regular_only' && user===member);
     ok(((await db.query('SELECT id FROM transaction_evidence')).rows.length===1)===canRead);
     ok(((await db.query('SELECT id FROM storage.objects')).rows.length===2)===canRead);
     ok((await db.query('SELECT evidence_target_access($1,$2,NULL,NULL,NULL,true) AS allowed',[store,purchase])).rows[0].allowed===(canRead && user!==part));
     ok((await db.query('SELECT evidence_target_access($1,NULL,$2,NULL,NULL,true) AS allowed',[store,expense])).rows[0].allowed===manager);
   }
 }
 await db.exec('RESET ROLE'); await db.query('UPDATE stores SET deleted_at=now() WHERE id=$1',[store]);
 await as(admin);
 ok((await db.query('SELECT id FROM transaction_evidence')).rows.length===0);
 ok((await db.query('SELECT id FROM storage.objects')).rows.length===0);
 await rejected(()=>reserve(id(619)));
 await db.exec('RESET ROLE'); await db.query('UPDATE stores SET deleted_at=NULL WHERE id=$1',[store]);
 await as(outsider); ok((await db.query('SELECT * FROM transaction_evidence')).rows.length===0);
 ok((await db.query('SELECT * FROM storage.objects')).rows.length===0);
 await rejected(()=>reserve(id(21)));
 await as(part); await rejected(()=>reserve(id(21)));
 ok((await db.query("SELECT get_evidence_for_parent_delete('expense',$1) AS files",[expense])).rows[0].files.length===0);
 await as(member); ok((await db.query('SELECT * FROM transaction_evidence')).rows.length===1);
 await rejected(()=>reserve(id(21),{p_purchase_id:null,p_expense_id:expense}));
 await rejected(()=>reserve(id(21),{p_purchase_id:null,p_rule_id:rule,p_month:'2026-11'}));
 await rejected(()=>reserve(id(20))); // Other uploader may not take over a pending ID.
 await rejected(()=>db.query('SELECT begin_pending_evidence_discard($1)',[id(20)]));
 await reserve(id(22));
 await db.query('SELECT begin_pending_evidence_discard($1)',[id(22)]);
 ok((await db.query('SELECT status FROM transaction_evidence WHERE id=$1',[id(22)])).rows[0].status==='discarding');
 await as(admin);
 ok((await db.query('SELECT * FROM transaction_evidence')).rows.length===2); // Admin can clean abandoned reservations.
 await reserve(id(30),{p_purchase_id:null,p_expense_id:expense,p_mime:'application/pdf'});
 await reserve(id(31),{p_purchase_id:null,p_rule_id:rule,p_month:'2026-11'});
 await reserve(id(32),{p_purchase_id:null,p_rule_id:rule,p_month:'2026-12'});
 await rejected(()=>reserve(id(33),{p_purchase_id:null,p_rule_id:rule,p_month:null}));
 await rejected(()=>reserve(id(33),{p_purchase_id:null,p_rule_id:rule,p_month:'2026-10'}));
 await rejected(()=>reserve(id(33),{p_purchase_id:null,p_rule_id:rule,p_month:'2027-01'}));
 await rejected(()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('transaction-evidence','malformed/path')"));
 for(let n=40;n<48;n++) await reserve(id(n)); // 1 ready + 1 other pending + 8 pending = 10
 await rejected(()=>reserve(id(48)));
 await db.query('SELECT begin_pending_evidence_discard($1)',[id(40)]);
 await db.query('SELECT discard_transaction_evidence_metadata($1)',[id(40)]);
 ok((await reserve(id(48))).status==='pending');
 const created=(await db.query("SELECT create_purchase_with_evidence($1,'2026-11-14','QA-supplier','수기', '[{\"name\":\"QA-item\",\"quantity\":2,\"unit_price\":3,\"category\":\"기타\"}]'::jsonb) AS id",[store])).rows[0].id;
 ok(typeof created==='string' && (await db.query('SELECT id FROM purchases WHERE id=$1',[created])).rows.length===1);
 await as(outsider); await rejected(()=>db.query("SELECT create_purchase_with_evidence($1,'2026-11-14','','', '[{\"name\":\"QA-item\",\"quantity\":2,\"unit_price\":3,\"category\":\"기타\"}]'::jsonb)",[store]));
 await db.exec('RESET ROLE');
 ok((await db.query("SELECT public FROM storage.buckets WHERE id='transaction-evidence'")).rows[0].public===false);
 await as(admin);
 await rejected(()=>db.query('SELECT discard_transaction_evidence_metadata($1)',[id(20)]));
 ok((await db.query("SELECT * FROM get_evidence_for_parent_delete('purchase',$1)",[purchase])).rows.length===1);
 await db.exec('RESET ROLE');
 await rejected(()=>db.query('DELETE FROM purchases WHERE id=$1',[purchase]));
 await rejected(()=>db.query('DELETE FROM expenses WHERE id=$1',[expense]));
 await rejected(()=>db.query('DELETE FROM recurring_fixed_expenses WHERE id=$1',[rule]));
 await rejected(()=>db.query('DELETE FROM stores WHERE id=$1',[store]));
 // Simulate a legacy financial-access helper that admits an unlinked approved member.
 await db.exec(`CREATE OR REPLACE FUNCTION can_read_store_financials(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_store_id='${store}' AND auth.uid() IS NOT NULL $$;`);
 await as(id(99));
 await rejected(()=>reserve(id(98)));
 await rejected(()=>db.query('SELECT discard_transaction_evidence_metadata($1)',[id(20)]));
 ok((await db.query("DELETE FROM storage.objects WHERE bucket_id='transaction-evidence' RETURNING id")).rows.length===0);
 ok(!(await db.query('SELECT evidence_target_access($1,$2,NULL,NULL,NULL,true) AS allowed',[store,purchase])).rows[0].allowed);
 await as(member);
 ok((await db.query('SELECT evidence_target_access($1,$2,NULL,NULL,NULL,true) AS allowed',[store,purchase])).rows[0].allowed);
 await rejected(()=>db.query("SELECT get_evidence_for_parent_delete('purchase',$1)",[purchase]));
 await db.exec('RESET ROLE'); await db.query('UPDATE employees SET is_active=false WHERE user_id=$1',[member]);
 await as(member);
 ok(!(await db.query('SELECT evidence_target_access($1,$2,NULL,NULL,NULL,true) AS allowed',[store,purchase])).rows[0].allowed);
 await as(admin);
 await db.query('SELECT begin_ready_evidence_delete($1)',[id(20)]);
 await rejected(()=>db.query('SELECT finish_transaction_evidence($1)',[id(20)]));
 await db.query("DELETE FROM storage.objects WHERE bucket_id='transaction-evidence' AND name LIKE $1",[`${store}/${id(20)}/%`]);
 const proofs=(await db.query("SELECT get_evidence_for_parent_delete('purchase',$1) AS proofs",[purchase])).rows[0].proofs;
 for(const file of proofs) {
   if (file.status==='pending') await db.query('SELECT begin_pending_evidence_discard($1)',[file.id]);
   await db.query('SELECT discard_transaction_evidence_metadata($1)',[file.id]);
 }
 await db.exec('RESET ROLE');await db.query('DELETE FROM purchases WHERE id=$1',[purchase]);
 ok((await db.query('SELECT id FROM purchases WHERE id=$1',[purchase])).rows.length===0);

 // Single write implementation: void compatibility wrapper must insert exactly once.
 await as(admin);
 const beforeCount = (await db.query('SELECT count(*)::int AS n FROM purchases')).rows[0].n;
 await db.query("SELECT create_purchase_with_items($1,'2026-11-14','QA-legacy','수기','[{\"name\":\"QA-item\",\"quantity\":2,\"unit_price\":3}]'::jsonb)",[store]);
 ok((await db.query('SELECT count(*)::int AS n FROM purchases')).rows[0].n === beforeCount + 1);
 ok((await db.query("SELECT amount FROM purchases WHERE supplier='QA-legacy'")).rows[0].amount === '6');
 await rejected(()=>db.query("SELECT create_purchase_with_items($1,'2026-11-14','','','[]'::jsonb)",[store]));
 await rejected(()=>db.query("SELECT create_purchase_with_evidence($1,'2026-11-14','','','[]'::jsonb)",[store]));
 await as(outsider);
 await rejected(()=>db.query("SELECT create_purchase_with_items($1,'2026-11-14','','','[]'::jsonb)",[store]));
 // Cleanup claim prevents concurrent finish and subsequent Storage writes; file absence remains mandatory.
 await as(admin);
 ok(!(await db.query("SELECT has_function_privilege('anon','public.begin_pending_evidence_discard(uuid)','EXECUTE') AS allowed")).rows[0].allowed);
 const cleanup = await reserve(id(900), { p_purchase_id: created });
 await put(cleanup, 'image.jpg');
 await db.query('SELECT begin_pending_evidence_discard($1)',[cleanup.id]);
 ok((await db.query('SELECT status FROM transaction_evidence WHERE id=$1',[cleanup.id])).rows[0].status === 'discarding');
 await rejected(()=>db.query('SELECT finish_transaction_evidence($1)',[cleanup.id]));
 await rejected(()=>put(cleanup,'thumb.jpg'));
 await rejected(()=>db.query('SELECT discard_transaction_evidence_metadata($1)',[cleanup.id]));
 await db.query("DELETE FROM storage.objects WHERE bucket_id='transaction-evidence' AND name LIKE $1",[`${store}/${cleanup.id}/%`]);
 await db.query('SELECT discard_transaction_evidence_metadata($1)',[cleanup.id]);
 ok((await db.query('SELECT count(*)::int AS n FROM transaction_evidence WHERE id=$1',[cleanup.id])).rows[0].n===0);


 // Exercise linked ingredient stock, legacy-wrapper delegation and trigger rollback.
 await db.exec('RESET ROLE');
 await db.query('INSERT INTO ingredients(id,store_id,current_stock,last_price) VALUES($1,$2,10,1),($3,$4,20,1)',[id(910),store,id(911),otherStore]);
 await as(admin);
 const items=JSON.stringify([{name:'QA-stock',ingredient_id:id(910),quantity:2,unit_price:3}]);
 await db.query("SELECT create_purchase_with_evidence($1,'2026-11-14','QA-stock-new','수기',$2::jsonb)",[store,items]);
 await db.query("SELECT create_purchase_with_items($1,'2026-11-14','QA-stock-old','수기',$2::jsonb)",[store,items]);
 await db.exec('RESET ROLE');
 const stock=(await db.query('SELECT current_stock,last_price FROM ingredients WHERE id=$1',[id(910)])).rows[0];
 ok(stock.current_stock==='14' && stock.last_price==='3');
 const countBeforeInvalid=(await db.query('SELECT count(*)::int AS n FROM purchases')).rows[0].n;
 await as(admin);
 for (const bad of [{name:'QA-other',ingredient_id:id(911),quantity:1,unit_price:1},{name:'QA-zero',quantity:0,unit_price:1}]) {
   await rejected(()=>db.query("SELECT create_purchase_with_evidence($1,'2026-11-14','QA-invalid','수기',$2::jsonb)",[store,JSON.stringify([bad])]));
   await rejected(()=>db.query("SELECT create_purchase_with_items($1,'2026-11-14','QA-invalid','수기',$2::jsonb)",[store,JSON.stringify([bad])]));
 }
 ok((await db.query('SELECT count(*)::int AS n FROM purchases')).rows[0].n===countBeforeInvalid);
 // Canonical function body retains the existing purchase validation/stock loop exactly.
 const priorSql = await readFile(new URL('../supabase/migrations/20261020_01_access_and_purchase_integrity.sql',import.meta.url),'utf8');
 const nextSql = await readFile(new URL('../supabase/migrations/20261119141000_evidence_cleanup_purchase_rpc.sql',import.meta.url),'utf8');
 const body = (sql, name) => sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`)[1].split('AS $$')[1].split('END $$;')[0];
 const normalize = value => value.replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim();
 const core = body(nextSql,'create_purchase_with_evidence').replace(/IF NOT coalesce\(public.can_read_store_financials\(p_store_id\),false\) THEN RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501'; END IF;/,'').replace('RETURN v_id;','');
 ok(normalize(core) === normalize(body(priorSql,'create_purchase_with_items')));
 const wrapper = (await db.query("SELECT prosrc FROM pg_proc WHERE oid='public.create_purchase_with_items(uuid,date,text,text,jsonb)'::regprocedure")).rows[0].prosrc;
 ok(wrapper.includes('PERFORM public.create_purchase_with_evidence(') && !wrapper.includes('INSERT INTO'));
 await db.exec('RESET ROLE');
 await db.query("INSERT INTO stores(id,deleted_at,purge_after) VALUES($1,now(),now()+interval '1 day')",[id(990)]);
 await db.query('UPDATE stores SET deleted_at=NULL WHERE id=$1',[id(990)]);
 await db.query('INSERT INTO expenses VALUES($1,$2)',[id(991),id(990)]);
 await db.query("INSERT INTO transaction_evidence(id,store_id,expense_id,name,mime_type,created_by) VALUES($1,$2,$3,'receipt','image/jpeg',$4)",[id(992),id(990),id(991),id(982)]);
 await db.query('UPDATE stores SET deleted_at=now() WHERE id=$1',[id(990)]);
 await db.query("INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('transaction-evidence',$1,$2,$2::uuid::text)",[id(990)+'/proof/image.jpg',id(982)]);
 ok((await db.query("SELECT owner,owner_id FROM storage.objects WHERE name=$1",[id(990)+'/proof/image.jpg'])).rows.every(r=>r.owner===null && r.owner_id===null));
 ok((await db.query('SELECT * FROM claim_expired_evidence_paths()')).rows.length===0);
 await db.query("UPDATE stores SET purge_after=now()-interval '1 second' WHERE id=$1",[id(990)]);
 ok((await db.query('SELECT * FROM claim_expired_evidence_paths()')).rows.length===1);
 ok((await db.query('SELECT * FROM claim_expired_evidence_paths()')).rows.length===0);
 ok((await db.query('SELECT purge_expired_deleted_stores() AS n')).rows[0].n===0);
 const expiredPath=id(990)+'/proof/image.jpg';
 await db.query("DELETE FROM storage.objects WHERE name=$1",[expiredPath]);
 const record=outcome => db.query('SELECT record_evidence_purge_result($1,$2)',[expiredPath,outcome]);
 for (const outcome of ['failed','unknown']) {
   await record(outcome);
   ok((await db.query('SELECT purge_expired_deleted_stores() AS n')).rows[0].n===0);
   ok((await db.query('SELECT id FROM transaction_evidence WHERE id=$1',[id(992)])).rows.length===1);
   await db.exec("UPDATE private.evidence_purge_attempts SET attempted_at=now()-interval '24 hours'");
   ok((await db.query('SELECT claim_expired_evidence_paths() AS path')).rows[0].path===expiredPath);
 }

 // Capture per-request outcomes including a lost pg_net response.
 for (let i=0;i<4;++i) await db.query('SELECT private.dispatch_evidence_purge()');
 const header=(await db.query("SELECT headers->>'x-evidence-purge-token' AS token FROM net.test_queue ORDER BY id LIMIT 1")).rows[0].token;
 const [issued,signature]=header.split('.');
 ok(signature===createHmac('sha256','qa-secret').update('evidence-purge:'+issued).digest('hex'));
 await db.exec(`INSERT INTO net._http_response VALUES(1,204,false,NULL),(2,503,false,NULL),(3,NULL,true,NULL);
   UPDATE private.evidence_purge_requests SET queued_at=now()-interval '3 minutes' WHERE request_id=4;
   SELECT private.check_evidence_purge_responses();`);
 assert.deepEqual((await db.query('SELECT result FROM private.evidence_purge_requests ORDER BY request_id')).rows.map(r=>r.result),
   ['success','failed','timeout','missing']);
 // Yesterday's missing HTTP receipt does not suppress today's dispatch. The
 // two result polls can reconcile a late response without queuing another request.
 await db.exec("UPDATE private.evidence_purge_requests SET queued_at=now()-interval '1 day'");
 await db.exec(dispatchJob);
 ok((await db.query('SELECT count(*)::int AS n FROM net.test_queue')).rows[0].n===5);
 await db.exec("UPDATE private.evidence_purge_requests SET queued_at=now()-interval '3 minutes' WHERE request_id=5");
 await db.exec(resultsJob);
 ok((await db.query('SELECT result FROM private.evidence_purge_requests WHERE request_id=5')).rows[0].result==='missing');
 await db.exec('INSERT INTO net._http_response VALUES(5,204,false,NULL)');
 await db.exec(resultsJob);
 ok((await db.query('SELECT result FROM private.evidence_purge_requests WHERE request_id=5')).rows[0].result==='success');
 ok((await db.query('SELECT count(*)::int AS n FROM net.test_queue')).rows[0].n===5);
 await db.exec("UPDATE private.evidence_purge_requests SET queued_at=now()-interval '31 days' WHERE request_id IN (1,2)");
 await db.exec(resultsJob);
 assert.deepEqual((await db.query('SELECT request_id::int AS id FROM private.evidence_purge_requests ORDER BY request_id')).rows.map(r=>r.id),[2,3,4,5]);

 // An unconfirmed path from yesterday still receives a slot with 100 newer paths.
 await db.exec('BEGIN');
 await db.query("UPDATE private.evidence_purge_attempts SET attempted_at=now()-interval '1 day' WHERE path=$1",[expiredPath]);
 await db.query("INSERT INTO stores(id,deleted_at,purge_after) VALUES($1,now()-interval '8 days',now()-interval '1 hour')",[id(998)]);
 await db.query("INSERT INTO storage.objects(bucket_id,name) SELECT 'transaction-evidence',$1::text||'/file-'||i FROM generate_series(1,100) i",[id(998)]);
 const batch=(await db.query('SELECT claim_expired_evidence_paths() AS path')).rows;
 ok(batch.length===100 && batch.some(row=>row.path===expiredPath));
 await db.exec('ROLLBACK');
 const automaticPath=id(990)+'/another/image.jpg';
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('transaction-evidence',$1)",[automaticPath]);
 ok((await db.query('SELECT claim_expired_evidence_paths() AS path')).rows[0].path===automaticPath);
 await db.query('DELETE FROM storage.objects WHERE name=$1',[automaticPath]);
 await db.query("SELECT record_evidence_purge_result($1,'confirmed')",[automaticPath]);
 ok((await db.query('SELECT purge_expired_deleted_stores() AS n')).rows[0].n===0);
 const operatorSql='SELECT private.confirm_reconciled_evidence_purge($1,$2,$3,$4,$5)';
 const object=(await db.query('SELECT object_id,object_version FROM private.evidence_purge_attempts WHERE path=$1',[expiredPath])).rows[0];
 const args=[id(990),expiredPath,object.object_id,object.object_version,'QA-provider-receipt'];
 await db.exec("UPDATE private.evidence_purge_attempts SET first_attempted_at=now()-interval '24 hours'");
 ok((await db.query('SELECT * FROM private.evidence_purge_alerts WHERE path=$1',[expiredPath])).rows.length===0);
 await db.exec("UPDATE private.evidence_purge_attempts SET first_attempted_at=now()-interval '24 hours 16 minutes'");
 ok((await db.query('SELECT * FROM private.evidence_purge_alerts WHERE path=$1',[expiredPath])).rows.length===1);
 ok((await db.query('SELECT * FROM private.evidence_purge_alerts WHERE request_id IS NOT NULL')).rows.length===3);
 await db.exec('SET ROLE service_role');
 await rejected(()=>db.query(operatorSql,args));
 await db.exec('RESET ROLE');
 await assert.rejects(db.query(operatorSql,[...args.slice(0,4),'   ']),/PROVIDER_REFERENCE_REQUIRED/);
 await assert.rejects(db.query(operatorSql,[...args.slice(0,3),'wrong-version',args[4]]),/UNRESOLVED_OBJECT_NOT_FOUND/);
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('transaction-evidence',$1)",[expiredPath]);
 await assert.rejects(db.query(operatorSql,args),/STORAGE_OBJECT_PRESENT/);
 await db.query("DELETE FROM storage.objects WHERE name=$1",[expiredPath]);
 await db.query(operatorSql,args);
 ok((await db.query('SELECT * FROM private.evidence_purge_alerts WHERE path=$1',[expiredPath])).rows.length===0);
 ok((await db.query('SELECT provider_reference FROM private.evidence_purge_attempts WHERE path=$1',[expiredPath])).rows[0].provider_reference===args[4]);
 await record('confirmed');
 await record('failed'); // A stale result cannot downgrade an acknowledgement.
 ok((await db.query('SELECT purge_expired_deleted_stores() AS n')).rows[0].n===1);
 ok((await db.query('SELECT outcome FROM private.evidence_purge_attempts WHERE path=$1',[expiredPath])).rows[0].outcome==='confirmed');
 ok((await db.query('SELECT id FROM stores WHERE id=$1',[id(990)])).rows.length===0);
 ok((await db.query('SELECT id FROM transaction_evidence WHERE id=$1',[id(992)])).rows.length===0);
 // PGlite runs one session. Model an old transaction crossing the restore deadline.
 await db.query("INSERT INTO stores(id,owner_id,deleted_by,deleted_at,purge_after) VALUES($1,$2,$2,now()-interval '7 days',now()+interval '1 day')",[id(995),admin]);
 await as(admin);
 await db.query('SELECT restore_deleted_store($1)',[id(995)]);
 await db.exec('RESET ROLE; BEGIN');
 await db.query("UPDATE stores SET deleted_at=now()-interval '7 days',purge_after=now()+interval '1 millisecond' WHERE id=$1",[id(995)]);
 await db.exec("SELECT pg_sleep(0.015); SET LOCAL ROLE authenticated");
 await assert.rejects(db.query('SELECT restore_deleted_store($1)',[id(995)]), /STORE_RESTORE_EXPIRED/);
 await db.exec('ROLLBACK');
 console.log(`Evidence SQL: ${checks} assertions passed (PGlite reduced schema; remote JWT/Storage not tested).`);
} finally { await db.close(); }
