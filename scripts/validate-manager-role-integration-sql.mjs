// 로컬 PGlite 전용 / QA-MANAGER-20261117 / task_afb6510345f1. 네트워크·실계정 없음.
// Visibility fixture의 setup을 독립 보존. 실제 core→visibility→manager→legacy 체인 검사.
// 축약 스키마 + 실제 financial/QR/core/visibility 정의. 단일 연결, 실제 동시 트랜잭션 미검증.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({extensions:{pgcrypto}});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const users=Object.fromEntries(['owner','manager','regular','part','pending','outside','legacy','inactive'].map((k,i)=>[k,id(i+1)]));
const store=id(21), otherStore=id(22);
const emp=Object.fromEntries(Object.keys(users).map((k,i)=>[k,id(41+i)]));
const member=Object.fromEntries(Object.keys(users).map((k,i)=>[k,id(61+i)]));
const raw=['employees','payroll','payroll_work_history','employee_wage_history','payroll_work_submissions','payroll_daily_work',
 'payroll_daily_work_history','store_join_profiles','attendance','attendance_corrections','employee_schedules','schedule_requests',
 'attendance_punches','attendance_correction_requests'];
const financial=['toss_orders','toss_order_items','manual_sales','purchases','purchase_items','expenses'];
let checks=0;
const check=(label,value,expected)=>{assert.deepEqual(value,expected,label);checks++;};
const ok=(label,value)=>{assert.ok(value,label);checks++;};
const migration=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
async function as(user,sql,params=[]) {
 await db.exec(user?'SET ROLE authenticated':'SET ROLE anon');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user??'']);
 try{return await db.query(sql,params);}finally{await db.exec('RESET ROLE');}
}
async function rejects(label,code,fn){await assert.rejects(fn,e=>String(e.message).includes(code),label);checks++;}
const visibility=user=>as(user,'SELECT get_my_store_visibility($1) r',[store]).then(r=>r.rows[0].r);
const setScopes=async(f,a,p)=>{
 const rev=(await visibility(users.owner)).visibility_revision;
 return (await as(users.owner,'SELECT set_store_visibility($1,$2,$3,$4,$5) r',[store,f,a,p,rev])).rows[0].r;
};
const attendance=user=>as(user,'SELECT * FROM get_shared_attendance($1,$2,$3)',[store,'2026-10-01','2026-10-31']);
const requests=user=>as(user,'SELECT * FROM get_shared_attendance_requests($1,$2,$3)',[store,'2026-10-01','2026-10-31']);
const payroll=user=>as(user,'SELECT * FROM get_shared_payroll($1,$2)',[store,'2026-10']);
const employeePay=user=>as(user,'SELECT * FROM get_shared_employee_pay($1)',[store]);
const finances=user=>as(user,'SELECT * FROM get_shared_financial_summary($1,$2)',[store,'2026-10']);
const fields=(label,rows,expected)=>{for(const row of rows)check(label,Object.keys(row).sort(),[...expected].sort());};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE stores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES auth.users(id),name text,
 deleted_at timestamptz,deleted_by uuid,purge_after timestamptz,closing_time time DEFAULT '23:00');
 CREATE TABLE store_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,role text,status text,UNIQUE(store_id,user_id));
 CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,name text,is_active boolean,employment_type text,base_salary numeric,hourly_wage numeric,
 non_taxable numeric DEFAULT 0,bank_name text,account_number text,phone text,joined_at date,is_resigned_during_probation boolean DEFAULT false,
 UNIQUE(store_id,user_id));
 CREATE TABLE payroll(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
 employee_id uuid REFERENCES employees(id),year_month char(7),gross numeric,net_pay numeric,income_tax numeric,applied_hourly_wage numeric,
 regular_wage_snapshot jsonb,daily_work_snapshot jsonb,work_source text);
 CREATE TABLE employee_wage_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id),employee_id uuid REFERENCES employees(id),
 effective_date date,base_salary numeric,hourly_wage numeric,non_taxable numeric,memo text,created_at timestamptz DEFAULT now());
 CREATE TABLE payroll_daily_work(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id),employee_id uuid REFERENCES employees(id),
 work_date date,worked_minutes integer,gross numeric,applied_hourly_wage numeric,status text,revision integer,note text);
 CREATE TABLE store_join_profiles(id uuid DEFAULT gen_random_uuid(),member_id uuid,store_id uuid REFERENCES stores(id),employee_id uuid,
 applicant_user_id uuid,bank_name text,account_number text);
 CREATE TABLE attendance(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id),employee_id uuid REFERENCES employees(id),
 type text,timestamp timestamptz,latitude double precision,longitude double precision,note text,daily_wage numeric);
 CREATE FUNCTION is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM stores WHERE id=sid AND owner_id=auth.uid() AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM store_members m JOIN stores s ON s.id=m.store_id WHERE m.store_id=sid AND m.user_id=auth.uid() AND m.status='approved' AND s.deleted_at IS NULL)$$;
 CREATE FUNCTION is_store_admin(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT false$$;
 CREATE FUNCTION is_store_active(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM stores WHERE id=sid AND deleted_at IS NULL)$$;
 CREATE FUNCTION deleted_store_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT coalesce(array_agg(id),'{}'::uuid[]) FROM stores WHERE deleted_at IS NOT NULL$$;
 CREATE FUNCTION guard_deleted_store_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
 CREATE FUNCTION can_read_employee(p_store_id uuid,p_employee_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT is_store_member(p_store_id)$$;
 ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
 CREATE POLICY stores_read ON stores FOR SELECT TO authenticated USING(is_store_member(id));
 CREATE POLICY stores_write ON stores FOR UPDATE TO authenticated USING(is_store_admin(id)) WITH CHECK(is_store_admin(id));
 CREATE TABLE notifications(store_id uuid,category text,message text);
 ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
 CREATE POLICY notifications_read ON notifications FOR SELECT TO authenticated USING(is_store_member(store_id));
 CREATE TABLE recurring_fixed_expenses(id uuid PRIMARY KEY,store_id uuid,source_expense_id uuid);
 CREATE TABLE recurring_fixed_expense_versions(rule_id uuid,revision integer,amount numeric,active boolean,effective_month text,end_month text);
 ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`);
 for(const t of ['payroll_work_history','payroll_work_submissions','payroll_daily_work_history'])await db.exec(`CREATE TABLE ${t}(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id),employee_id uuid REFERENCES employees(id),
 year_month text,work_date date,note text,old_record jsonb,new_record jsonb);`);
 await db.exec(await migration('20260910_schedule_and_corrections.sql'));
 for(const t of financial)await db.exec(`CREATE TABLE ${t}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,
 status text DEFAULT 'COMPLETED',order_at timestamptz DEFAULT now(),total_amount numeric DEFAULT 0,card_amount numeric DEFAULT 0,
 cash_amount numeric DEFAULT 0,date date,amount numeric DEFAULT 0,year_month text,category text);
 ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;CREATE POLICY finance_member ON ${t} FOR ALL TO authenticated USING(is_store_member(store_id)) WITH CHECK(is_store_member(store_id));`);
 await db.exec(`CREATE FUNCTION get_financial_summaries(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false)
 RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN RETURN;END$$;
 CREATE FUNCTION get_financial_summaries_v2(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false)
 RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN RETURN;END$$;`);
 await db.exec(await migration('20261023123000_store_setup_financial_sharing.sql'));
 const wages=await migration('20261027010000_wage_effective_baselines.sql');
 await db.exec(wages.slice(wages.indexOf('CREATE FUNCTION public.regular_snapshot_gross'),wages.indexOf('-- Snapshot shape validation')));
 const summary=await migration('20261105140000_recurring_financial_summaries.sql');
 await db.exec(summary.slice(summary.indexOf('CREATE OR REPLACE FUNCTION'),summary.lastIndexOf('COMMIT;')));
 await db.exec(await migration('20261105020000_daily_labor_sources.sql'));
 // 실제 QR 체인 5개를 읽는다. QR 동작 자체의 회귀는 기존 QR 스크립트가 별도 검사.
 for(const name of ['20261116120000_qr_attendance.sql','20261116130000_qr_attendance_fixes.sql',
 '20261117120000_qr_attendance_retry_guard.sql','20261117130000_qr_attendance_hardening.sql','20261117140000_qr_attendance_policy.sql'])await db.exec(await migration(name));
 await db.exec(`CREATE VIEW current_employee_wages WITH(security_invoker=true) AS SELECT * FROM employee_wage_history;`);
 for(const t of raw){
  await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;CREATE POLICY old_broad_read ON ${t} FOR SELECT TO authenticated USING(is_store_member(store_id));`);
  if(!['attendance_punches','attendance_correction_requests'].includes(t))await db.exec(`CREATE POLICY old_admin_all ON ${t} FOR ALL TO authenticated USING(is_store_admin(store_id)) WITH CHECK(is_store_admin(store_id));`);
 }
 await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
 for(const uid of Object.values(users))await db.query('INSERT INTO auth.users VALUES($1,$2)',[uid,'qa-visibility@example.invalid']);
 await db.query("INSERT INTO stores(id,owner_id,name,financial_share_scope) VALUES($1,$2,'QA-VISIBILITY','regular_only'),($3,$2,'QA-other','all_staff')",[store,users.owner,otherStore]);
 const targets=['manager','regular','part','legacy','inactive'];
 for(const key of ['manager','regular','part','legacy','inactive','pending','outside']){
  const sid=key==='outside'?otherStore:store;
  await db.query('INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,$4,$5)',[member[key],sid,users[key],key==='legacy'?'admin':'member',['pending','inactive'].includes(key)?'pending':'approved']);
  if(key==='pending')continue;
  await db.query(`INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type,base_salary,hourly_wage,bank_name,account_number,phone,joined_at)
   VALUES($1,$2,$3,$4,$5,$6,3000000,12000,'PRIVATE-BANK','PRIVATE-ACCOUNT','PRIVATE-PHONE','2026-01-01')`,
   [emp[key],sid,users[key],`QA-${key}`,key!=='inactive',['manager','part'].includes(key)?'part_time':'regular']);
  if(key==='outside')continue;
  await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,net_pay,income_tax,applied_hourly_wage,daily_work_snapshot,work_source) VALUES($1,$2,'2026-10',1000,800,200,11000,'{\"reason\":\"PRIVATE-SNAPSHOT\"}','daily_work')",[sid,emp[key]]);
  await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo) VALUES($1,$2,'2026-01-01',3000000,10000,0,'PRIVATE-MEMO')",[sid,emp[key]]);
  await db.query("INSERT INTO attendance(store_id,employee_id,type,timestamp,latitude,longitude,note,daily_wage) VALUES($1,$2,'clock_in','2026-10-10T00:00:00Z',37,127,'PRIVATE-LEGACY-NOTE',98765)",[sid,emp[key]]);
  await db.query("INSERT INTO payroll_daily_work(store_id,employee_id,work_date,worked_minutes,gross,applied_hourly_wage,status,revision,note) VALUES($1,$2,'2026-10-10',60,11000,11000,'approved',1,'PRIVATE-NOTE')",[sid,emp[key]]);
  for(const t of ['payroll_work_history','payroll_work_submissions','payroll_daily_work_history'])await db.query(`INSERT INTO ${t}(store_id,employee_id,note,old_record,new_record) VALUES($1,$2,'PRIVATE-HISTORY','{"bank":"PRIVATE"}','{"gross":1234}')`,[sid,emp[key]]);
  await db.query("INSERT INTO store_join_profiles(member_id,store_id,employee_id,applicant_user_id,bank_name,account_number) VALUES($1,$2,$3,$4,'PRIVATE-BANK','PRIVATE-ACCOUNT')",[member[key],sid,emp[key],users[key]]);
  await db.query("INSERT INTO employee_schedules(store_id,employee_id,day_of_week,is_working,start_time,end_time) VALUES($1,$2,1,true,'09:00','17:00')",[sid,emp[key]]);
  await db.query("INSERT INTO schedule_requests(store_id,employee_id,days) VALUES($1,$2,'[{\"reason\":\"PRIVATE-SCHEDULE\"}]')",[sid,emp[key]]);
  await db.query("INSERT INTO attendance_corrections(store_id,employee_id,attendance_date,target,reason,photo_url) VALUES($1,$2,'2026-10-10','clock_in','PRIVATE-CORRECTION','PRIVATE-PHOTO')",[sid,emp[key]]);
  const punch=(await db.query("INSERT INTO attendance_punches(store_id,employee_id,kind,punched_at,work_date,source,note,flags) VALUES($1,$2,'clock_in','2026-10-11T00:00:00Z','2026-10-11','manual','PRIVATE-MANUAL',ARRAY['early_clock_in']) RETURNING id",[sid,emp[key]])).rows[0].id;
  await db.query("INSERT INTO attendance_correction_requests(store_id,employee_id,action,target_punch_id,kind,requested_time,reason,original_snapshot,requested_by) VALUES($1,$2,'change',$3,'clock_in','2026-10-11T01:00:00Z','PRIVATE-REQUEST','{\"note\":\"PRIVATE-SNAPSHOT\"}',$4)",[sid,emp[key],punch,users[key]]);
 }
 for(const t of financial)await db.query(`INSERT INTO ${t}(store_id,amount,date,year_month,category) VALUES($1,100,'2026-10-10','2026-10','고정비')`,[store]);
 await db.exec(await migration('20261117150000_role_model_core.sql'));
 await as(users.owner,'SELECT set_store_manager($1,$2,0)',[store,member.manager]);
 const sql=await migration('20261117160000_store_visibility.sql');
 await db.exec(sql);

 // Extend only fixture columns to match pre-existing production RPC rowtypes.
 await db.exec(`CREATE FUNCTION public.is_store_part_timer(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM employees WHERE store_id=sid AND user_id=auth.uid() AND employment_type='part_time') $$;
 ALTER TABLE payroll_daily_work ADD COLUMN IF NOT EXISTS submitted_by uuid,ADD COLUMN IF NOT EXISTS reviewed_by uuid,ADD COLUMN IF NOT EXISTS review_note text,ADD COLUMN IF NOT EXISTS updated_at timestamptz,ADD CONSTRAINT daily_fixture_unique UNIQUE(employee_id,work_date);
 ALTER TABLE payroll ADD COLUMN IF NOT EXISTS is_settled boolean DEFAULT false,ADD COLUMN IF NOT EXISTS settled_at timestamptz,ADD COLUMN IF NOT EXISTS worked_minutes integer,ADD COLUMN IF NOT EXISTS work_submission_id uuid;
 ALTER TABLE payroll_work_submissions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,ADD COLUMN IF NOT EXISTS reviewed_by uuid,ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,ADD COLUMN IF NOT EXISTS review_note text;
 ALTER TABLE payroll_work_submissions ADD COLUMN worked_minutes integer,ADD COLUMN submitted_by uuid,ADD COLUMN submitted_at timestamptz DEFAULT now();
 ALTER TABLE employee_wage_history ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
 CREATE POLICY member_self_insert ON schedule_requests FOR INSERT TO authenticated WITH CHECK(is_own_employee(employee_id));
 CREATE POLICY fixture_legacy_self_insert ON attendance FOR INSERT TO authenticated WITH CHECK(is_own_employee(employee_id));`);
 const monthlyOriginal=await migration('20261019_payroll_submissions.sql');
 await db.exec(monthlyOriginal.slice(monthlyOriginal.indexOf('CREATE FUNCTION public.submit_work_minutes('),monthlyOriginal.indexOf('CREATE FUNCTION public.review_work_minutes(')));
 const managerSql=await migration('20261117170000_manager_rpc_policy.sql');
 const legacySql=await migration('20261117180000_legacy_admin_to_member.sql');
 await db.exec(managerSql);
 await db.exec(legacySql);
 check('legacy admin physically downgraded',(await db.query('SELECT role FROM store_members WHERE id=$1',[member.legacy])).rows[0].role,'member');
 check('legacy cleanup does not auto-appoint',(await as(users.legacy,'SELECT is_store_admin($1) b',[store])).rows[0].b,false);
 check('manager assignment survives cleanup',(await as(users.manager,'SELECT is_store_admin($1) b',[store])).rows[0].b,true);
 for(const who of ['owner','manager','regular','part','legacy','pending','outside']) {
   const uid=users[who];
   const canRecipe=['owner','manager','regular','legacy'].includes(who);
   check(`${who} recipe existing regular rights preserved`,(await as(uid,'SELECT can_manage_recipes($1) b',[store])).rows[0].b,canRecipe);
   for(const target of ['manager','regular','part','legacy','outside']) {
     const expected=target!=='outside'&&(who==='owner'||(who==='manager'&&target!=='manager'));
     check(`${who}/${target} attendance write helper`,(await as(uid,'SELECT can_manage_employee_attendance($1,$2) b',[store,emp[target]])).rows[0].b,expected);
   }
 }
 for(const table of ['attendance','employee_schedules','attendance_corrections','schedule_requests']) {
   check(`${table} manager self DELETE clamped`,(await as(users.manager,`DELETE FROM ${table} WHERE employee_id=$1 RETURNING id`,[emp.manager])).rows.length,0);
   const col=table==='employee_schedules'?'is_working=false':table==='attendance'?'note=note':"status='approved'";
   check(`${table} manager self UPDATE clamped`,(await as(users.manager,`UPDATE ${table} SET ${col} WHERE employee_id=$1 RETURNING id`,[emp.manager])).rows.length,0);
 }
 await rejects('manager cannot self-insert manual legacy','STORE_OWNER_REQUIRED',()=>as(users.manager,"INSERT INTO attendance(store_id,employee_id,type,timestamp) VALUES($1,$2,'clock_in',now())",[store,emp.manager]));
 await rejects('manager cannot self schedule insert','STORE_OWNER_REQUIRED',()=>as(users.manager,"INSERT INTO employee_schedules(store_id,employee_id,day_of_week) VALUES($1,$2,2)",[store,emp.manager]));
 await rejects('manager cannot self-delete employee','STORE_OWNER_REQUIRED',()=>as(users.manager,'DELETE FROM employees WHERE id=$1',[emp.manager]));
 await rejects('manager cannot self-resign','STORE_OWNER_REQUIRED',()=>as(users.manager,'UPDATE employees SET is_active=false WHERE id=$1',[emp.manager]));
 await rejects('manager cannot unlink self','STORE_OWNER_REQUIRED',()=>as(users.manager,'UPDATE employees SET user_id=NULL WHERE id=$1',[emp.manager]));
 for(const who of ['manager','owner']) {
  const target=who==='owner'?'manager':'regular';
  check(`${who} allowed schedule update`,(await as(users[who],'UPDATE employee_schedules SET is_working=false WHERE employee_id=$1 RETURNING id',[emp[target]])).rows.length,1);
 }
 for(const who of ['regular','part','legacy'])await rejects(`${who} legacy manual insert denied`,'row-level security',()=>as(users[who],"INSERT INTO attendance(store_id,employee_id,type,timestamp) VALUES($1,$2,'clock_in',now())",[store,emp[who]]));
 await rejects('self schedule request cannot arrive approved','row-level security',()=>as(users.regular,"INSERT INTO schedule_requests(store_id,employee_id,days,status) VALUES($1,$2,'[]','approved')",[store,emp.regular]));
 check('manager self schedule request remains pending',(await as(users.manager,"INSERT INTO schedule_requests(store_id,employee_id,days) VALUES($1,$2,'[]') RETURNING status",[store,emp.manager])).rows[0].status,'pending');
 let day=(await as(users.manager,"SELECT * FROM save_daily_work($1,'2026-10-12',60,'QA self submit',NULL)",[emp.manager])).rows[0];
 check('PT manager own daily work pending',day.status,'pending');
 await rejects('manager own daily approval refused','DAILY_WORK_FORBIDDEN',()=>as(users.manager,"SELECT review_daily_work($1,1,'approved','')",[day.id]));
 day=(await as(users.owner,"SELECT * FROM review_daily_work($1,1,'approved','owner checked')",[day.id])).rows[0];
 check('owner approves manager daily work',day.status,'approved');
 day=(await as(users.manager,"SELECT * FROM save_daily_work($1,'2026-10-12',30,'QA resubmit',2)",[emp.manager])).rows[0];
 check('manager resubmit clears own approval',day.status,'pending');
 check('manager resubmit has no reviewer',day.reviewed_by,null);
 const otherDay=(await as(users.manager,"SELECT * FROM save_daily_work($1,'2026-10-12',60,'QA other',NULL)",[emp.part])).rows[0];
 check('PT manager manages other PT',otherDay.status,'approved');
 const submission=(await db.query('SELECT id FROM payroll_work_submissions WHERE employee_id=$1',[emp.manager])).rows[0].id;
 await rejects('manager own monthly review denied','관리자만',()=>as(users.manager,"SELECT review_work_minutes($1,'approved','')",[submission]));
 check('owner monthly review allowed',(await as(users.owner,"SELECT (review_work_minutes($1,'approved','')).status status",[submission])).rows[0].status,'approved');
 // QR correction + manual APIs test the final helper, not a stub.
 for(const who of ['owner','manager','regular','part','legacy'])for(const target of ['manager','regular','part']) {
  const allowed=who==='owner'||(who==='manager'&&target!=='manager');
  const at='2026-10-20T09:00:00Z';
  const rid=(await as(users.owner,"SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in',$3,'QA') r",[store,emp[target],at])).rows[0].r;
  if(allowed)check(`${who}/${target} QR reject allowed`,(await as(users[who],'SELECT review_attendance_correction($1,false) r',[rid])).rows[0].r,null);
  else {
   await rejects(`${who}/${target} QR reject denied`,who==='manager'?'ATTENDANCE_OWNER_REQUIRED':'ATTENDANCE_ADMIN_REQUIRED',()=>as(users[who],'SELECT review_attendance_correction($1,false)',[rid]));
   await as(users.owner,'SELECT review_attendance_correction($1,false)',[rid]);
  }
 }
 const ptManagerRequest=(await as(users.regular,"SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in','2026-10-23T09:00Z','QA') r",[store,emp.regular])).rows[0].r;
 ok('PT manager approves regular QR correction',(await as(users.manager,'SELECT review_attendance_correction($1,true) r',[ptManagerRequest])).rows[0].r);
 const ownManagerRequest=(await as(users.manager,"SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in','2026-10-23T09:00Z','QA') r",[store,emp.manager])).rows[0].r;
 await rejects('PT manager cannot approve own QR correction','ATTENDANCE_OWNER_REQUIRED',()=>as(users.manager,'SELECT review_attendance_correction($1,true)',[ownManagerRequest]));
 ok('owner approves PT manager QR correction',(await as(users.owner,'SELECT review_attendance_correction($1,true) r',[ownManagerRequest])).rows[0].r);
 const before=(await db.query('SELECT count(*) n FROM attendance_punches')).rows[0].n;
 await rejects('manager self manual denied','ATTENDANCE_OWNER_REQUIRED',()=>as(users.manager,"SELECT record_manual_attendance($1,$2,'clock_in','2026-10-22T09:00Z','QA')",[store,emp.manager]));
 check('denied manual creates no punch',(await db.query('SELECT count(*) n FROM attendance_punches')).rows[0].n,before);
 ok('PT manager manual for regular allowed',(await as(users.manager,"SELECT record_manual_attendance($1,$2,'clock_in','2026-10-22T09:00Z','QA') r",[store,emp.regular])).rows[0].r);
 // Reads remain domain-gated after final chain; writes cannot inherit sharing.
 await setScopes('all_staff','all_staff','all_staff');
 for(const who of ['regular','part','legacy']) {
  check('shared payroll projection returns authorized active roster',(await payroll(users[who])).rows.length,4);
  check('shared visibility grants no management',(await as(users[who],'SELECT is_store_admin($1) b',[store])).rows[0].b,false);
 }
 await rejects('self payroll source cannot bypass review','STORE_OWNER_REQUIRED',()=>as(users.manager,'UPDATE payroll SET worked_minutes=100 WHERE employee_id=$1',[emp.manager]));
 check('manager can still edit own payroll non-attendance fields',(await as(users.manager,'UPDATE payroll SET income_tax=201 WHERE employee_id=$1 RETURNING id',[emp.manager])).rows.length,1);
 const recipesSql=await migration('20260609_stock_member_access.sql');
 await db.exec(`CREATE TABLE recipes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,name text,category text,selling_price numeric,cost numeric,margin_rate numeric);
 CREATE TABLE ingredients(id uuid PRIMARY KEY,last_price numeric);CREATE TABLE recipe_ingredients(recipe_id uuid,ingredient_id uuid,quantity numeric,unit text);`);
 const recipeStart=recipesSql.indexOf('CREATE OR REPLACE FUNCTION create_recipe_with_ingredients(');
 ok('actual recipe RPC located',recipeStart>=0);
 await db.exec(recipesSql.slice(recipeStart));
 for(const who of ['owner','manager','regular','legacy'])ok(`${who} actual recipe RPC works`,(await as(users[who],"SELECT create_recipe_with_ingredients($1,'QA recipe','QA',100,'[]') r",[store])).rows[0].r);
 await rejects('ordinary PT recipe remains denied','Unauthorized',()=>as(users.part,"SELECT create_recipe_with_ingredients($1,'QA recipe','QA',100,'[]')",[store]));
 const punchesBefore=(await db.query('SELECT to_jsonb(p) j FROM attendance_punches p ORDER BY id')).rows;
 await as(users.owner,"UPDATE employee_schedules SET start_time='10:00' WHERE employee_id=$1",[emp.manager]);
 check('schedule change preserves historical punch flags/source',(await db.query('SELECT to_jsonb(p) j FROM attendance_punches p ORDER BY id')).rows,punchesBefore);
 await rejects('manager cannot change visibility','STORE_OWNER_REQUIRED',()=>as(users.manager,"SELECT set_store_visibility($1,'none','none','none',1)",[store]));
 await rejects('manager cannot transfer ownership','OWNERSHIP_OWNER_REQUIRED',()=>as(users.manager,'SELECT transfer_store_ownership($1,$2)',[store,member.regular]));
 await rejects('manager cannot change appointment','STORE_OWNER_REQUIRED',()=>as(users.manager,'SELECT set_store_manager($1,NULL,1)',[store]));
 for(const f of ['can_manage_employee_attendance(uuid,uuid)','can_manage_recipes(uuid)','save_daily_work(uuid,date,integer,text,integer)','review_daily_work(uuid,integer,text,text)','review_work_minutes(uuid,text,text)'])check(`${f} anon EXECUTE denied`,(await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') b",[f])).rows[0].b,false);
 check('no active raw admin policy remains',(await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND (coalesce(qual,'')||coalesce(with_check,'')) ~ $$role[^;]*'admin'$$")).rows[0].n,0);
 const stateBefore=(await db.query('SELECT * FROM private.store_managers')).rows;
 await db.exec(managerSql);await db.exec(legacySql);
 check('reapply preserves assignment/revision',(await db.query('SELECT * FROM private.store_managers')).rows,stateBefore);
 check('legacy guard re-enabled',(await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='role_model_legacy_role_guard'")).rows[0].tgenabled,'O');
 await rejects('legacy role cannot self-promote','STORE_OWNER_REQUIRED',()=>as(users.legacy,"UPDATE store_members SET role='admin' WHERE id=$1",[member.legacy]));
 await rejects('anon no new helper ACL','permission denied',()=>as(null,'SELECT can_manage_employee_attendance($1,$2)',[store,emp.manager]));

 // QA-VISIBILITY-ACTIVE-20261117: target state, not viewer state; totals stay historical.
 await setScopes('all_staff','all_staff','all_staff');
 for(const [active,linked,label] of [[false,true,'inactive linked'],[true,false,'active unlinked'],[false,false,'inactive unlinked']]) {
  await as(users.owner,'UPDATE employees SET is_active=$1,user_id=$2 WHERE id=$3',[active,linked?users.legacy:null,emp.legacy]);
  for(const [name,fn] of [['attendance',attendance],['requests',requests],['payroll',payroll],['employee pay',employeePay]]) {
   for(const who of ['regular','part'])check(`${label}/${who}/${name} excludes former target`,(await fn(users[who])).rows.filter(r=>r.employee_id===emp.legacy).length,0);
   for(const who of ['owner','manager'])ok(`${label}/${who}/${name} retains target`,(await fn(users[who])).rows.some(r=>r.employee_id===emp.legacy));
   if(linked)ok(`${label}/self/${name} retains target`,(await fn(users.legacy)).rows.some(r=>r.employee_id===emp.legacy));
   else check(`${label}/former account/${name} has no inferred self rows`,(await fn(users.legacy)).rows.length,0);
  }
  for(const who of ['owner','manager'])check(`${label}/${who} raw historical payroll retained`,(await as(users[who],'SELECT * FROM payroll WHERE employee_id=$1',[emp.legacy])).rows.length,1);
  if(linked)check(`${label}/self raw historical payroll retained`,(await as(users.legacy,'SELECT * FROM payroll WHERE employee_id=$1',[emp.legacy])).rows.length,1);
  else check(`${label}/former account raw historical payroll absent`,(await as(users.legacy,'SELECT * FROM payroll WHERE employee_id=$1',[emp.legacy])).rows.length,0);
  check(`${label} financial labor total unchanged`,Number((await as(users.regular,"SELECT labor_cost FROM get_shared_financial_summary($1,'2026-10')",[store])).rows[0].labor_cost),5000);
 }
 await as(users.owner,'UPDATE employees SET is_active=true,user_id=$1 WHERE id=$2',[users.legacy,emp.legacy]);
 for(const fn of [attendance,requests,payroll,employeePay])ok('relinked active target shared on next read',(await fn(users.regular)).rows.some(r=>r.employee_id===emp.legacy));

 // QA-M5-20261117: actual submit_work_minutes RPC, full state transitions and atomic failure.
 const submit=(who,target,month,minutes,previous=null)=>as(users[who],'SELECT * FROM submit_work_minutes($1,$2,$3,$4,$5)',[emp[target],month,minutes,'QA-M5',previous]).then(r=>r.rows[0]);
 const monthlyRows=target=>db.query("SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE employee_id=$1 AND year_month='2026-08' ORDER BY version",[emp[target]]).then(r=>r.rows);
 const reviewMonthly=(who,row,status)=>as(users[who],"SELECT * FROM review_work_minutes($1,$2,'QA-M5 review')",[row.id,status]).then(r=>r.rows[0]);
 await as(users.owner,"INSERT INTO payroll(store_id,employee_id,year_month,gross,is_settled) VALUES($1,$2,'2026-08',700,true)",[store,emp.manager]);
 let monthly=await submit('manager','manager','2026-08',60);
 check('M5 manager first submit pending',monthly.status,'pending');
 check('M5 successful submit clears settlement',(await db.query("SELECT is_settled FROM payroll WHERE employee_id=$1 AND year_month='2026-08'",[emp.manager])).rows[0].is_settled,false);
 const firstMonthly=monthly;
 monthly=await submit('manager','manager','2026-08',30,monthly.id);
 check('M5 manager pending resubmit pending',monthly.status,'pending');
 check('M5 manager pending resubmit version',monthly.version,2);
 check('M5 former pending superseded',(await db.query('SELECT status FROM payroll_work_submissions WHERE id=$1',[firstMonthly.id])).rows[0].status,'superseded');
 for(const status of ['approved','rejected'])await rejects(`M5 manager self ${status} denied`,'관리자만',()=>reviewMonthly('manager',monthly,status));
 await rejects('M5 direct supersede cannot impersonate RPC','STORE_OWNER_REQUIRED',()=>as(users.manager,"UPDATE payroll_work_submissions SET status='superseded' WHERE id=$1",[monthly.id]));
 await rejects('M5 cannot forge internal supersede marker','permission denied',()=>as(users.manager,'INSERT INTO private.work_submission_supersessions VALUES(txid_current(),$1,$2)',[monthly.id,users.manager]));
 monthly=await reviewMonthly('owner',monthly,'rejected');
 monthly=await submit('manager','manager','2026-08',40,monthly.id);
 check('M5 manager rejected resubmit pending',monthly.status,'pending');
 monthly=await reviewMonthly('owner',monthly,'approved');
 const approvedMonthly=monthly;
 monthly=await submit('manager','manager','2026-08',50,monthly.id);
 check('M5 manager approved resubmit pending',monthly.status,'pending');
 check('M5 approved historical row preserved',(await db.query('SELECT status FROM payroll_work_submissions WHERE id=$1',[approvedMonthly.id])).rows[0].status,'approved');
 const beforeStale=await monthlyRows('manager');
 await rejects('M5 stale submit rejected','제출 내역이 변경',()=>submit('manager','manager','2026-08',10,firstMonthly.id));
 check('M5 stale submit rollback preserves rows',await monthlyRows('manager'),beforeStale);
 // Fail the new INSERT after the old pending row is superseded: entire RPC must roll back.
 await db.exec(`CREATE FUNCTION public.qa_m5_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.year_month='2026-08' AND NEW.worked_minutes=13 THEN RAISE EXCEPTION 'QA_M5_INSERT_FAILURE';END IF;RETURN NEW;END $$;
 CREATE TRIGGER qa_m5_fail_insert BEFORE INSERT ON payroll_work_submissions FOR EACH ROW EXECUTE FUNCTION qa_m5_fail_insert();`);
 await rejects('M5 forced insert failure','QA_M5_INSERT_FAILURE',()=>submit('manager','manager','2026-08',13,monthly.id));
 check('M5 insert failure restores previous pending row',await monthlyRows('manager'),beforeStale);
 check('M5 failed RPC leaves no token',(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,0);
 // General PT can submit/resubmit, but only owner/manager-other may review.
 let partMonthly=await submit('part','part','2026-08',60);
 partMonthly=await submit('part','part','2026-08',30,partMonthly.id);
 check('M5 ordinary PT pending resubmit works',partMonthly.version,2);
 for(const who of ['part','regular'])for(const status of ['approved','rejected'])await rejects(`M5 ${who} review denied`,'관리자만',()=>reviewMonthly(who,partMonthly,status));
 partMonthly=await reviewMonthly('manager',partMonthly,'rejected');
 partMonthly=await submit('part','part','2026-08',40,partMonthly.id);
 check('M5 ordinary PT rejected resubmit',partMonthly.status,'pending');
 partMonthly=await reviewMonthly('manager',partMonthly,'approved');
 partMonthly=await submit('part','part','2026-08',50,partMonthly.id);
 check('M5 ordinary PT approved resubmit',partMonthly.status,'pending');
 await as(users.owner,"UPDATE employees SET employment_type='regular' WHERE id=$1",[emp.manager]);
 await rejects('M5 regular manager cannot submit monthly minutes','본인 파트타이머',()=>submit('manager','manager','2026-08',10,monthly.id));
 partMonthly=await reviewMonthly('manager',partMonthly,'approved');
 check('M5 regular manager can review others',partMonthly.status,'approved');
 await rejects('M5 regular manager cannot self review','관리자만',()=>reviewMonthly('manager',monthly,'approved'));
 await rejects('M5 ordinary regular cannot submit monthly minutes','본인 파트타이머',()=>submit('regular','regular','2026-08',60));
 for(const who of ['owner','manager','regular','part'])await rejects(`M5 ${who} cannot submit for another PT`,'본인 파트타이머',()=>submit(who,who==='part'?'manager':'part','2026-08',20,partMonthly.id));
 await as(users.owner,"UPDATE employees SET employment_type='part_time' WHERE id=$1",[emp.manager]);
 // Owner's employment contract is separate from ownership, just as for managers.
 await as(users.owner,"INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type) VALUES($1,$2,$3,'QA-M5-owner',true,'regular')",[emp.owner,store,users.owner]);
 await rejects('M5 regular owner cannot submit monthly minutes','본인 파트타이머',()=>submit('owner','owner','2026-08',60));
 await as(users.owner,"UPDATE employees SET employment_type='part_time' WHERE id=$1",[emp.owner]);
 let ownerMonthly=await submit('owner','owner','2026-08',60);
 ownerMonthly=await submit('owner','owner','2026-08',30,ownerMonthly.id);
 check('M5 PT owner pending resubmit works',ownerMonthly.version,2);
 ownerMonthly=await reviewMonthly('owner',ownerMonthly,'rejected');
 ownerMonthly=await submit('owner','owner','2026-08',40,ownerMonthly.id);
 ownerMonthly=await reviewMonthly('owner',ownerMonthly,'approved');
 ownerMonthly=await submit('owner','owner','2026-08',50,ownerMonthly.id);
 check('M5 PT owner approved resubmit works',ownerMonthly.status,'pending');
 check('M5 success paths leave no token',(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,0);

 partMonthly=await submit('part','part','2026-08',55,partMonthly.id);
 for(const [who,row] of [['manager',monthly],['owner',ownerMonthly],['part',partMonthly]]) {
  const rowsBefore=await monthlyRows(who);
  await as(users.owner,"UPDATE payroll SET is_settled=true WHERE employee_id=$1 AND year_month='2026-08'",[emp[who]]);
  const payrollBefore=(await db.query("SELECT to_jsonb(p) j FROM payroll p WHERE employee_id=$1 AND year_month='2026-08'",[emp[who]])).rows;
  await rejects(`M5 ${who} new-insert failure rolls back old supersede`,'QA_M5_INSERT_FAILURE',()=>submit(who,who,'2026-08',13,row.id));
  check(`M5 ${who} failure preserves all monthly versions`,await monthlyRows(who),rowsBefore);
  check(`M5 ${who} failure preserves payroll settlement`,(await db.query("SELECT to_jsonb(p) j FROM payroll p WHERE employee_id=$1 AND year_month='2026-08'",[emp[who]])).rows,payrollBefore);
  check(`M5 ${who} failure leaves no internal marker`,(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,0);
  await rejects(`M5 ${who} stale resubmit rejects atomically`,'제출 내역이 변경',()=>submit(who,who,'2026-08',10,null));
  check(`M5 ${who} stale preserves all versions`,await monthlyRows(who),rowsBefore);
 }
 await db.exec('DROP TRIGGER qa_m5_fail_insert ON payroll_work_submissions;DROP FUNCTION qa_m5_fail_insert();');
 // Private markers cannot become an externally callable administrative bypass.
 check('M5 marker table RLS enabled',(await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='private.work_submission_supersessions'::regclass")).rows[0].relrowsecurity,true);
 for(const role of ['authenticated','anon','service_role'])check(`M5 ${role} cannot access marker table`,(await db.query("SELECT has_table_privilege($1,'private.work_submission_supersessions','SELECT,INSERT,UPDATE,DELETE') b",[role])).rows[0].b,false);
 for(const role of ['anon','service_role'])check(`M5 ${role} cannot execute submit`,(await db.query("SELECT has_function_privilege($1,'submit_work_minutes(uuid,text,integer,text,uuid)','EXECUTE') b",[role])).rows[0].b,false);

 // QA-M5-BINDING-20261117. Fixture owner may plant markers; client roles never may.
 // Roll back to a savepoint BEFORE RESET ROLE to preserve the actual SQL error.
 async function savepointAs(user,statement,params=[]) {
  await db.exec('SAVEPOINT binding_probe');
  try {
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
   await db.exec('SET ROLE authenticated');
   const result=await db.query(statement,params);
   await db.exec('RESET ROLE;RELEASE SAVEPOINT binding_probe');
   return result;
  } catch(error) {
   await db.exec('ROLLBACK TO SAVEPOINT binding_probe;RELEASE SAVEPOINT binding_probe');
   throw error;
  }
 }
 async function originalOwnerError(label,statement,params=[]) {
  await assert.rejects(()=>savepointAs(users.manager,statement,params),error=>error.code==='42501'&&error.message==='STORE_OWNER_REQUIRED',label);
  checks++;
 }
 for(const [label,delta,target,actor] of [
  ['wrong transaction',1,monthly.id,users.manager],
  ['wrong submission',0,partMonthly.id,users.manager],
  ['wrong actor',0,monthly.id,users.part]
 ]) {
  await db.exec('BEGIN');
  try {
   const rowBefore=(await db.query('SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE id=$1',[monthly.id])).rows;
   await db.query('INSERT INTO private.work_submission_supersessions VALUES(txid_current()+$1,$2,$3)',[delta,target,actor]);
   const markersBefore=(await db.query('SELECT * FROM private.work_submission_supersessions')).rows;
   await originalOwnerError(`binding ${label} preserves original denial`,"UPDATE payroll_work_submissions SET status='superseded' WHERE id=$1",[monthly.id]);
   check(`${label} leaves row unchanged`,(await db.query('SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE id=$1',[monthly.id])).rows,rowBefore);
   check(`${label} consumes no mismatched marker`,(await db.query('SELECT * FROM private.work_submission_supersessions')).rows,markersBefore);
   check(`${label} savepoint leaves transaction usable`,(await db.query('SELECT 1 n')).rows[0].n,1);
  } finally {await db.exec('ROLLBACK');}
 }
 for(const [label,extra] of [['minutes',',worked_minutes=worked_minutes+1'],['employee',`,employee_id='${emp.part}'`]]) {
  await db.exec('BEGIN');
  try {
   const rowBefore=(await db.query('SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE id=$1',[monthly.id])).rows;
   await db.query('INSERT INTO private.work_submission_supersessions VALUES(txid_current(),$1,$2)',[monthly.id,users.manager]);
   await originalOwnerError(`valid marker cannot change ${label}`,`UPDATE payroll_work_submissions SET status='superseded'${extra} WHERE id=$1`,[monthly.id]);
   check(`invalid ${label} write preserves row`,(await db.query('SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE id=$1',[monthly.id])).rows,rowBefore);
   check(`invalid ${label} write leaves marker unconsumed`,(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,1);
  } finally {await db.exec('ROLLBACK');}
 }
 await db.exec('BEGIN');
 try {
  const next=(await savepointAs(users.manager,'SELECT * FROM submit_work_minutes($1,$2,$3,$4,$5)',[emp.manager,'2026-08',70,'QA-M5 same tx',monthly.id])).rows[0];
  check('same tx valid RPC returns pending',next.status,'pending');
  check('same tx valid RPC consumes marker',(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,0);
  const beforeFollowup=(await db.query('SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE employee_id=$1 ORDER BY id',[emp.manager])).rows;
  await originalOwnerError('same tx token cannot authorize second supersede',"UPDATE payroll_work_submissions SET status='superseded' WHERE id=$1",[next.id]);
  await originalOwnerError('same tx token cannot authorize approval',"UPDATE payroll_work_submissions SET status='approved',reviewed_by=$2 WHERE id=$1",[next.id,users.manager]);
  check('same tx failed followup preserves successful RPC',(await db.query('SELECT to_jsonb(s) j FROM payroll_work_submissions s WHERE employee_id=$1 ORDER BY id',[emp.manager])).rows,beforeFollowup);
  await assert.rejects(()=>savepointAs(users.manager,'SELECT * FROM submit_work_minutes($1,$2,$3,$4,$5)',[emp.part,'2026-08',70,'QA-M5 forbidden other',partMonthly.id]),error=>error.message.includes('본인 파트타이머')&&error.code==='P0001');checks++;
  check('same tx regular staff cannot alter manager submission',(await savepointAs(users.regular,"UPDATE payroll_work_submissions SET status='approved' WHERE id=$1 RETURNING id",[next.id])).rows.length,0);
  check('same tx other employee attempt leaves no marker',(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,0);
 } finally {await db.exec('ROLLBACK');}
 check('binding probes roll back every planted marker',(await db.query('SELECT count(*)::int n FROM private.work_submission_supersessions')).rows[0].n,0);
 console.log(`Manager integration SQL validation passed: ${checks} assertions (local PGlite only).`);
} finally {await db.close();}
