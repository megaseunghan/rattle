// 로컬 PGlite 전용 / QA-QR-AUTO-20261118 / DBA 소유. 가상 직원, 2026-10~11월; 네트워크·실계정 없음.
// 기존 integration fixture의 축약 스키마를 참고. 실제 daily-work→QR→core→visibility→manager→legacy→자동 기록 체인 검사.
// 축약 스키마 + 실제 financial/QR/core/visibility 정의. 단일 연결, 실제 동시 트랜잭션 미검증.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
 regular_wage_snapshot jsonb,work_source text,taxable_base numeric,national_pension numeric,health_insurance numeric,
 long_term_care numeric,employment_insurance numeric,local_income_tax numeric,withholding_tax numeric,worked_minutes integer,
 work_note text,work_submission_id uuid,calculation_version text,revision integer DEFAULT 0,updated_at timestamptz,updated_by uuid,
 is_settled boolean DEFAULT false,settled_at timestamptz,UNIQUE(employee_id,year_month));
 CREATE TABLE employee_wage_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id),employee_id uuid REFERENCES employees(id),
 effective_date date,base_salary numeric,hourly_wage numeric,non_taxable numeric,memo text,created_at timestamptz DEFAULT now());
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
 for(const t of ['payroll_work_history','payroll_work_submissions'])await db.exec(`CREATE TABLE ${t}(
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
 const posCompatibility=await (await import('./validate-pos-visibility-compatibility-sql.mjs')).preparePosVisibilityCompatibility({db,users,store,otherStore,emp,member,as,migration});
 await db.exec(await migration('20261027011000_daily_work_snapshots.sql'));
 await db.exec(await migration('20261023123000_store_setup_financial_sharing.sql'));
 const wages=await migration('20261027010000_wage_effective_baselines.sql');
 await db.exec(wages.slice(wages.indexOf('CREATE FUNCTION public.regular_snapshot_gross'),wages.indexOf('-- Snapshot shape validation')));
 const summary=await migration('20261105140000_recurring_financial_summaries.sql');
 await db.exec(summary.slice(summary.indexOf('CREATE OR REPLACE FUNCTION'),summary.lastIndexOf('COMMIT;')));
 await db.exec(await migration('20261105020000_daily_labor_sources.sql'));
 // 실제 QR 체인 5개를 읽는다. QR 동작 자체의 회귀는 기존 QR 스크립트가 별도 검사.
 for(const name of ['20261116120000_qr_attendance.sql','20261116130000_qr_attendance_fixes.sql',
 '20261117120000_qr_attendance_retry_guard.sql','20261117130000_qr_attendance_hardening.sql','20261117140000_qr_attendance_policy.sql']) {
  if(name==='20261117120000_qr_attendance_retry_guard.sql')await posCompatibility.installDiskPatch();
  await db.exec(await migration(name));
 }
 await db.exec(`CREATE VIEW current_employee_wages WITH(security_invoker=true) AS SELECT * FROM employee_wage_history;`);
 for(const t of raw){
  await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;CREATE POLICY old_broad_read ON ${t} FOR SELECT TO authenticated USING(is_store_member(store_id));`);
  if(!['attendance_punches','attendance_correction_requests'].includes(t))await db.exec(`CREATE POLICY old_admin_all ON ${t} FOR ALL TO authenticated USING(is_store_admin(store_id)) WITH CHECK(is_store_admin(store_id));`);
 }
 await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; REVOKE INSERT,UPDATE,DELETE ON payroll_daily_work,payroll_daily_work_history FROM authenticated;');
 await db.exec(`ALTER TABLE payroll_work_submissions ADD COLUMN status text DEFAULT 'pending',ADD COLUMN version integer DEFAULT 1,
 ADD COLUMN reviewed_by uuid,ADD COLUMN reviewed_at timestamptz,ADD COLUMN review_note text,ADD COLUMN worked_minutes integer,
 ADD COLUMN submitted_by uuid,ADD COLUMN submitted_at timestamptz DEFAULT now();
 CREATE FUNCTION public.is_store_part_timer(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM employees WHERE store_id=sid AND user_id=auth.uid() AND employment_type='part_time')$$;`);
 for(const uid of Object.values(users))await db.query('INSERT INTO auth.users VALUES($1,$2)',[uid,'qa-auto@example.invalid']);
 await db.query("INSERT INTO stores(id,owner_id,name) VALUES($1,$2,'QA-QR-AUTO'),($3,$2,'QA-other')",[store,users.owner,otherStore]);
 for(const key of ['manager','regular','part','outside']){
  const sid=key==='outside'?otherStore:store;
  await db.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'member','approved')",[member[key],sid,users[key]]);
  await db.query("INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type,hourly_wage,joined_at) VALUES($1,$2,$3,$4,true,$5,10001,'2026-01-01')",
   [emp[key],sid,users[key],`QA-${key}`,key==='regular'?'regular':'part_time']);
 }
 await db.exec(await migration('20261117150000_role_model_core.sql'));
 await as(users.owner,'SELECT set_store_manager($1,$2,0)',[store,member.manager]);
 await posCompatibility.beforeVisibility();
 for(const name of ['20261117160000_store_visibility.sql','20261117170000_manager_rpc_policy.sql','20261117180000_legacy_admin_to_member.sql'])await db.exec(await migration(name));
 await posCompatibility.afterVisibility();
 await db.exec(await migration('20261118120000_qr_attendance_daily_work.sql'));
 const manual=async(key,kind,at)=> (await as(users.owner,'SELECT record_manual_attendance($1,$2,$3,$4,$5) r',
  [key==='outside'?otherStore:store,emp[key],kind,at,'QA-QR-AUTO'])).rows[0].r;
 const status=async(key,pid)=> (await as(users[key],'SELECT get_attendance_work_record($1) r',[pid])).rows[0].r;
 const retry=async(key,pid)=> (await as(users[key],'SELECT retry_attendance_work_record($1) r',[pid])).rows[0].r;
 const daily=async(key,date)=> (await db.query('SELECT * FROM payroll_daily_work WHERE employee_id=$1 AND work_date=$2',[emp[key],date])).rows[0];
 const correction=async(key,pid,kind,at,action='change')=>{
  const rid=(await as(users[key],'SELECT request_attendance_correction($1,$2,$3,$4,$5,$6,$7) r',[store,emp[key],action,pid,kind,at,'QA-correction'])).rows[0].r;
  return (await as(users.owner,'SELECT review_attendance_correction($1,true,$2) r',[rid,'QA-approved'])).rows[0].r;
 };
 const pin=await manual('part','clock_in','2026-10-10T00:00:00Z');
 check('출근만: 대기, 0분을 만들지 않음',(await status('part',pin)).state,'pending');
 check('일별 없음',await daily('part','2026-10-10'),undefined);
 const out=await manual('part','clock_out','2026-10-10T01:00:00Z');
 let day=await daily('part','2026-10-10');
 check('첫 퇴근 분/원단위/확인 대기',[day.worked_minutes,Number(day.gross),day.status],[60,10001,'pending']);
 check('자동 기록 완료는 관리자 확인과 별개',[(await status('part',out)).state,(await status('part',out)).review_status],['completed','pending']);
 const revision=day.revision;
 await retry('part',out);await retry('part',out);
 check('반복 재시도는 revision/합계 불변',[(await daily('part','2026-10-10')).revision,(await daily('part','2026-10-10')).worked_minutes],[revision,60]);
 await as(users.owner,"SELECT review_daily_work($1,$2,'approved','QA')",[day.id,day.revision]);
 // Existing monthly amounts are preserved; new sources invalidate settlement only.
 await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,worked_minutes,daily_work_snapshot,is_settled,settled_at) VALUES($1,$2,'2026-10',10001,60,daily_work_month_snapshot($2,'2026-10'),true,now())",[store,emp.part]);
 await manual('part','clock_in','2026-10-10T02:00:00Z');
 const secondOut=await manual('part','clock_out','2026-10-10T02:01:00Z');
 day=await daily('part','2026-10-10');
 check('같은날 재출근 일별 합산·일별 1회 반올림',[day.worked_minutes,Number(day.gross),day.status],[61,Math.round(61*10001/60),'pending']);
 check('최신 근무 분과 당일 합계 분 구분',[(await status('part',secondOut)).shift_minutes,(await status('part',secondOut)).daily_minutes],[1,61]);
 check('원본과 근무별 행 보존',(await db.query('SELECT count(*)::int n FROM private.attendance_work_shifts WHERE employee_id=$1 AND active',[emp.part])).rows[0].n,2);
 check('추가 퇴근 정산 해제·월 금액 보존',(await db.query('SELECT is_settled,gross::int FROM payroll WHERE employee_id=$1',[emp.part])).rows[0],{is_settled:false,gross:10001});
 // Rate snapshot is stable even when wage history/current conditions change.
 await db.query('UPDATE employees SET hourly_wage=20000 WHERE id=$1',[emp.part]);
 const fixed=await correction('part',secondOut,'clock_out','2026-10-10T02:02:00Z');
 day=await daily('part','2026-10-10');
 check('정정 자동 재계산·당시 시급 유지',[day.worked_minutes,Number(day.applied_hourly_wage),day.status],[62,10001,'pending']);
 check('원 퇴근 ID 조회는 최신 정정으로 연결',(await status('part',secondOut)).effective_punch_id,fixed);
 // Equal timestamps, including same transaction created_at, are explicit zero minutes.
 await db.exec('BEGIN');
 const zeroIn=await manual('manager','clock_in','2026-10-11T00:00:00Z');
 const zeroOut=await manual('manager','clock_out','2026-10-11T00:00:00Z');
 await db.exec('COMMIT');
 check('PT 점장도 자동 기록 대상·확인된 0분',[ (await status('manager',zeroOut)).eligible,(await status('manager',zeroOut)).shift_minutes,(await daily('manager','2026-10-11')).worked_minutes],[true,0,0]);
 const managerDay=await daily('manager','2026-10-11');
 await assert.rejects(as(users.manager,"SELECT review_daily_work($1,$2,'approved','')",[managerDay.id,managerDay.revision]));checks++;
 await as(users.owner,"SELECT review_daily_work($1,$2,'approved','QA')",[managerDay.id,managerDay.revision]);
 const regularIn=await manual('regular','clock_in','2026-10-11T00:00:00Z');
 const regularOut=await manual('regular','clock_out','2026-10-11T01:00:00Z');
 check('정규직은 자동 일별 대상 아님',(await status('regular',regularOut)).state,'not_applicable');
 check('정규직 월급 규칙 유지',await daily('regular','2026-10-11'),undefined);
 await rejects('비로그인 상태조회 차단','permission denied',()=>as(null,'SELECT get_attendance_work_record($1)',[out]));
 await rejects('다른 직원 상태 원본은 공유설정과 무관하게 차단','ATTENDANCE_WORK_FORBIDDEN',()=>as(users.regular,'SELECT get_attendance_work_record($1)',[out]));
 await rejects('다른 매장 상태 원본 차단','ATTENDANCE_WORK_FORBIDDEN',()=>as(users.outside,'SELECT get_attendance_work_record($1)',[out]));
 // Independent review LOW: rejected callers must not gain writes through the retry endpoint.
 for(const key of ['regular','outside']) {
  await rejects(`${key}: 타인/타매장 재계산 거부`,'ATTENDANCE_WORK_FORBIDDEN',
   ()=>as(users[key],'SELECT retry_attendance_work_record($1)',[out]));
 }
 await db.query("UPDATE store_members SET status='pending' WHERE store_id=$1 AND user_id=$2",[store,users.part]);
 try {
  for(const fn of ['get_attendance_work_record','retry_attendance_work_record']) {
   await rejects(`대기 멤버 본인 ${fn} 거부`,'ATTENDANCE_WORK_FORBIDDEN',
    ()=>as(users.part,`SELECT ${fn}($1)`,[out]));
  }
 } finally {
  await db.query("UPDATE store_members SET status='approved' WHERE store_id=$1 AND user_id=$2",[store,users.part]);
 }
 // Verify effective role privileges and explicit PUBLIC ACL; inherited/public grants must not reopen these APIs.
 for(const [signature,authenticated] of [
  ['public.get_attendance_work_record(uuid)',true],
  ['public.retry_attendance_work_record(uuid)',true],
  ['private.refresh_attendance_daily_work(uuid,date[])',false],
  ['public.attendance_shift_partner(uuid)',false],
  ['public.daily_work_month_snapshot(uuid,text)',false],
 ]) {
  const acl=(await db.query(`SELECT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
   has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_exec,
   EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_exec
   FROM pg_proc p WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
  check(`${signature}: anon 실행 권한 없음`,acl.anon_exec,false);
  check(`${signature}: authenticated 최소 권한`,acl.authenticated_exec,authenticated);
  check(`${signature}: PUBLIC 실행 권한 없음`,acl.public_exec,false);
 }
 await rejects('private 원본 접근 차단','permission denied',()=>as(users.part,'SELECT * FROM private.attendance_work_shifts'));
 await rejects('수동 일별 제출 RPC 차단','permission denied',()=>as(users.part,"SELECT save_daily_work($1,'2026-10-12',1,'QA',NULL)",[emp.part]));
 await rejects('관리자도 수동 제출 RPC 차단','permission denied',()=>as(users.owner,"SELECT submit_work_minutes($1,'2026-10',1,'QA',NULL)",[emp.part]));
 await rejects('기존 permissive 정책으로 제출 직접 쓰기 불가','permission denied',()=>as(users.part,'INSERT INTO payroll_work_submissions(store_id,employee_id) VALUES($1,$2)',[store,emp.part]));
 // Cross-midnight correction moves both the pair and its day aggregate.
 const nightIn=await manual('part','clock_in','2026-10-12T13:00:00Z');
 const nightOut=await manual('part','clock_out','2026-10-12T17:00:00Z');
 check('야간 출근일에 240분',(await daily('part','2026-10-12')).worked_minutes,240);
 await correction('part',nightIn,'clock_in','2026-10-12T16:00:00Z');
 check('출근 날짜 정정 새날 60분',(await daily('part','2026-10-13')).worked_minutes,60);
 check('이전 날은 0분으로 위조하지 않음',(await daily('part','2026-10-12')).worked_minutes,240);
 check('이전 날 stale 승인 방지',(await daily('part','2026-10-12')).status,'pending');
 const stale=await daily('part','2026-10-12');
 await rejects('이전 날 빈 짝은 재계산 전 승인 불가','ATTENDANCE_WORK_RECALC_REQUIRED',()=>as(users.owner,"SELECT review_daily_work($1,$2,'approved','QA')",[stale.id,stale.revision]));
 check('현재 일별 목록은 이동 전 날짜 제외',(await as(users.part,"SELECT count(*)::int n FROM payroll_daily_work WHERE employee_id=$1 AND work_date='2026-10-12'",[emp.part])).rows[0].n,0);
 // A missing wage must preserve a confirmed checkout and expose a retryable failure.
 await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[emp.outside]);
 await manual('outside','clock_in','2026-10-14T00:00:00Z');
 const failOut=await manual('outside','clock_out','2026-10-14T01:00:00Z');
 await rejects('누락 시급으로 일별 인건비 확정 합계를 만들지 않음','ATTENDANCE_WORK_RECALC_REQUIRED',()=>as(users.owner,"SELECT get_daily_labor_sources($1,'2026-10')",[otherStore]));
 check('시급 누락은 퇴근 보존·실패',[(await status('outside',failOut)).state,(await status('outside',failOut)).error_code],['failed','DAILY_WORK_RATE_REQUIRED']);
 check('실패는 0분 아님',await daily('outside','2026-10-14'),undefined);
 await db.query('UPDATE employees SET hourly_wage=12000 WHERE id=$1',[emp.outside]);
 check('시급 보완 후 재시도',(await retry('outside',failOut)).state,'completed');
 check('재시도 분/금액',[(await daily('outside','2026-10-14')).worked_minutes,Number((await daily('outside','2026-10-14')).gross)],[60,12000]);
 // Inclusive 16h automatic kind boundary via private insertion helper (public scanner tested below).
 await manual('manager','clock_in','2026-10-15T00:00:00Z');
 const at16=(await db.query("SELECT (attendance_insert_punch(e,'2026-10-15T16:00:00Z','manual',NULL,NULL,NULL,NULL,'QA',NULL)).id r FROM employees e WHERE id=$1",[emp.manager])).rows[0].r;
 check('정확히 16시간은 퇴근/960분',[(await db.query('SELECT kind FROM attendance_punches WHERE id=$1',[at16])).rows[0].kind,(await status('manager',at16)).shift_minutes],['clock_out',960]);
 await manual('manager','clock_in','2026-10-17T00:00:00Z');
 const over16=(await db.query("SELECT (attendance_insert_punch(e,'2026-10-17T16:00:01Z','manual',NULL,NULL,NULL,NULL,'QA',NULL)).id r FROM employees e WHERE id=$1",[emp.manager])).rows[0].r;
 check('16시간 초과 열린 근무는 새 출근',(await db.query('SELECT kind FROM attendance_punches WHERE id=$1',[over16])).rows[0].kind,'clock_in');
 check('누락 퇴근을 960분 처리하지 않음',await daily('manager','2026-10-17'),undefined);
 // 1440 inclusive; a corrected 1441st minute must fail without truncation or losing attendance.
 await manual('manager','clock_in','2026-10-31T15:00:00Z');
 await manual('manager','clock_out','2026-11-01T03:00:00Z');
 await manual('manager','clock_in','2026-11-01T03:00:00Z');
 const fullOut=await manual('manager','clock_out','2026-11-01T15:00:00Z');
 check('1440분 포함',(await daily('manager','2026-11-01')).worked_minutes,1440);
 const excess=await correction('manager',fullOut,'clock_out','2026-11-01T15:01:00Z');
 check('1441분은 실패 상태·퇴근 보존',[(await status('manager',excess)).state,(await status('manager',excess)).error_code],['failed','ATTENDANCE_WORK_DAY_LIMIT']);
 check('1441분을 1440으로 성공 처리하지 않음',(await daily('manager','2026-11-01')).status,'pending');
 const fullDay=await daily('manager','2026-11-01');
 await rejects('실패한 재계산 승인 차단','ATTENDANCE_WORK_RECALC_REQUIRED',()=>as(users.owner,"SELECT review_daily_work($1,$2,'approved','QA')",[fullDay.id,fullDay.revision]));
 await rejects('실패 날짜 포함 월 정산 차단','ATTENDANCE_WORK_RECALC_REQUIRED',()=>as(users.owner,"INSERT INTO payroll(store_id,employee_id,year_month,gross,is_settled) VALUES($1,$2,'2026-11',0,true)",[store,emp.manager]));
 const repaired=await correction('manager',excess,'clock_out','2026-11-01T15:00:00Z');
 check('정정으로 실패 복구',(await status('manager',repaired)).state,'completed');
 check('자정 이동한 이전 날짜는 월 스냅샷에서 제외',
  (await db.query("SELECT daily_work_month_snapshot($1,'2026-10') s",[emp.part])).rows[0].s.some(x=>x.work_date==='2026-10-12'),false);
 // Actual anon scanner -> signed nonce -> checkout -> persisted daily record; replay cannot change revision.
 const device=(await as(users.part,"SELECT register_attendance_device('QA') r")).rows[0].r;
 const scanner=(await as(users.owner,"SELECT register_attendance_scanner($1,'QA') r",[store])).rows[0].r;
 const qr=async()=>{
  const n=(await as(users.part,'SELECT issue_attendance_qr($1) r',[device.device_id])).rows[0].r.nonce;
  const sig=createHmac('sha256',Buffer.from(device.secret,'base64')).update(`${device.device_id}.${n}`).digest().subarray(0,16).toString('hex');
  return `rattle-punch:v1.${device.device_id}.${n}.${sig}`;
 };
 await manual('part','clock_in',new Date(Date.now()-2*60*60*1000).toISOString());
 const q1=await qr();
 const scan=async q=>(await as(null,'SELECT punch_attendance($1,$2) r',[scanner.token,q])).rows[0].r;
 const scanned=await scan(q1);
 check('실제 스캐너 퇴근',scanned.kind,'clock_out');
 const confirmed=await status('part',scanned.punch_id);
 check('실제 스캐너 자동 기록 완료',confirmed.state,'completed');
 const replay=await scan(q1);
 const again=await scan(await qr());
 check('같은 QR/60초 새QR 중복 퇴근 방지',[replay.punch_id,again.punch_id],[scanned.punch_id,scanned.punch_id]);
 check('QR 재시도 인건비 중복0',(await status('part',scanned.punch_id)).daily_revision,confirmed.daily_revision);
 check('내 기록 조회에는 공유 설정 무관', (await status('part',scanned.punch_id)).shift_minutes,120);
 const orphan=await manual('outside','clock_out','2026-11-08T01:00:00Z');
 check('짝 없는 확정 퇴근은 실패로 구분',[(await status('outside',orphan)).state,(await status('outside',orphan)).error_code],['failed','ATTENDANCE_WORK_PAIR_REQUIRED']);
 check('누락 출근은 0분 일별로 만들지 않음',await daily('outside','2026-11-08'),undefined);
 await rejects('짝 누락도 월 합계 확인 필요','ATTENDANCE_WORK_RECALC_REQUIRED',()=>as(users.owner,"SELECT get_daily_labor_sources($1,'2026-11')",[otherStore]));
 // 2026-11-18 user decision: retired employees retain own reads; only current owner/manager may retry.
 // Reproduce the independent review's former MEDIUM: missing rate -> retire -> rate repair -> own retry.
 await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[emp.outside]);
 await manual('outside','clock_in','2026-11-11T00:00:00Z');
 const retiredOut=await manual('outside','clock_out','2026-11-11T01:00:00Z');
 await db.query('UPDATE employees SET is_active=false,hourly_wage=18000 WHERE id=$1',[emp.outside]);
 const retiredState=await status('outside',retiredOut);
 check('퇴사자 본인 과거 자동 기록 조회 유지',[retiredState.state,retiredState.error_code],['failed','DAILY_WORK_RATE_REQUIRED']);
 const beforeRetiredRetry=(await db.query(`SELECT
  (SELECT count(*)::int FROM payroll_daily_work WHERE employee_id=$1 AND work_date='2026-11-11') daily_count,
  (SELECT count(*)::int FROM payroll_daily_work_history WHERE employee_id=$1 AND work_date='2026-11-11') history_count,
  (SELECT to_jsonb(s) FROM private.attendance_work_sync s WHERE employee_id=$1 AND work_date='2026-11-11') sync`,[emp.outside])).rows[0];
 await rejects('MEDIUM 재현: 퇴사자 본인 retry 거부','ATTENDANCE_WORK_FORBIDDEN',()=>retry('outside',retiredOut));
 check('거부된 퇴사자 retry는 일별/감사/동기화 상태 불변',(await db.query(`SELECT
  (SELECT count(*)::int FROM payroll_daily_work WHERE employee_id=$1 AND work_date='2026-11-11') daily_count,
  (SELECT count(*)::int FROM payroll_daily_work_history WHERE employee_id=$1 AND work_date='2026-11-11') history_count,
  (SELECT to_jsonb(s) FROM private.attendance_work_sync s WHERE employee_id=$1 AND work_date='2026-11-11') sync`,[emp.outside])).rows[0],beforeRetiredRetry);
 const ownerRetry=(await as(users.owner,'SELECT retry_attendance_work_record($1) r',[retiredOut])).rows[0].r;
 check('사장은 퇴사자 실패 기록 복구 가능',ownerRetry.state,'completed');
 check('사장 복구는 실제 분/시급으로 기록하고 관리자 확인과 분리',
  [ownerRetry.daily_minutes,Number(ownerRetry.daily_gross),ownerRetry.review_status],[60,18000,'pending']);
 // A manager of the target store may repair a former employee, without assuming ownership of the other store.
 await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[emp.part]);
 await manual('part','clock_in','2026-11-12T00:00:00Z');
 const retiredPartOut=await manual('part','clock_out','2026-11-12T01:00:00Z');
 await db.query('UPDATE employees SET is_active=false,hourly_wage=16000 WHERE id=$1',[emp.part]);
 const managerRetry=(await as(users.manager,'SELECT retry_attendance_work_record($1) r',[retiredPartOut])).rows[0].r;
 check('해당 매장 점장도 퇴사자 실패 기록 복구 가능',managerRetry.state,'completed');
 check('점장 복구도 자동 확인 승격 없음',
  [managerRetry.daily_minutes,Number(managerRetry.daily_gross),managerRetry.review_status],[60,16000,'pending']);
 // Advisory lock contract: scan, correction and retry serialize the same employee scope.
 const definition=(await db.query("SELECT pg_get_functiondef('public.retry_attendance_work_record(uuid)'::regprocedure) d")).rows[0].d;
 ok('재시도는 같은 attendance 직원 잠금',definition.includes("'attendance_punch:'")&&definition.indexOf('FOR SHARE')<definition.indexOf('pg_advisory_xact_lock'));
 ok('활성/관리 권한은 잠금 전후 두 번 검사',definition.match(/e\.is_active IS TRUE/g)?.length===2 && definition.indexOf('e.is_active IS TRUE')<definition.indexOf('FOR SHARE') && definition.lastIndexOf('e.is_active IS TRUE')>definition.indexOf('pg_advisory_xact_lock'));
 console.log(`PASS QR automatic daily work: ${checks} checks (QA-QR-AUTO-20261118, PGlite, no remote).`);
 await (await import('./validate-scanner-pairing-sql.mjs')).validateScannerPairing({db,users,store,otherStore,emp,member,as,migration});
 await (await import('./validate-attendance-auto-apply-sql.mjs')).validateAttendanceAutoApply({db,users,store,emp,member,as,migration});
 await posCompatibility.verifyFinalChain();
 await (await import('./validate-join-wage-required-sql.mjs')).validateJoinWageRoles({db,users,store,as,migration});
} finally { await db.close(); }
