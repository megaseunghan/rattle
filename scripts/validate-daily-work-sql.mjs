// Local PGlite only: no environment credentials or remote writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const admin='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', stranger='00000000-0000-4000-8000-000000000003', store='00000000-0000-4000-8000-000000000004', emp='00000000-0000-4000-8000-000000000005';
let checks=0;
function check(actual, expected, name) { assert.deepEqual(actual,expected,name); checks++; }
async function as(uid, sql, values=[]) {
 await db.exec('BEGIN');
 try { await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]); await db.exec('SET LOCAL ROLE authenticated'); const result=await db.query(sql,values); await db.exec('COMMIT');return result; }
 catch(e) { await db.exec('ROLLBACK');throw e; }
}
async function rejects(uid,sql,values,code) { await assert.rejects(as(uid,sql,values),e=>e.message.includes(code));checks++; }
try {
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
 CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid);
 CREATE TABLE employees(id uuid PRIMARY KEY,store_id uuid REFERENCES stores(id),user_id uuid,joined_at date,employment_type text,is_active boolean,hourly_wage numeric);
 CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid())$$;
 CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT is_store_admin(s) OR EXISTS(SELECT 1 FROM employees WHERE store_id=s AND user_id=auth.uid() AND is_active)$$;
 CREATE FUNCTION can_read_employee(s uuid,e uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT is_store_admin(s) OR EXISTS(SELECT 1 FROM employees WHERE id=e AND store_id=s AND user_id=auth.uid() AND is_active)$$;
 CREATE TABLE employee_wage_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,effective_date date,hourly_wage numeric,created_at timestamptz DEFAULT now());
 CREATE TABLE payroll(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,year_month text,gross numeric,taxable_base numeric,national_pension numeric,health_insurance numeric,long_term_care numeric,employment_insurance numeric,income_tax numeric,local_income_tax numeric,withholding_tax numeric,net_pay numeric,worked_minutes integer,applied_hourly_wage numeric,work_note text,work_source text,work_submission_id uuid,calculation_version text,revision integer DEFAULT 0,updated_at timestamptz,updated_by uuid,is_settled boolean DEFAULT false,settled_at timestamptz,UNIQUE(employee_id,year_month));
 ALTER TABLE payroll ENABLE ROW LEVEL SECURITY; CREATE POLICY payroll_admin ON payroll FOR ALL TO authenticated USING(is_store_admin(store_id)) WITH CHECK(is_store_admin(store_id));
 GRANT SELECT,INSERT,UPDATE ON payroll TO authenticated;
 CREATE TABLE payroll_work_submissions(id uuid,employee_id uuid,store_id uuid,year_month text,version integer,status text,worked_minutes integer);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261018_part_time_minutes_settlement.sql',import.meta.url),'utf8'));
 await db.exec('GRANT SELECT,UPDATE ON employees TO authenticated; GRANT SELECT ON payroll_work_submissions TO authenticated;');
 await db.exec('CREATE TRIGGER prepare_payroll_work BEFORE INSERT OR UPDATE ON payroll FOR EACH ROW EXECUTE FUNCTION prepare_payroll_work();');
 const legacy=await readFile(new URL('../supabase/migrations/20261019_payroll_submissions.sql',import.meta.url),'utf8');
 await db.exec(legacy.slice(legacy.indexOf('CREATE FUNCTION public.validate_payroll_submission()'),legacy.indexOf('-- 기존 직원 테이블')));
 await db.exec('CREATE TABLE payroll_work_history(id uuid DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,year_month text,operation text,old_record jsonb,new_record jsonb,changed_by uuid);');
 const auditSql=await readFile(new URL('../supabase/migrations/20261016_manual_work_minutes.sql',import.meta.url),'utf8');
 await db.exec(auditSql.slice(auditSql.indexOf('CREATE FUNCTION public.audit_payroll_work()'),auditSql.indexOf('DROP POLICY IF EXISTS payroll_store_member')));
 await db.exec(await readFile(new URL('../supabase/migrations/20261027011000_daily_work_snapshots.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])',[[admin,user,stranger]]);
 await db.query('INSERT INTO stores VALUES($1,$2)',[store,admin]);
 await db.query("INSERT INTO employees VALUES($1,$2,$3,'2026-01-01','part_time',true,15000)",[emp,store,user]);
 await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,hourly_wage) VALUES($1,$2,'2026-01-01',12000),($1,$2,'2026-10-15',15000)",[store,emp]);
 let day=(await as(user,"SELECT * FROM save_daily_work($1,'2026-10-14',480,'휴게 제외',NULL)",[emp])).rows[0];
 check(Number(day.applied_hourly_wage),12000,'old date rate'); check(Number(day.gross),96000,'day amount');check(day.status,'pending','self submit pending');
 await rejects(stranger,"SELECT * FROM save_daily_work($1,'2026-10-14',1,'침범',1)",[emp],'FORBIDDEN');
 check((await as(stranger,'SELECT * FROM payroll_daily_work')).rows.length,0,'other user cannot read');
 await rejects(user,"UPDATE payroll_daily_work SET gross=1 WHERE id=$1",[day.id],'permission denied');
 await rejects(user,"SELECT * FROM save_daily_work($1,'2026-10-14',480,'중복',NULL)",[emp],'CHANGED');
 await rejects(user,"SELECT * FROM save_daily_work($1,'2026-10-13',1441,'초과',NULL)",[emp],'INVALID');
 await rejects(user,"SELECT * FROM review_daily_work($1,1,'approved','')",[day.id],'FORBIDDEN');
 day=(await as(admin,"SELECT * FROM review_daily_work($1,1,'approved','확인')",[day.id])).rows[0];
 let second=(await as(admin,"SELECT * FROM save_daily_work($1,'2026-10-15',1,'시급 변경일',NULL)",[emp])).rows[0];
 check(Number(second.applied_hourly_wage),15000,'new date rate');check(Number(second.gross),250,'day rounding');
 const snap=async()=> (await db.query("SELECT daily_work_month_snapshot($1,'2026-10') snapshot",[emp])).rows[0].snapshot;
 const calculated=amount=>({gross:amount,taxable_base:0,national_pension:0,health_insurance:0,long_term_care:0,employment_insurance:0,income_tax:0,local_income_tax:0,withholding_tax:0,net_pay:amount,calculation_version:'test'});
 const apply="SELECT * FROM apply_daily_payroll($1,'2026-10',$2::jsonb,$3::jsonb,$4)";
 let snapshot=await snap();
 await rejects(user,apply,[emp,JSON.stringify(snapshot),JSON.stringify(calculated(96250)),null],'FORBIDDEN');
 await rejects(admin,apply,[emp,JSON.stringify(snapshot),JSON.stringify(calculated(1)),null],'TOTAL_MISMATCH');
 let payroll=(await as(admin,apply,[emp,JSON.stringify(snapshot),JSON.stringify(calculated(96250)),null])).rows[0];
 check(Number(payroll.gross),96250,'monthly sum');check(payroll.applied_hourly_wage,null,'no fabricated average rate');
 await as(admin,'UPDATE payroll SET is_settled=true WHERE id=$1',[payroll.id]);
 await db.query("UPDATE employee_wage_history SET hourly_wage=22000 WHERE employee_id=$1",[emp]);
 day=(await as(user,"SELECT * FROM save_daily_work($1,'2026-10-14',420,'시간 정정',2)",[emp])).rows[0];
 check(Number(day.applied_hourly_wage),12000,'snapshot rate preserved on correction');
 payroll=(await db.query('SELECT * FROM payroll WHERE id=$1',[payroll.id])).rows[0];
 check(Number(payroll.gross),96250,'submitted correction preserves monthly gross');check(payroll.is_settled,false,'correction unsettles');
 await rejects(admin,'UPDATE payroll SET is_settled=true WHERE id=$1',[payroll.id],'REVIEW_REQUIRED');
 await rejects(admin,apply,[emp,JSON.stringify(snapshot),JSON.stringify(calculated(96250)),payroll.revision],'REVIEW_REQUIRED');
 check((await as(user,'SELECT * FROM payroll_daily_work_history')).rows.length,4,'immutable day revisions visible to own');
 await rejects(user,'DELETE FROM payroll_daily_work_history',[],'permission denied');
 await as(admin,"SELECT * FROM review_daily_work($1,3,'approved','수정 확인')",[day.id]);
 snapshot=await snap();
 payroll=(await as(admin,apply,[emp,JSON.stringify(snapshot),JSON.stringify(calculated(84250)),payroll.revision])).rows[0];
 check(Number(payroll.gross),84250,'approved correction applies explicitly');
 await rejects(admin,"UPDATE payroll SET daily_work_snapshot=NULL WHERE id=$1",[payroll.id],'LEGACY_OVERWRITE');
 const legacyEmp='00000000-0000-4000-8000-000000000006';
 await db.query("INSERT INTO employees VALUES($1,$2,$3,'2026-01-01','part_time',true,10000)",[legacyEmp,store,user]);
 await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,hourly_wage) VALUES($1,$2,'2026-01-01',10000)",[store,legacyEmp]);
 const oldPay=(await as(admin,"INSERT INTO payroll(store_id,employee_id,year_month,gross,net_pay,worked_minutes,applied_hourly_wage,work_source,work_note) VALUES($1,$2,'2026-10',500000,500000,3000,10000,'manual','기존 월 합계') RETURNING *",[store,legacyEmp])).rows[0];
 await as(admin,"SELECT * FROM save_daily_work($1,'2026-10-01',1,'첫 날',NULL)",[legacyEmp]);
 await as(admin,"SELECT * FROM save_daily_work($1,'2026-10-02',1,'둘째 날',NULL)",[legacyEmp]);
 check(Number((await db.query('SELECT gross FROM payroll WHERE id=$1',[oldPay.id])).rows[0].gross),500000,'new daily input leaves legacy monthly payroll unchanged');
 await rejects(admin,'UPDATE payroll SET is_settled=true WHERE id=$1',[oldPay.id],'REVIEW_REQUIRED');
 const legacySnap=(await db.query("SELECT daily_work_month_snapshot($1,'2026-10') snapshot",[legacyEmp])).rows[0].snapshot;
 const converted=(await as(admin,apply,[legacyEmp,JSON.stringify(legacySnap),JSON.stringify(calculated(334)),0])).rows[0];
 check(Number(converted.gross),334,'daily rounding first gives 167+167 not monthly 333');
 check((await db.query("SELECT count(*)::integer n FROM payroll_work_history WHERE employee_id=$1 AND old_record->>'gross'='500000' AND new_record->>'gross'='334'",[legacyEmp])).rows[0].n,1,'legacy original snapshot retained in payroll audit');
 await db.query('UPDATE employees SET is_active=false WHERE id=$1',[emp]);
 check((await as(user,'SELECT * FROM payroll_daily_work WHERE employee_id=$1',[emp])).rows.length,0,'inactive self cannot read daily records');
 await rejects(user,"SELECT * FROM save_daily_work($1,'2026-10-03',1,'퇴사 후',NULL)",[emp],'FORBIDDEN');
 console.log(`PASS daily work SQL ${checks} checks (PGlite isolated, no remote state)`);
} finally { await db.close(); }
