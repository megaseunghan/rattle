// Local isolated database; does not connect to Supabase or read credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const admin='00000000-0000-0000-0000-000000000001', sid='00000000-0000-0000-0000-000000000002', eid='00000000-0000-0000-0000-000000000003';
try {
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE stores(id uuid primary key, owner_id uuid, closing_time time);
CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) $$;
CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT is_store_admin(s) $$;
CREATE FUNCTION can_read_store_financials(s uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT is_store_admin(s) $$;
CREATE TABLE employees(id uuid primary key,store_id uuid,joined_at date,created_at timestamptz DEFAULT now(),base_salary numeric,hourly_wage numeric,non_taxable numeric,employment_type text,is_active boolean default true,is_resigned_during_probation boolean default false);
CREATE TABLE employee_wage_history(id uuid primary key default gen_random_uuid(),store_id uuid,employee_id uuid,effective_date date,base_salary numeric,hourly_wage numeric,non_taxable numeric,memo text,created_by uuid,created_at timestamptz default now());
CREATE TABLE payroll(id uuid primary key default gen_random_uuid(),store_id uuid,employee_id uuid,year_month text,gross numeric,applied_hourly_wage numeric,work_source text);
CREATE TABLE toss_orders(store_id uuid,status text,order_at timestamptz,total_amount numeric,card_amount numeric,cash_amount numeric);
CREATE TABLE manual_sales(store_id uuid,date date,card_amount numeric,cash_amount numeric);
CREATE TABLE purchases(store_id uuid,date date,amount numeric);
CREATE TABLE expenses(store_id uuid,year_month text,category text,amount numeric);`);
await db.query('INSERT INTO stores VALUES($1,$2,$3)',[sid,admin,'00:00']);
await db.query("INSERT INTO employees(id,store_id,joined_at,base_salary,non_taxable,employment_type) VALUES($1,$2,'2026-01-01',3100000,200000,'regular')",[eid,sid]);
await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary,non_taxable) VALUES($1,$2,'2026-01-15',3000000,200000)",[sid,eid]);
await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross) VALUES($1,$2,'2026-01',2500000)",[sid,eid]);
await db.exec(await readFile(new URL('../supabase/migrations/20261027010000_wage_effective_baselines.sql',import.meta.url),'utf8'));
assert.equal((await db.query('SELECT base_salary FROM employee_wage_history WHERE employee_id=$1 ORDER BY effective_date LIMIT 1',[eid])).rows[0].base_salary,'3000000');
assert.equal((await db.query('SELECT gross FROM payroll')).rows[0].gross,'2500000');
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[admin]);
await db.query("SELECT * FROM add_employee_wage_change($1,'2026-02-01',3400000,NULL,200000,'raise')",[eid]);
for(const invalid of [{employment_type:'part_time',hourly_wage:0},{employment_type:'part_time',hourly_wage:null},{employment_type:'regular',base_salary:0},{employment_type:'regular',base_salary:100,non_taxable:200}]) {
 await assert.rejects(()=>db.query('SELECT * FROM create_employee_with_initial_wage($1,$2)',[sid,{...invalid,joined_at:'2026-01-01'}]));
}

await assert.rejects(()=>db.query("SELECT * FROM add_employee_wage_change($1,'2025-12-01',3400000,NULL,200000,'bad')",[eid]));
await assert.rejects(()=>db.query("SELECT * FROM add_employee_wage_change($1,'2026-02-01',3500000,NULL,200000,'duplicate')",[eid]));
await db.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false)");
await assert.rejects(()=>db.query("SELECT * FROM add_employee_wage_change($1,'2026-03-01',3500000,NULL,200000,'forbidden')",[eid]));
await assert.rejects(()=>db.query("SELECT * FROM get_financial_summaries_v2(ARRAY[$1::uuid],ARRAY['2026-01'],false)",[sid]));
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[admin]);
const snapshot={version:1,year_month:'2026-02',days:Array.from({length:28},(_,i)=>({date:`2026-02-${String(i+1).padStart(2,'0')}`,base_salary:2800000,non_taxable:200000,factor:1}))};
assert.equal((await db.query("SELECT regular_snapshot_gross($1,'2026-02-10') gross",[snapshot])).rows[0].gross,'1000000');
await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,regular_wage_snapshot) VALUES($1,$2,'2026-02',2800000,$3)",[sid,eid,snapshot]);
await assert.rejects(()=>db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,regular_wage_snapshot) VALUES($1,$2,'2026-02',999,$3)",[sid,eid,snapshot]));
const result=await db.query("SELECT labor_cost FROM get_financial_summaries_v2(ARRAY[$1::uuid],ARRAY['2026-01'],false)",[sid]);
assert.equal(result.rows[0].labor_cost,'2500000');
await assert.rejects(()=>db.query("UPDATE payroll SET regular_wage_snapshot=NULL WHERE year_month='2026-02'"));
await db.exec('ALTER TABLE payroll ADD COLUMN daily_work_snapshot jsonb');
await assert.rejects(()=>db.query("UPDATE payroll SET daily_work_snapshot='[]'::jsonb WHERE year_month='2026-02'"));
const clock=(await db.query("SELECT to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM') ym,extract(day FROM now() AT TIME ZONE 'Asia/Seoul')::int elapsed,extract(day FROM date_trunc('month',now() AT TIME ZONE 'Asia/Seoul')+interval '1 month - 1 day')::int count")).rows[0];
const current={version:1,year_month:clock.ym,days:Array.from({length:clock.count},(_,i)=>({date:`${clock.ym}-${String(i+1).padStart(2,'0')}`,base_salary:clock.count*100000,non_taxable:0,factor:1}))};
await db.query('INSERT INTO payroll(store_id,employee_id,year_month,gross,regular_wage_snapshot) VALUES($1,$2,$3,$4,$5)',[sid,eid,clock.ym,clock.count*100000,current]);
const accrued=await db.query('SELECT labor_cost FROM get_financial_summaries_v2(ARRAY[$1::uuid],ARRAY[$2::text],false)',[sid,clock.ym]);
assert.equal(Number(accrued.rows[0].labor_cost),clock.elapsed*100000);
console.log('PASS regular wages SQL: baseline, retained slip, effective change, duplicate/pre-hire/permission, snapshot amount, historical financial aggregate');
} finally {await db.close();}
