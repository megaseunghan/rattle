// QA-ATTENDANCE-AUTO-APPLY-20261118: local PGlite fixture only; no network or real staff.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
export async function validateAttendanceAutoApply({db,users,store,emp,member,as,migration}) {
 let checks=0;
 const check=(name,a,b)=>{assert.deepEqual(a,b,name);checks++;};
 const ok=(name,a)=>{assert.ok(a,name);checks++;};
 const denied=async(name,fn)=>{await assert.rejects(fn,e=>e.code==='42501'||e.message==='DAILY_WORK_FORBIDDEN',name);checks++;};
 const originalRetry=(await db.query("SELECT pg_get_functiondef('retry_attendance_work_record(uuid)'::regprocedure) d")).rows[0].d;
 const oldSync=(await db.query("SELECT s.employee_id,s.work_date,w.id,w.worked_minutes,w.applied_hourly_wage,w.gross,w.revision FROM private.attendance_work_sync s JOIN payroll_daily_work w ON w.id=s.daily_work_id WHERE s.state='completed' AND w.status='pending' ORDER BY s.work_date LIMIT 1")).rows[0];
 ok('migration fixture includes an old successful pending QR record',oldSync);
 await db.exec(await migration('20261118140000_attendance_auto_apply.sql'));
 const upgraded=(await db.query('SELECT * FROM payroll_daily_work WHERE id=$1',[oldSync.id])).rows[0];
 check('old successful QR record auto-applies without altering original minutes/rate/amount',
  [upgraded.status,upgraded.record_source,upgraded.worked_minutes,upgraded.applied_hourly_wage,upgraded.gross],
  ['approved','qr_auto',oldSync.worked_minutes,oldSync.applied_hourly_wage,oldSync.gross]);
 check('auto applied is not attributed to a human reviewer',upgraded.reviewed_by,null);
 ok('automatic application timestamp and audit revision',upgraded.auto_applied_at&&upgraded.revision>oldSync.revision);
 check('retired retry write guard is unchanged',(await db.query("SELECT pg_get_functiondef('retry_attendance_work_record(uuid)'::regprocedure) d")).rows[0].d,originalRetry);
 const access=(await as(users.owner,'SELECT get_my_store_access($1) r',[store])).rows[0].r;
 await as(users.owner,'SELECT set_store_manager($1,$2,$3)',[store,member.manager,Number(access.manager_revision)]);
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const actor=id(901),employee=id(902);
 await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[actor,'qa-auto-apply@example.invalid']);
 await db.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'member','approved')",[store,actor]);
 await db.query("INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type,hourly_wage,joined_at) VALUES($1,$2,$3,'QA-auto-apply',true,'part_time',12000,'2026-01-01')",[employee,store,actor]);
 const manual=async(e,kind,at)=>(await as(users.owner,'SELECT record_manual_attendance($1,$2,$3,$4,$5) r',[store,e,kind,at,'QA-AUTO-APPLY'])).rows[0].r;
 const day=async(e,date)=>(await db.query('SELECT * FROM payroll_daily_work WHERE employee_id=$1 AND work_date=$2',[e,date])).rows[0];
 const get=async(uid,p)=>(await as(uid,'SELECT get_attendance_work_record($1) r',[p])).rows[0].r;
 const correction=async(p,time)=>{
  const r=(await as(actor,"SELECT request_attendance_correction($1,$2,'change',$3,'clock_out',$4,'QA') r",[store,employee,p,time])).rows[0].r;
  return (await as(users.owner,"SELECT review_attendance_correction($1,true,'QA') r",[r])).rows[0].r;
 };
 await manual(employee,'clock_in','2026-11-15T00:00:00Z');
 const first=await manual(employee,'clock_out','2026-11-15T01:00:00Z');
 let row=await day(employee,'2026-11-15');
 check('QR-source daily work immediately participates in approved totals',[row.status,Number(row.gross),row.worked_minutes,row.record_source,row.reviewed_by],['approved',12000,60,'qr_auto',null]);
 const snap=(await db.query("SELECT daily_work_month_snapshot($1,'2026-11') s",[employee])).rows[0].s;
 check('month source requires no review step',snap.map(x=>x.status),['approved']);
 // No human review call: create and settle a matching existing monthly snapshot, then add another shift.
 await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,worked_minutes,daily_work_snapshot,is_settled,settled_at) VALUES($1,$2,'2026-11',12000,60,$3,true,now())",[store,employee,JSON.stringify(snap)]);
 await manual(employee,'clock_in','2026-11-15T02:00:00Z');
 const second=await manual(employee,'clock_out','2026-11-15T02:30:00Z');
 row=await day(employee,'2026-11-15');
 check('extra checkout automatically re-applies the day',[row.worked_minutes,Number(row.gross),row.status],[90,18000,'approved']);
 check('extra checkout unsets settlement but retains old monthly amount',(await db.query('SELECT is_settled,gross::int FROM payroll WHERE employee_id=$1',[employee])).rows[0],{is_settled:false,gross:12000});
 await db.query("UPDATE payroll SET gross=18000,net_pay=18000,worked_minutes=90,daily_work_snapshot=daily_work_month_snapshot($1,'2026-11'),is_settled=true,settled_at=now() WHERE employee_id=$1",[employee]);
 await db.query('UPDATE employees SET hourly_wage=18000 WHERE id=$1',[employee]);
 const fixed=await correction(second,'2026-11-15T02:20:00Z');
 row=await day(employee,'2026-11-15');
 check('correction automatically re-applies using historical rate',[row.worked_minutes,Number(row.gross),Number(row.applied_hourly_wage),row.status],[80,16000,12000,'approved']);
 check('correction unsets settlement without replacing monthly slip',(await db.query('SELECT is_settled,gross::int FROM payroll WHERE employee_id=$1',[employee])).rows[0],{is_settled:false,gross:18000});
 const rev=row.revision;
 await as(actor,'SELECT retry_attendance_work_record($1)',[fixed]);
 await as(actor,'SELECT retry_attendance_work_record($1)',[fixed]);
 check('same checkout retry does not rewrite or increment revision',(await day(employee,'2026-11-15')).revision,rev);
 check('one-statement permits are consumed',(await db.query('SELECT count(*)::int n FROM private.attendance_auto_write_permits')).rows[0].n,0);
 // Manager's own automatic recovery is allowed, but a manual approval is still not.
 await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[emp.manager]);
 await manual(emp.manager,'clock_in','2026-11-16T00:00:00Z');
 const managerOut=await manual(emp.manager,'clock_out','2026-11-16T01:00:00Z');
 check('missing rate does not invent a daily amount',await day(emp.manager,'2026-11-16'),undefined);
 const issues=async(uid)=>(await as(uid,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-11-16','2026-11-16')",[store])).rows;
 check('failure appears only in administrator issue queue',(await issues(users.owner)).map(x=>[x.employee_id,x.error_code]),[[emp.manager,'DAILY_WORK_RATE_REQUIRED']]);
 const managerName=(await db.query('SELECT name FROM employees WHERE id=$1',[emp.manager])).rows[0].name;
 check('queue supplies employee name and effective retry checkout',(await issues(users.owner)).map(x=>[x.employee_name,x.retry_punch_id]),[[managerName,managerOut]]);
 for(const uid of [users.outside,users.pending,users.regular])await denied('non-admin cannot read issue names or retry IDs',()=>issues(uid));
 await assert.rejects(as(users.owner,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-11-17','2026-11-16')",[store]),e=>e.message==='ATTENDANCE_INPUT_INVALID');checks++;
 await denied('employee cannot read administrator issue queue',()=>issues(actor));
 await db.query('UPDATE employees SET hourly_wage=13000 WHERE id=$1',[emp.manager]);
 const recovered=(await as(users.manager,'SELECT retry_attendance_work_record($1) r',[managerOut])).rows[0].r;
 check('manager own server-calculated recovery auto-applies',[recovered.review_status,recovered.daily_minutes,Number(recovered.daily_gross)],['approved',60,13000]);
 check('recovered issue removed from administrator queue',await issues(users.owner),[]);
 await denied('manager cannot mint an automatic-write permit',()=>as(users.manager,'INSERT INTO private.attendance_auto_write_permits VALUES(txid_current(),$1,$2,$3)',[emp.manager,'2026-11-16','{}']));
 // Use test superuser DML with manager auth claim to prove the trigger itself still blocks forged self approval.
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users.manager]);
 await denied('qr_auto label alone cannot authorize manager self-modification',()=>db.query("UPDATE payroll_daily_work SET gross=gross+100,worked_minutes=worked_minutes+1 WHERE employee_id=$1 AND work_date='2026-11-16'",[emp.manager]));
 await denied('ordinary manager self-review remains blocked',async()=>as(users.manager,"SELECT review_daily_work($1,$2,'approved','QA')",[(await day(emp.manager,'2026-11-16')).id,(await day(emp.manager,'2026-11-16')).revision]));
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[users.owner]);
 await db.query('UPDATE employees SET is_active=false WHERE id=$1',[employee]);
 ok('retired employee still reads own past record',(await get(actor,fixed)).punch_id===fixed);
 await denied('retired employee cannot retry',()=>as(actor,'SELECT retry_attendance_work_record($1)',[fixed]));
 // Actual anon scanner: checkout commit already includes approved automatic labor; replay adds nothing.
 await db.query('UPDATE employees SET is_active=true WHERE id=$1',[employee]);
 await manual(employee,'clock_in',new Date(Date.now()-3600000).toISOString());
 const dev=(await as(actor,"SELECT register_attendance_device('QA-AUTO') r")).rows[0].r;
 await db.query("UPDATE private.attendance_scanner_pairings SET issued_at=now()-interval '11 minutes' WHERE store_id=$1",[store]);
 const reg=(await as(users.owner,"SELECT issue_attendance_scanner_registration($1,'QA-AUTO') r",[store])).rows[0].r;
 const scanner=(await as(null,'SELECT exchange_attendance_scanner_registration($1,$2) r',[store,reg.registration_qr])).rows[0].r;
 check('scanner exchange accepted',scanner.ok,true);
 const nonce=(await as(actor,'SELECT issue_attendance_qr($1) r',[dev.device_id])).rows[0].r.nonce;
 const sig=createHmac('sha256',Buffer.from(dev.secret,'base64')).update(`${dev.device_id}.${nonce}`).digest().subarray(0,16).toString('hex');
 const qr=`rattle-punch:v1.${dev.device_id}.${nonce}.${sig}`;
 const scan=async()=>(await as(null,'SELECT punch_attendance($1,$2) r',[scanner.token,qr])).rows[0].r;
 const punched=await scan();
 const state=await get(actor,punched.punch_id);
 check('actual QR checkout directly applies labor',[punched.kind,state.review_status,state.shift_minutes],['clock_out','approved',60]);
 await scan();
 check('same QR nonce replay does not duplicate labor',(await get(actor,punched.punch_id)).daily_revision,state.daily_revision);
 // Home/profit-loss read models: saved slips win; absent slips use approved daily totals exactly once.
 await db.exec(await migration('20261118150000_daily_work_labor_read_models.sql'));
 const financeStore=id(910),pt=id(911),regular=id(912),missing=id(913);
 await db.query("INSERT INTO stores(id,owner_id,name) VALUES($1,$2,'QA-AUTO-LABOR')",[financeStore,users.owner]);
 await db.query("INSERT INTO employees(id,store_id,name,is_active,employment_type,hourly_wage,joined_at,base_salary) VALUES($1,$2,'QA-PT',true,'part_time',12000,'2026-01-01',0),($3,$2,'QA-regular',true,'regular',0,'2026-01-01',3100000)",[pt,financeStore,regular]);
 await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable) VALUES($1,$2,'2026-01-01',3100000,0,0)",[financeStore,regular]);
 const financeManual=async(e,kind,at)=>(await as(users.owner,'SELECT record_manual_attendance($1,$2,$3,$4,$5) r',[financeStore,e,kind,at,'QA-FINANCE'])).rows[0].r;
 const finance=async()=>(await as(users.owner,"SELECT * FROM get_financial_summaries_v2(ARRAY[$1::uuid],ARRAY['2026-10'],true)",[financeStore])).rows[0];
 const laborSources=async()=>(await as(users.owner,"SELECT get_daily_labor_sources($1,'2026-10') r",[financeStore])).rows[0].r;
 check('regular fixture wage snapshot preserved',(await db.query('SELECT base_salary::int FROM employee_wage_history WHERE employee_id=$1',[regular])).rows[0].base_salary,3100000);
 // PT has no record yet: do not turn missing input into zero cost.
 check('unentered PT keeps aggregate unknown',(await finance()).labor_cost,null);
 await financeManual(pt,'clock_in','2026-10-10T00:00:00Z');
 await financeManual(pt,'clock_out','2026-10-10T01:00:00Z');
 check('no monthly slip: daily12000 + regular3100000 enters home/profit loss',Number((await finance()).labor_cost),3112000);
 check('home delegate includes immediate daily labor',Number((await as(users.owner,"SELECT labor_cost FROM get_home_financial_summary($1,'2026-10')",[financeStore])).rows[0].labor_cost),3112000);
 check('shared profit-loss delegate includes the same sum',Number((await as(users.owner,"SELECT labor_cost FROM get_shared_financial_summary($1,'2026-10')",[financeStore])).rows[0].labor_cost),3112000);
 let projected=await laborSources();
 const ptProjection=projected.payrolls.find(x=>x.employee_id===pt);
 check('daily chart RPC projects approved daily sources without saving a slip',[ptProjection.source_kind,Number(ptProjection.gross),ptProjection.daily_work_snapshot[0].status],['approved_daily_projection',12000,'approved']);
 const projectedDay=projected.dailyWork.find(x=>x.employee_id===pt);
 check('daily rows include gross, minutes, historical rate and source',
  [Number(projectedDay.gross),projectedDay.worked_minutes,Number(projectedDay.applied_hourly_wage),projectedDay.record_source],
  [12000,60,12000,'qr_auto']);
 ok('daily rows and projected snapshot expose automatic timestamp',projectedDay.auto_applied_at&&ptProjection.daily_work_snapshot[0].auto_applied_at===projectedDay.auto_applied_at);
 check('projected snapshot exposes automatic source',ptProjection.daily_work_snapshot[0].record_source,'qr_auto');
 check('successful month exposes empty automatic failure list',projected.attendanceWorkFailures,[]);
 for(const uid of [actor,users.outside,users.pending,users.regular])await denied('non-admin cannot read detailed daily labor sources',()=>as(uid,"SELECT get_daily_labor_sources($1,'2026-10')",[financeStore]));
 check('projection does not create payroll',(await db.query('SELECT count(*)::int n FROM payroll WHERE employee_id=$1',[pt])).rows[0].n,0);
 check('monthly reconciliation includes immediate labor',Number(projected.monthlyLaborCost),3112000);
 await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,net_pay,worked_minutes,applied_hourly_wage,work_source) VALUES($1,$2,'2026-10',50000,50000,250,12000,'manual')",[financeStore,pt]);
 check('saved monthly slip wins; daily amount not added twice',Number((await finance()).labor_cost),3150000);
 projected=await laborSources();
 check('saved slip replaces projection rather than adding another employee entry',projected.payrolls.filter(x=>x.employee_id===pt).map(x=>[x.source_kind,Number(x.gross)]),[['saved_payroll',50000]]);
 await db.query('UPDATE payroll SET gross=0,net_pay=0,worked_minutes=0 WHERE employee_id=$1',[pt]);
 check('explicit saved zero is authoritative',Number((await finance()).labor_cost),3100000);
 // QR-REVIEW-01: a saved monthly slip must never hide a later actual sync failure.
 await db.exec('BEGIN');
 try {
  await db.query("UPDATE payroll SET gross=12000,net_pay=12000,worked_minutes=60,applied_hourly_wage=NULL,daily_work_snapshot=daily_work_month_snapshot($1,'2026-10') WHERE employee_id=$1",[pt]);
  const retainedSlip=async()=>(await db.query('SELECT gross,net_pay,worked_minutes,applied_hourly_wage,daily_work_snapshot,regular_wage_snapshot,income_tax,local_income_tax FROM payroll WHERE employee_id=$1',[pt])).rows[0];
  const originalSlip=await retainedSlip();
  const beforeFailure=await finance();
  check('saved snapshot baseline is known before follow-up failure',Number(beforeFailure.labor_cost),3112000);
  await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[pt]);
  await financeManual(pt,'clock_in','2026-10-25T00:00:00Z');
  const savedSlipFailure=await financeManual(pt,'clock_out','2026-10-25T01:00:00Z');
  const failedSummary=await finance();
  const failedSources=await laborSources();
  check('saved slip cannot hide failed monthly labor and profit',[failedSummary.labor_cost,failedSummary.operating_profit,failedSources.monthlyLaborCost],[null,null,null]);
  check('saved slip failure is visible from actual automatic path',failedSources.attendanceWorkFailures.map(x=>[x.employee_id,x.work_date,x.state,x.error_code]),[[pt,'2026-10-25','failed','DAILY_WORK_RATE_REQUIRED']]);
  check('home and shared delegates preserve unknown despite saved slip',[
   (await as(users.owner,"SELECT labor_cost FROM get_home_financial_summary($1,'2026-10')",[financeStore])).rows[0].labor_cost,
   (await as(users.owner,"SELECT labor_cost FROM get_shared_financial_summary($1,'2026-10')",[financeStore])).rows[0].labor_cost],[null,null]);
  check('saved financial fields and snapshots preserved during failure',await retainedSlip(),originalSlip);
  await db.query('UPDATE employees SET hourly_wage=12000 WHERE id=$1',[pt]);
  await as(users.owner,'SELECT retry_attendance_work_record($1)',[savedSlipFailure]);
  const repairedSummary=await finance();
  check('administrator repair restores exact saved-slip monthly labor and profit',[repairedSummary.labor_cost,repairedSummary.operating_profit],[beforeFailure.labor_cost,beforeFailure.operating_profit]);
  check('monthly source total is restored and failure date removed',[(await laborSources()).monthlyLaborCost,(await laborSources()).attendanceWorkFailures],[Number(beforeFailure.labor_cost),[]]);
  check('repair preserves saved financial fields and historical snapshots',await retainedSlip(),originalSlip);
 } finally {await db.exec('ROLLBACK');}
 await db.query("INSERT INTO employees(id,store_id,name,is_active,employment_type,hourly_wage,joined_at) VALUES($1,$2,'QA-missing-rate',true,'part_time',NULL,'2026-01-01')",[missing,financeStore]);
 await financeManual(missing,'clock_in','2026-10-11T00:00:00Z');
 const failure=await financeManual(missing,'clock_out','2026-10-11T01:00:00Z');
 check('failed automatic work is unknown, never zero cost',(await finance()).labor_cost,null);
 check('unknown labor also keeps operating profit unknown',(await finance()).operating_profit,null);
 await db.query('UPDATE employees SET is_active=false WHERE id=$1',[missing]);
 check('retired employee with failed source remains unknown rather than zero',(await finance()).labor_cost,null);
 projected=await laborSources();
 check('failed month still returns sources but never a known monthly total',projected.monthlyLaborCost,null);
 check('failure date exists without a daily row',projected.attendanceWorkFailures.map(x=>[x.store_id,x.employee_id,x.work_date,x.state,x.error_code]),[[financeStore,missing,'2026-10-11','failed','DAILY_WORK_RATE_REQUIRED']]);
 check('failed daily amount is not projected as approved pay',projected.payrolls.filter(x=>x.employee_id===missing),[]);
 check('failed checkout retry ID works for retired employee administrator',(await as(users.owner,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-10-11','2026-10-11')",[financeStore])).rows.map(x=>[x.employee_name,x.retry_punch_id]),[['QA-missing-rate',failure]]);
 await db.query('UPDATE employees SET hourly_wage=15000 WHERE id=$1',[missing]);
 await as(users.owner,'SELECT retry_attendance_work_record($1)',[failure]);
 check('administrator repair automatically restores financial totals',Number((await finance()).labor_cost),3115000);
 check('repair removes date from monthly failure projection',(await laborSources()).attendanceWorkFailures,[]);
 // Corrected checkout versions must be selected over superseded originals.
 await db.query('UPDATE employees SET is_active=true WHERE id=$1',[missing]);
 await financeManual(missing,'clock_in','2026-10-12T00:00:00Z');
 const oldOut=await financeManual(missing,'clock_out','2026-10-12T01:00:00Z');
 const req=(await as(users.owner,"SELECT request_attendance_correction($1,$2,'change',$3,'clock_out','2026-10-12T02:00:00Z','QA') r",[financeStore,missing,oldOut])).rows[0].r;
 const newOut=(await as(users.owner,"SELECT review_attendance_correction($1,true,'QA') r",[req])).rows[0].r;
 // Simulate a durable recalculation failure after a new effective checkout.
 await db.query("UPDATE private.attendance_work_sync SET state='failed',error_code='ATTENDANCE_WORK_WRITE_FAILED' WHERE employee_id=$1 AND work_date='2026-10-12'",[missing]);
 const correctedIssues=(await as(users.owner,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-10-01','2026-10-31')",[financeStore])).rows;
 check('queue selects corrected effective checkout',correctedIssues.map(x=>x.retry_punch_id),[newOut]);
 await as(users.owner,'SELECT retry_attendance_work_record($1)',[correctedIssues[0].retry_punch_id]);
 check('corrected queue ID repairs the actual date',(await laborSources()).attendanceWorkFailures,[]);
 // Overnight failures are owned by the clock-in day, not the checkout day.
 await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[missing]);
 await financeManual(missing,'clock_in','2026-10-13T14:00:00Z');
 const overnightOut=await financeManual(missing,'clock_out','2026-10-13T16:00:00Z');
 const overnightIssues=(await as(users.owner,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-10-13','2026-10-13')",[financeStore])).rows;
 check('overnight retry checkout resolves by clock-in work date',overnightIssues.map(x=>[x.work_date.toISOString().slice(0,10),x.retry_punch_id]),[['2026-10-13',overnightOut]]);
 await db.query('UPDATE employees SET hourly_wage=15000 WHERE id=$1',[missing]);
 await as(users.owner,'SELECT retry_attendance_work_record($1)',[overnightIssues[0].retry_punch_id]);
 check('overnight retry repairs original work date',(await laborSources()).attendanceWorkFailures,[]);
 check('original monthly slip unchanged by later QR repair',(await db.query('SELECT gross::int FROM payroll WHERE employee_id=$1',[pt])).rows[0].gross,0);
 const issueAcl=(await db.query("SELECT has_function_privilege('anon','get_admin_attendance_work_issues(uuid,date,date)','execute') a,has_function_privilege('authenticated','get_admin_attendance_work_issues(uuid,date,date)','execute') u,EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE p.oid='get_admin_attendance_work_issues(uuid,date,date)'::regprocedure AND x.grantee=0 AND x.privilege_type='EXECUTE') p")).rows[0];
 check('admin issue queue ACL excludes anon/PUBLIC',issueAcl,{a:false,u:true,p:false});
 await db.exec('BEGIN');
 try {
  await db.query(`INSERT INTO private.attendance_work_sync(employee_id,store_id,work_date,state,error_code,source_snapshot)
   SELECT $1::uuid,$2::uuid,'2024-01-01'::date+n,'failed','QA-LIMIT','[]'::jsonb FROM generate_series(0,365) n
   UNION ALL SELECT $3::uuid,$2::uuid,'2024-01-01'::date+n,'failed','QA-LIMIT','[]'::jsonb FROM generate_series(0,365) n
   UNION ALL SELECT $4::uuid,$2::uuid,'2024-01-01'::date+n,'failed','QA-LIMIT','[]'::jsonb FROM generate_series(0,365) n`,[pt,financeStore,regular,missing]);
  const capped=(await as(users.owner,"SELECT * FROM get_admin_attendance_work_issues($1,'2024-01-01','2024-12-31')",[financeStore])).rows;
  check('issue queue applies documented 1000-row cap',capped.length,1000);
  const keys=capped.map(x=>`${x.work_date.toISOString().slice(0,10)}:${x.employee_id}`);
  check('issue queue orders by work date then employee',keys,[...keys].sort());
  check('no effective checkout is represented by nullable retry ID',capped.every(x=>x.retry_punch_id===null),true);
 } finally {await db.exec('ROLLBACK');}
 console.log(`PASS attendance immediate labor application: ${checks} checks (QA-ATTENDANCE-AUTO-APPLY-20261118, local PGlite).`);
}
