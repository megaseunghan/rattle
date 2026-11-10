// Isolated PGlite fixture. No network, environment secrets, real staff or remote writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const store='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const user='10000000-0000-0000-0000-000000000001';
const source='20000000-0000-0000-0000-000000000001';
const otherFixed='20000000-0000-0000-0000-000000000002';
const third='20000000-0000-0000-0000-000000000003';
const foreignSource='20000000-0000-0000-0000-000000000004';
const rule='30000000-0000-0000-0000-000000000001';
const standalone='30000000-0000-0000-0000-000000000002';
const disabled='30000000-0000-0000-0000-000000000003';
const monthOffset=(month,delta)=>{const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);};
try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY); INSERT INTO stores VALUES('${store}'),('${other}');
    CREATE TABLE expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id),year_month text NOT NULL,category text NOT NULL,name text NOT NULL,amount numeric NOT NULL);
    CREATE FUNCTION is_store_admin(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true)='admin' AND sid::text=current_setting('test.store',true) AND auth.uid() IS NOT NULL $$;
    CREATE FUNCTION is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT sid::text=current_setting('test.store',true) AND auth.uid() IS NOT NULL $$;
    CREATE FUNCTION assert_store_finance_access(sid uuid) RETURNS void LANGUAGE plpgsql STABLE AS $$ BEGIN IF NOT is_store_admin(sid) THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF; END $$;
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY exp_select ON expenses FOR SELECT TO authenticated USING(is_store_member(store_id));
    CREATE POLICY exp_insert ON expenses FOR INSERT TO authenticated WITH CHECK(is_store_member(store_id) AND (category<>'고정비' OR is_store_admin(store_id)));
    CREATE POLICY exp_update ON expenses FOR UPDATE TO authenticated USING(is_store_member(store_id) AND (category<>'고정비' OR is_store_admin(store_id))) WITH CHECK(is_store_member(store_id) AND (category<>'고정비' OR is_store_admin(store_id)));
    GRANT SELECT,INSERT,UPDATE ON expenses TO authenticated;
    SET test.role='admin'; SET test.store='${store}'; SET test.actor='${user}';`);
  const month=(await db.query("SELECT to_char(timezone('Asia/Seoul',now()),'YYYY-MM') ym")).rows[0].ym;
  const previous=monthOffset(month,-1),next=monthOffset(month,1),later=monthOffset(month,2),last=monthOffset(month,3);
  await db.query(`INSERT INTO expenses(id,store_id,year_month,category,name,amount) VALUES
    ($1,$2,$3,'고정비','이전 임대료',100),($4,$2,$3,'고정비','이전 보험',50),($5,$2,$3,'공과금','다른 과거 비용',20),($6,$7,$3,'고정비','타매장',900)`,[source,store,previous,otherFixed,third,foreignSource,other]);
  await db.exec(await readFile('supabase/migrations/20261105120000_expense_occurrence_dates.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261105130000_recurring_fixed_expenses.sql','utf8'));
  await db.exec('SET ROLE authenticated');
  await db.query("INSERT INTO expenses(store_id,year_month,category,name,amount,occurred_on) VALUES($1,$2,'공과금','이번 전기',20,($2||'-01')::date)",[store,month]);
  const get=async(m,sid=store)=>(await db.query('SELECT get_recurring_fixed_expenses($1,$2) value',[sid,m])).rows[0].value;
  const series=async(m,sid=store)=>(await db.query('SELECT get_daily_expense_series($1,$2) value',[sid,m])).rows[0].value;
  const effective=async(m)=>(await db.query('SELECT * FROM get_effective_expense_rows($1,$2)',[store,m])).rows;
  const save=async({id=rule,sid=store,effective=month,name='반복 임대료',amount=100,day=5,active=true,end=null,sourceId=source,expected=null}={})=>
    db.query('SELECT save_recurring_fixed_expense($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',[id,sid,effective,name,amount,day,active,end,sourceId,expected]);
  const sumCheck=async(m)=>{const data=await series(m);assert.equal(data.days.reduce((s,d)=>s+d.knownAmount,0)+data.unallocatedAmount,data.monthlyTotal);return data;};
  let before=await series(month);assert.equal(before.monthlyTotal,170);assert.equal(before.unallocatedAmount,150);
  const original=(await db.query('SELECT * FROM expenses WHERE id=$1',[source])).rows[0];
  await assert.rejects(()=>save({id:disabled,sourceId:null,name:'   '}),/RECURRING_EXPENSE_INVALID/);
  await assert.rejects(()=>save({id:disabled,sourceId:null,active:null}),/RECURRING_EXPENSE_INVALID/);

  await save(); await save(); // exact lost-response retry is a no-op
  let recurring=await get(month);assert.equal(recurring.rules.length,1);assert.equal(recurring.rules[0].latest_revision,1);
  assert.equal(recurring.occurrences.length,1);assert.equal(recurring.occurrences[0].id,`recurring:${rule}:${month}`);
  assert.equal(recurring.occurrences[0].occurred_on,`${month}-05`);assert.deepEqual(recurring.adoptedSourceIds,[source]);
  let current=await sumCheck(month);assert.equal(current.monthlyTotal,170);assert.equal(current.recurringTotal,100);assert.equal(current.unallocatedAmount,50);
  assert.equal((await effective(month)).filter(r=>r.id===source).length,0); // source carry is replaced once, not added twice
  assert.deepEqual((await db.query('SELECT * FROM expenses WHERE id=$1',[source])).rows[0],original,'legacy row stays byte-for-byte unchanged');
  assert.equal((await get(previous)).occurrences.length,0);assert.equal((await series(previous)).monthlyTotal,170);
  for(let i=0;i<3;i++) assert.deepEqual(await get(month),recurring,'repeat reads are stable and never generate new rows');
  assert.equal((await db.query('SELECT count(*) n FROM recurring_fixed_expense_versions')).rows[0].n,1);
  await assert.rejects(()=>save({effective:previous,id:disabled,sourceId:null}),/RECURRING_EXPENSE_NO_BACKDATE/);
  await assert.rejects(()=>save({effective:month,amount:120,expected:1}),/RECURRING_EXPENSE_FUTURE_CHANGE_REQUIRED/);
  await assert.rejects(()=>save({effective:next,amount:120,expected:0}),/RECURRING_EXPENSE_VERSION_CONFLICT/);
  await assert.rejects(()=>save({effective:next,sourceId:foreignSource,expected:1}),/RECURRING_EXPENSE_IDENTITY_CHANGED/);
  await assert.rejects(()=>save({id:disabled,sourceId:foreignSource}),/RECURRING_EXPENSE_SOURCE_INVALID/);
  await assert.rejects(()=>save({id:disabled,sourceId:third}),/RECURRING_EXPENSE_SOURCE_INVALID/);
  for(const bad of [0,-1,32,null]) await assert.rejects(()=>save({id:disabled,sourceId:null,day:bad}),/RECURRING_EXPENSE_INVALID/);
  for(const bad of [0,-1,'NaN','Infinity']) await assert.rejects(()=>save({id:disabled,sourceId:null,amount:bad}),/RECURRING_EXPENSE_INVALID/);
  await assert.rejects(()=>save({id:disabled,sourceId:null,effective:'2026-13'}),/INVALID_YEAR_MONTH/);
  await assert.rejects(()=>save({id:disabled,sourceId:null,end:previous}),/RECURRING_EXPENSE_INVALID/);
  // Pending future revisions are immutable records. Later revision for same future
  // month wins; current/past values are never overwritten.
  await save({effective:next,amount:120,day:10,expected:1});
  await save({effective:next,amount:130,day:11,expected:2});
  await save({effective:next,amount:130,day:11,expected:2});
  assert.equal((await get(month)).occurrences[0].amount,100);
  assert.equal((await get(next)).occurrences[0].amount,130);assert.equal((await get(next)).occurrences[0].occurred_on,`${next}-11`);
  assert.equal((await get(next)).rules[0].latest_revision,3);
  await save({effective:later,amount:130,day:11,active:false,expected:3});
  assert.equal((await get(later)).occurrences.length,0);assert.deepEqual((await get(later)).adoptedSourceIds,[source]);
  assert.equal((await sumCheck(later)).monthlyTotal,50,'disabled rule does not resurrect adopted source carry');
  await save({effective:last,amount:140,day:12,end:last,expected:4});
  assert.equal((await get(last)).occurrences[0].amount,140);assert.equal((await get(monthOffset(last,1))).occurrences.length,0);
  assert.equal((await sumCheck(last)).monthlyTotal,190);assert.equal((await sumCheck(monthOffset(last,1))).monthlyTotal,50);
  // A standalone schedule adds a separate cost. It never changes the manual set.
  await save({id:standalone,sourceId:null,name:'서버 구독',amount:70,day:31});
  recurring=await get(month);assert.equal(recurring.occurrences.length,2);
  const standaloneOccurrence=recurring.occurrences.find(o=>o.rule_id===standalone);
  assert.equal(standaloneOccurrence.amount,70);
  const futureYear=Number(month.slice(0,4))+1;
  let leapYear=futureYear;while(leapYear%4!==0 || (leapYear%100===0 && leapYear%400!==0)) leapYear++;
  let normalYear=futureYear;while(normalYear%4===0 && (normalYear%100!==0 || normalYear%400===0)) normalYear++;
  for(const [target,expectedDay] of [[`${futureYear}-04`,'30'],[`${normalYear}-02`,'28'],[`${leapYear}-02`,'29'],[`${futureYear}-01`,'31']]) {
    const occurrence=(await get(target)).occurrences.find(o=>o.rule_id===standalone);
    assert.equal(occurrence.occurred_on,`${target}-${expectedDay}`,'confirmed missing payment day clamps to month end');
    assert.equal(occurrence.status,'scheduled','future schedule is not payment completion');
    const data=await sumCheck(target);assert.equal(data.policyPendingCount,0);assert.equal(data.scheduledTotal,(await get(target)).occurrences.reduce((s,o)=>s+o.amount,0));assert.equal(data.incurredKnownTotal,0);
  }
  // 28/29/30 boundaries use same clamping rule, including leap years.
  let expectedRevision=1;
  for(const day of [28,29,30]) {
    await save({id:standalone,sourceId:null,name:'서버 구독',amount:70,day,effective:next,expected:expectedRevision++});
    const selected=(await get(`${normalYear}-02`)).occurrences.find(o=>o.rule_id===standalone);
    assert.equal(selected.occurred_on,`${normalYear}-02-28`);
    const leap=(await get(`${leapYear}-02`)).occurrences.find(o=>o.rule_id===standalone);
    assert.equal(leap.occurred_on,`${leapYear}-02-${day===28?'28':'29'}`);
  }
  // Original carry copy excludes adopted source. All unadopted rows still copy atomically.
  const copyMonth=monthOffset(month,6);
  await assert.rejects(()=>db.query('SELECT copy_fixed_expenses_with_dates($1,$2,$3::jsonb)',[store,copyMonth,JSON.stringify([{id:source,occurred_on:`${copyMonth}-03`},{id:otherFixed,occurred_on:`${copyMonth}-03`}])]),/FIXED_COPY_INVALID/);
  await db.query('SELECT copy_fixed_expenses_with_dates($1,$2,$3::jsonb)',[store,copyMonth,JSON.stringify([{id:otherFixed,occurred_on:`${copyMonth}-03`}])]);
  assert.equal((await db.query('SELECT count(*) n FROM expenses WHERE year_month=$1',[copyMonth])).rows[0].n,1);
  assert.equal((await sumCheck(copyMonth)).monthlyTotal,120,'remaining manual copy plus standalone schedule; adopted source stays excluded');
  // A newer revision supersedes an older future reservation from its effective
  // month onward; an old later-month version must not come back afterwards.
  const reordered='30000000-0000-0000-0000-000000000004';
  const far=monthOffset(month,8);
  await save({id:reordered,sourceId:null,effective:far,name:'예약변경',amount:500,day:1});
  await save({id:reordered,sourceId:null,effective:next,name:'예약변경',amount:200,day:1,expected:1});
  assert.equal((await get(far)).occurrences.find(o=>o.rule_id===reordered).amount,200);
  assert.equal((await get(month)).occurrences.some(o=>o.rule_id===reordered),false);
  await assert.rejects(()=>save({id:disabled,sourceId:source}),/RECURRING_EXPENSE_SOURCE_CONFLICT/);
  const lateSource='20000000-0000-0000-0000-000000000005';
  const lateRule='30000000-0000-0000-0000-000000000005';
  const sourceMonth=monthOffset(month,7),startMonth=monthOffset(month,8);
  await db.query("INSERT INTO expenses(id,store_id,year_month,category,name,amount,occurred_on) VALUES($1,$2,$3,'고정비','미래원본',90,($3||'-02')::date)",[lateSource,store,sourceMonth]);
  await save({id:lateRule,sourceId:lateSource,effective:startMonth,name:'미래원본',amount:90,day:2});
  await assert.rejects(()=>save({id:lateRule,sourceId:lateSource,effective:next,name:'미래원본',amount:90,day:2,expected:1}),/RECURRING_EXPENSE_SOURCE_INVALID/);
  await assert.rejects(()=>db.query("UPDATE expenses SET occurred_on=($2||'-02')::date WHERE id=$1",[lateSource,startMonth]),/RECURRING_EXPENSE_SOURCE_LOCKED/);
  await assert.rejects(()=>db.query("UPDATE expenses SET category='마케팅' WHERE id=$1",[source]),/RECURRING_EXPENSE_SOURCE_LOCKED/);
  // Assigning a confirmed date within the original month preserves the relation.
  await db.query("UPDATE expenses SET occurred_on=($2||'-03')::date WHERE id=$1",[source,previous]);
  assert.equal((await db.query('SELECT year_month FROM expenses WHERE id=$1',[source])).rows[0].year_month,previous);
  assert.equal((await get(month)).occurrences.find(o=>o.rule_id===rule).amount,100);
  // Privilege boundaries prevent direct history changes even for a store admin.
  await assert.rejects(()=>db.query('UPDATE recurring_fixed_expense_versions SET amount=1 WHERE rule_id=$1',[rule]),/permission denied/);
  await assert.rejects(()=>db.query('DELETE FROM recurring_fixed_expenses WHERE id=$1',[rule]),/permission denied/);

  // Run the exact new monthly fixed CTE against canonical daily sources. No rewrite of its logic here.
  const financialPatch=await readFile(new URL('../supabase/migrations/20261105140000_recurring_financial_summaries.sql',import.meta.url),'utf8');
  const fixedCte=financialPatch.match(/fixed AS \(([\s\S]*?)\n \), variable AS/)[1];
  for (const selectedMonth of [previous,month,next,later,copyMonth,far]) {
    const projected=(await db.query(`WITH requested AS (SELECT $1::uuid sid,$2::text ym),fixed AS (${fixedCte}) SELECT amount FROM fixed`,[store,selectedMonth])).rows[0];
    const canonical=await db.query("SELECT coalesce(sum(amount),0) amount FROM get_effective_expense_rows($1,$2) WHERE category='고정비'",[store,selectedMonth]);
    assert.equal(Number(projected.amount),Number(canonical.rows[0].amount),'monthly summary matches canonical recurring fixed cost');
  }
  const currentSnapshot=await series(month);
  await db.exec("SET test.role='staff'");
  assert.equal((await db.query('SELECT * FROM recurring_fixed_expenses')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM recurring_fixed_expense_versions')).rows.length,0);
  await assert.rejects(()=>get(month),/FINANCE_ADMIN_REQUIRED/);await assert.rejects(()=>series(month),/FINANCE_ADMIN_REQUIRED/);
  await assert.rejects(()=>save({id:disabled,sourceId:null}),/FINANCE_ADMIN_REQUIRED/);
  await assert.rejects(()=>db.query('UPDATE recurring_fixed_expenses SET latest_revision=99 WHERE id=$1',[rule]),/permission denied/);
  await db.exec(`SET test.role='admin'; SET test.store='${other}'; SET test.actor='10000000-0000-0000-0000-000000000002'`);
  assert.equal((await db.query('SELECT * FROM recurring_fixed_expenses')).rows.length,0);
  await assert.rejects(()=>get(month),/FINANCE_ADMIN_REQUIRED/);await assert.rejects(()=>save({id:disabled,sourceId:null}),/FINANCE_ADMIN_REQUIRED/);
  assert.equal((await get(month,other)).rules.length,0);
  await db.exec(`SET test.store='${store}'; SET test.actor='${user}'`);assert.deepEqual(await series(month),currentSnapshot);
  await db.exec('RESET ROLE; SET ROLE anon');await assert.rejects(()=>get(month),/permission denied/);await assert.rejects(()=>save({id:disabled,sourceId:null}),/permission denied/);
  console.log('Recurring fixed expense SQL: recurrence/clamp/version/idempotency/legacy/copy/RLS/month-day checks passed');
} finally {await db.close();}
