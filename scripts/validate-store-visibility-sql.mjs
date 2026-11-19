// 로컬 PGlite 전용 / QA-VISIBILITY-20261117 / task_722fcf2828d9. 네트워크·실제 계정·자료 없음.
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
 const readModels=await migration('20261023120000_read_models_and_integrity.sql');
 const wageViewStart=readModels.indexOf('CREATE VIEW public.current_employee_wages WITH(security_invoker=true) AS');
 assert.ok(wageViewStart>=0,'actual wage view definition exists');
 await db.exec(readModels.slice(wageViewStart,readModels.indexOf('CREATE FUNCTION public.unit_base_factor',wageViewStart)));
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
 check('old financial preserved / new fields private',(await db.query('SELECT financial_share_scope,attendance_share_scope,payroll_share_scope FROM stores WHERE id=$1',[store])).rows[0],
 {financial_share_scope:'regular_only',attendance_share_scope:'none',payroll_share_scope:'none'});
 const originalRows={};
 for(const t of raw)originalRows[t]=(await db.query(`SELECT to_jsonb(x) j FROM ${t} x ORDER BY x.id`)).rows;
 await db.query("INSERT INTO notifications VALUES($1,'attendance','PRIVATE-ATTENDANCE-NOTE')",[store]);
 await db.exec('CREATE POLICY injected_all_regression ON payroll FOR ALL TO authenticated USING(true) WITH CHECK(true)');
 check('restrictive SELECT also clamps permissive FOR ALL',(await as(users.regular,'SELECT * FROM payroll WHERE store_id=$1',[store])).rows.length,1);
 await db.exec('DROP POLICY injected_all_regression ON payroll');
 const ownKeys=new Set(targets);
 const allowed=(key,scope)=>['owner','manager'].includes(key)||(['regular','legacy'].includes(key)&&scope!=='none')||(key==='part'&&scope==='all_staff');
 for(const f of ['none','regular_only','all_staff'])for(const a of ['none','regular_only','all_staff'])for(const p of ['none','regular_only','all_staff']){
  await setScopes(f,a,p);
  for(const key of Object.keys(users)){
   const uid=users[key], admin=['owner','manager'].includes(key), self=ownKeys.has(key)?1:0;
   const ownCount=admin?targets.length:self;
   for(const t of raw)check(`${f}/${a}/${p}/${key}/raw ${t}`,(await as(uid,`SELECT * FROM ${t} WHERE store_id=$1`,[store])).rows.length,ownCount);
   check('attendance notification raw text admin only',(await as(uid,"SELECT * FROM notifications WHERE store_id=$1 AND category='attendance'",[store])).rows.length,admin?1:0);
   check('base view cannot bypass payroll RLS',(await as(uid,'SELECT * FROM current_employee_wages WHERE store_id=$1',[store])).rows.length,ownCount);
   check('QR view cannot bypass RLS',(await as(uid,'SELECT * FROM attendance_effective_punches WHERE store_id=$1',[store])).rows.length,ownCount);
   for(const t of financial)check(`${key}/${f}/financial ${t}`,(await as(uid,`SELECT * FROM ${t} WHERE store_id=$1`,[store])).rows.length,allowed(key,f)?1:0);
   if(['pending','outside'].includes(key)){
    for(const fn of [attendance,requests,payroll,employeePay])await rejects(`${key} denied shared RPC`,'STORE_ACCESS_DENIED',()=>fn(uid));
   }else{
    const att=(await attendance(uid)).rows, req=(await requests(uid)).rows, pay=(await payroll(uid)).rows, current=(await employeePay(uid)).rows;
    check(`${key}/${a} attendance count`,att.length,(admin?targets.length:allowed(key,a)?targets.length-1:self)*2);
    check(`${key}/${a} request count`,req.length,admin?targets.length:allowed(key,a)?targets.length-1:self);
    check(`${key}/${p} payroll count`,pay.length,admin?targets.length:allowed(key,p)?targets.length-1:self);
    check(`${key}/${p} current pay count`,current.length,admin?targets.length:allowed(key,p)?targets.length-1:self);
    fields('attendance exact fields',att,['employee_id','employee_name','kind','punched_at','work_date','flags','status']);
    fields('request exact fields',req,['employee_id','employee_name','kind','requested_time','work_date','status']);
    fields('payroll exact fields',pay,['employee_id','employee_name','year_month','gross','applied_hourly_wage']);
    fields('current pay exact fields',current,['employee_id','employee_name','base_salary','hourly_wage']);
    ok('no note/bank/snapshot in projections',!JSON.stringify({att,req,pay,current}).includes('PRIVATE-'));
    if(!allowed(key,a))ok('only self attendance',att.every(row=>row.employee_id===emp[key]));
    if(!allowed(key,p))ok('only self payroll',pay.every(row=>row.employee_id===emp[key]));
   }
   if(allowed(key,f)){
    const summary=(await finances(uid)).rows;
    check('store labor aggregate',Number(summary[0].labor_cost),5000);
    fields('financial aggregate exact fields',summary,['store_id','year_month','revenue','purchase_cost','labor_cost','fixed_expense','variable_expense','operating_profit']);
   }else await rejects('financial domain denied','FINANCIAL_SHARING_DENIED',()=>finances(uid));
   if(!admin)await rejects('finance sharing never opens individual labor source','DAILY_LABOR_FORBIDDEN',()=>as(uid,'SELECT get_daily_labor_sources($1,$2)',[store,'2026-10']));
  }
 }
 for(const t of raw)check(`shared reads preserve ${t} exactly`,(await db.query(`SELECT to_jsonb(x) j FROM ${t} x ORDER BY x.id`)).rows,originalRows[t]);
 for(const key of ['owner','manager'])ok('admin labor source unchanged',Array.isArray((await as(users[key],'SELECT get_daily_labor_sources($1,$2) r',[store,'2026-10'])).rows[0].r.payrolls));
 // 설정 즉시 반영, 급여 공유로 편집 불가, 고용형태 변경에 따른 공개 대상 이동.
 await setScopes('all_staff','all_staff','all_staff');
 for(const key of ['manager','regular','part','pending','outside','legacy']){
  await rejects('setter owner only','STORE_OWNER_REQUIRED',()=>as(users[key],"SELECT set_store_visibility($1,'none','none','none',0)",[store]));
  if(key==='manager')for(const col of ['financial_share_scope','attendance_share_scope','payroll_share_scope'])await rejects('raw settings owner only','STORE_OWNER_REQUIRED',()=>as(users[key],`UPDATE stores SET ${col}='none' WHERE id=$1`,[store]));
 }
 check('shared payroll does not allow other employee update',(await as(users.regular,"UPDATE employees SET bank_name='forbidden' WHERE id=$1 RETURNING id",[emp.part])).rows.length,0);
 check('shared payroll does not allow payroll update',(await as(users.regular,'UPDATE payroll SET gross=999 WHERE employee_id=$1 RETURNING id',[emp.part])).rows.length,0);
 await setScopes('regular_only','regular_only','regular_only');
 check('PT before promotion only self',(await payroll(users.part)).rows.length,1);
 await as(users.manager,"UPDATE employees SET employment_type='regular' WHERE id=$1",[emp.part]);
 check('employment type updates audience immediately',(await payroll(users.part)).rows.length,4);
 await as(users.manager,"UPDATE employees SET employment_type='part_time' WHERE id=$1",[emp.part]);
 check('employment type restores audience immediately',(await payroll(users.part)).rows.length,1);
 await setScopes('none','none','none');
 check('scope revocation applies next query',(await payroll(users.regular)).rows.length,1);
 const old=await visibility(users.owner);
 await setScopes('all_staff','none','all_staff');
 await rejects('stale visibility revision','VISIBILITY_REVISION_CONFLICT',()=>as(users.owner,"SELECT set_store_visibility($1,'none','none','none',$2)",[store,old.visibility_revision]));
 await as(users.owner,"SELECT set_store_financial_sharing($1,'none')",[store]);
 check('old setter preserves other scopes',(await visibility(users.owner)).payroll_share_scope,'all_staff');
 await rejects('invalid scope','INVALID_SHARE_SCOPE',()=>setScopes('bad','none','none'));
 await rejects('query period bounded','SHARED_QUERY_INVALID',()=>as(users.regular,"SELECT * FROM get_shared_attendance($1,'2020-01-01','2026-01-01')",[store]));
 await rejects('infinite period rejected','SHARED_QUERY_INVALID',()=>as(users.regular,"SELECT * FROM get_shared_attendance($1,'infinity','infinity')",[store]));
 await rejects('negative page rejected','SHARED_QUERY_INVALID',()=>as(users.regular,'SELECT * FROM get_shared_payroll($1,$2,10,-1)',[store,'2026-10']));
 await rejects('anon raw wage denied','permission denied',()=>as(null,'SELECT * FROM payroll'));
 await rejects('anon RPC denied','permission denied',()=>attendance(null));
 check('inactive unapproved user still reads own raw payroll',(await as(users.inactive,'SELECT * FROM payroll WHERE store_id=$1',[store])).rows.length,1);
 await db.query("INSERT INTO stores(id,owner_id,name) VALUES($1,$2,'QA-VISIBILITY-new')",[id(99),users.owner]);
 check('new default all none',(await db.query('SELECT financial_share_scope,attendance_share_scope,payroll_share_scope FROM stores WHERE id=$1',[id(99)])).rows[0],{financial_share_scope:'none',attendance_share_scope:'none',payroll_share_scope:'none'});
 const publicFunctions=['can_read_other_attendance(uuid)','can_read_other_payroll(uuid)','get_my_store_visibility(uuid)',
 'set_store_visibility(uuid,text,text,text,bigint)','get_shared_attendance(uuid,date,date,integer,integer)',
 'get_shared_attendance_requests(uuid,date,date,integer,integer)','get_shared_payroll(uuid,text,integer,integer)',
 'get_shared_employee_pay(uuid,integer,integer)','get_shared_financial_summary(uuid,text)'];
 for(const signature of publicFunctions){
  check('new function not anonymous',(await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') a",['public.'+signature])).rows[0].a,false);
  check('new function authenticated only',(await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') a",['public.'+signature])).rows[0].a,true);
 }
 for(const signature of ['can_read_shared_domain(uuid,text)','assert_store_visibility_access(uuid)','validate_shared_page(date,date,integer,integer)'])
  check('private function not directly executable',(await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') a",['private.'+signature])).rows[0].a,false);
 const before=await visibility(users.owner);
 await db.exec(sql);
 check('reapply preserves values and revision',await visibility(users.owner),before);

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

 // Permanent regressions from the 38 independent visibility-review probes.
 for(const who of ['regular','part','pending','outside','inactive','legacy'])for(const col of ['financial_share_scope','attendance_share_scope','payroll_share_scope'])
  check(`${who} cannot directly change ${col}`,(await as(users[who],`UPDATE stores SET ${col}='none' WHERE id=$1 RETURNING id`,[store])).rows.length,0);
 await setScopes('all_staff','all_staff','all_staff');
 await setScopes('none','none','none');
 for(const [name,fn,n] of [['attendance',attendance,2],['requests',requests,1],['payroll',payroll,1],['employee pay',employeePay,1]])
  check(`${name} scope revocation next response self only`,(await fn(users.regular)).rows.length,n);
 await setScopes('all_staff','all_staff','all_staff');
 await as(users.owner,"UPDATE store_members SET status='pending' WHERE id=$1",[member.regular]);
 for(const fn of [attendance,requests,payroll,employeePay])ok('linked pending audience cannot see other people',(await fn(users.regular)).rows.every(r=>r.employee_id===emp.regular));
 const pendingVisibility=await visibility(users.regular);
 for(const key of ['can_read_financials','can_read_other_attendance','can_read_other_payroll'])check(`pending linked audience ${key} denied`,pendingVisibility[key],false);
 await as(users.owner,"UPDATE store_members SET status='approved' WHERE id=$1",[member.regular]);
 await as(users.owner,'UPDATE employees SET user_id=NULL WHERE id=$1',[emp.regular]);
 for(const fn of [attendance,requests,payroll,employeePay])check('unlinked approved audience has no shared/self rows',(await fn(users.regular)).rows.length,0);
 check('unlinked approved audience no raw payroll',(await as(users.regular,'SELECT * FROM payroll WHERE store_id=$1',[store])).rows.length,0);
 await as(users.owner,'UPDATE employees SET user_id=$1 WHERE id=$2',[users.regular,emp.regular]);
 // Real LATERAL view returns each employee once and chooses latest effective history.
 const wageView=(await as(users.regular,'SELECT * FROM current_employee_wages WHERE store_id=$1',[store])).rows;
 check('actual wage view only self',wageView.map(r=>r.employee_id),[emp.regular]);
 check('actual wage view exact columns',Object.keys(wageView[0]).sort(),['employee_id','store_id','wage_history_id','effective_date','base_salary','hourly_wage','non_taxable'].sort());
 await as(users.owner,"INSERT INTO employee_wage_history(store_id,employee_id,effective_date,hourly_wage,created_at) VALUES($1,$2,'2026-02-01',14000,'2026-02-01'),($1,$2,'2099-01-01',99999,'2026-02-01')",[store,emp.regular]);
 const currentWage=(await as(users.regular,'SELECT * FROM current_employee_wages WHERE store_id=$1',[store])).rows;
 check('actual view uses latest effective history once',currentWage.length,1);
 check('actual view excludes future history',Number(currentWage[0].hourly_wage),14000);
 for(const name of ['attendance_insert_punch','attendance_schedule_flags','attendance_validate_correction_order','attendance_shift_partner']) {
  const funcs=(await db.query("SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",[name])).rows;
  ok(`internal ${name} fixture definition exists`,funcs.length>0);
  for(const f of funcs)for(const role of ['anon','authenticated'])check(`${role} cannot execute ${name}`,(await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') b",[role,f.oid])).rows[0].b,false);
 }
 await as(users.owner,'UPDATE stores SET deleted_at=now() WHERE id=$1',[store]);
 for(const fn of [attendance,requests,payroll,employeePay])await rejects('deleted store shared getter denied','STORE_ACCESS_DENIED',()=>fn(users.regular));
 await rejects('deleted store financial getter denied','FINANCIAL_SHARING_DENIED',()=>finances(users.regular));
 console.log(`Store visibility SQL: ${checks} checks passed (27 setting combinations; local PGlite).`);
}finally{await db.close();}
