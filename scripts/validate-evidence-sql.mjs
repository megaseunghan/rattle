// QA-EVIDENCE-20261114: reduced local schema only; no network or real data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
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
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated; CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE stores(id uuid PRIMARY KEY, deleted_at timestamptz,financial_share_scope text DEFAULT 'all_staff',attendance_share_scope text,payroll_share_scope text); CREATE TABLE purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,date date,supplier text,amount numeric,category text,type text,note text);
 CREATE TABLE ingredients(id uuid PRIMARY KEY,store_id uuid,current_stock numeric,last_price numeric,updated_at timestamptz);
 CREATE TABLE purchase_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_id uuid REFERENCES purchases(id),store_id uuid,ingredient_id uuid,name text,quantity numeric,unit text,unit_price numeric,subtotal numeric,category text);
 CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT s='${store}' AND auth.uid() IN ('${admin}','${member}','${part}') $$;
 CREATE FUNCTION map_purchase_category(category text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT category $$; CREATE TABLE expenses(id uuid PRIMARY KEY,store_id uuid);
 CREATE TABLE recurring_fixed_expenses(id uuid PRIMARY KEY,store_id uuid,source_expense_id uuid);
 CREATE TABLE employees(store_id uuid,user_id uuid,is_active boolean,employment_type text);
 CREATE TABLE store_members(store_id uuid,user_id uuid,status text);
 CREATE TABLE recurring_fixed_expense_versions(rule_id uuid,revision integer,effective_month text,active boolean,end_month text);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text, UNIQUE(bucket_id,name));
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
 await db.exec(await readFile(new URL('../supabase/migrations/20261119141000_evidence_cleanup_purchase_rpc.sql',import.meta.url),'utf8'));
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
 await db.query("DELETE FROM storage.objects WHERE bucket_id='transaction-evidence' AND name LIKE $1",[`${store}/${id(20)}/%`]);
 const proofs=(await db.query("SELECT get_evidence_for_parent_delete('purchase',$1) AS proofs",[purchase])).rows[0].proofs;
 for(const file of proofs) await db.query('SELECT discard_transaction_evidence_metadata($1)',[file.id]);
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
 console.log(`Evidence SQL: ${checks} assertions passed (PGlite reduced schema; remote JWT/Storage not tested).`);
} finally { await db.close(); }
