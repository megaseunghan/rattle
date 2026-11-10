// Isolated synthetic fixture only. Never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const owner='00000000-0000-4000-8000-000000000001', member='00000000-0000-4000-8000-000000000002', store='00000000-0000-4000-8000-000000000003', other='00000000-0000-4000-8000-000000000004';
let checks=0;
async function read(user, target=store, month='2026-11') {
 await db.exec('BEGIN');
 try {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
  await db.exec('SET LOCAL ROLE authenticated');
  const result=await db.query('SELECT get_daily_labor_sources($1,$2) data',[target,month]);
  await db.exec('COMMIT'); return result.rows[0].data;
 } catch(e) { await db.exec('ROLLBACK'); throw e; }
}
function check(a,b){ assert.deepEqual(a,b); checks++; }
try {
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid);
 CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid())$$;
 CREATE FUNCTION get_financial_summaries_v2(uuid[],text[],boolean) RETURNS TABLE(labor_cost numeric) LANGUAGE sql AS $$SELECT 100::numeric$$;
 CREATE TABLE employees(id uuid,store_id uuid,joined_at date,is_active boolean,employment_type text,is_resigned_during_probation boolean);
 CREATE TABLE payroll(id uuid DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,year_month text,gross numeric,regular_wage_snapshot jsonb,daily_work_snapshot jsonb,applied_hourly_wage numeric,work_source text);
 CREATE TABLE payroll_daily_work(id uuid DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,work_date date,revision integer,status text);
 CREATE TABLE employee_wage_history(id uuid DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,effective_date date,created_at timestamptz DEFAULT now(),base_salary numeric,non_taxable numeric);
 GRANT USAGE ON SCHEMA auth TO authenticated;`);
 await db.query('INSERT INTO stores VALUES($1,$2),($3,$4)',[store,owner,other,member]);
 await db.query("INSERT INTO employees VALUES($1,$2,'2026-01-01',true,'regular',false),($3,$4,'2026-01-01',true,'regular',false)",[owner,store,member,other]);
 await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross) VALUES($1,$2,'2026-11',100),($1,$2,'2026-10',90),($3,$4,'2026-11',999)",[store,owner,other,member]);
 await db.query("INSERT INTO payroll_daily_work(store_id,employee_id,work_date,revision,status) VALUES($1,$2,'2026-11-01',1,'approved'),($1,$2,'2026-10-01',1,'pending')",[store,owner]);
 await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary,non_taxable) VALUES($1,$2,'2026-01-01',100,0),($1,$2,'2026-12-01',200,0)",[store,owner]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261105020000_daily_labor_sources.sql',import.meta.url),'utf8'));
 const result=await read(owner);
 check(result.monthlyLaborCost,100);check(result.employees.length,1);check(result.payrolls.length,1);check(result.payrolls[0].gross,100);check(result.dailyWork.length,1);check(result.wages.length,1);
 check(Object.keys(result.employees[0]).sort(),['employment_type','id','is_active','is_resigned_during_probation','joined_at','store_id']);
 for (const [u,s] of [[member,store],[owner,other],['',store],[owner,null]]) { await assert.rejects(read(u,s),/FORBIDDEN/);checks++; }
 await assert.rejects(read(owner,store,'2026-13'),/INVALID/);checks++;
 check((await db.query("SELECT has_function_privilege('anon','get_daily_labor_sources(uuid,text)','EXECUTE') ok")).rows[0].ok,false);
 check((await db.query('SELECT count(*)::integer n FROM payroll')).rows[0].n,3);
 console.log(`PASS daily labor SQL ${checks} checks (PGlite, synthetic, no remote writes)`);
} finally { await db.close(); }
