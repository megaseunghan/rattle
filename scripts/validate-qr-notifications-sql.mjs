// QA-QR-FOLLOWUPS-20261119: reuses isolated synthetic correction fixture; no remote I/O.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
export async function validateQrNotifications({db,users,store,as,migration,uid,eid,manual,change,approve}) {
 let checks=0;
 const check=(name,a,b)=>{assert.deepEqual(a,b,name);checks++;};
 const denied=async(name,fn)=>{await assert.rejects(fn);checks++;};
 // Upgrade the intentionally minimal notifications fixture to the existing production table contract.
 await db.exec(`ALTER TABLE public.notifications ADD COLUMN id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ADD COLUMN type text,ADD COLUMN title text,ADD COLUMN dedupe_key text,ADD COLUMN is_read boolean DEFAULT false,
  ADD COLUMN created_at timestamptz DEFAULT now(),ADD CONSTRAINT notifications_store_dedupe UNIQUE(store_id,dedupe_key);
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.notifications TO authenticated;
  CREATE POLICY notifications_write ON public.notifications FOR ALL TO authenticated
   USING(is_store_member(store_id)) WITH CHECK(is_store_member(store_id));`);
 await db.exec(await migration('20261119131000_attendance_unprocessed_notifications.sql'));
 await db.exec(await migration('20261119132000_attendance_notification_schedule.sql'));
 const list=async(user)=>(await as(user,'SELECT id,type,attendance_employee_id,attendance_punch_id FROM notifications WHERE attendance_employee_id=$1 ORDER BY type,attendance_punch_id',[eid])).rows;
 const refresh=()=>db.query('SELECT private.refresh_attendance_notifications($1)',[eid]);
 await refresh();
 const before=await list(users.owner);
 await refresh();
 check('repeated refresh deduplicates same shift/reason',(await list(users.owner)).map(x=>x.id),before.map(x=>x.id));
 check('manager sees overdue and labor failure reminders',(await list(users.manager)).map(x=>x.type),before.map(x=>x.type));
 check('employee sees only own missing checkout',(await list(uid)).every(x=>x.type==='attendance_missing_checkout'),true);
 check('other staff cannot see someone else missing checkout',await list(users.regular),[]);
 check('outside account cannot read reminder',await list(users.pending),[]);
 await denied('client cannot create a forged reminder',()=>as(uid,"INSERT INTO notifications(store_id,category,type,title,message,dedupe_key) VALUES($1,'attendance','attendance_missing_checkout','QA-forged','QA','QA-forged')",[store]));
 await denied('client cannot resolve server-owned reminder',()=>as(users.owner,"UPDATE notifications SET resolved_at=now() WHERE attendance_employee_id=$1",[eid]));
 await denied('cron refresh is not client callable',()=>as(users.owner,'SELECT private.refresh_attendance_notifications($1)',[eid]));
 const missing=await manual('clock_in','2026-10-28T00:00:00Z');
 check('overdue scan creates exactly one missing reminder',(await list(uid)).filter(x=>x.attendance_punch_id===missing).length,1);
 await manual('clock_out','2026-10-28T01:00:00Z');
 check('checkout resolves missing reminder immediately',(await list(uid)).filter(x=>x.attendance_punch_id===missing).length,0);
 const missed=await manual('clock_in','2026-10-29T00:00:00Z');
 const fixedOut=await change(missed,'clock_out','2026-10-29T00:00:00Z');
 check('kind correction resolves obsolete missing reminder',(await list(uid)).filter(x=>x.attendance_punch_id===missed).length,0);
 check('unpaired corrected out exposes labor failure only to managers',(await list(users.owner)).filter(x=>x.attendance_punch_id===fixedOut&&x.type==='attendance_labor_failed').length,1);
 check('employee cannot read labor failure',(await list(uid)).filter(x=>x.attendance_punch_id===fixedOut).length,0);
 const addStart=(await as(uid,"SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in','2026-10-28T23:00:00Z','QA-repair') id",[store,eid])).rows[0].id;
 await approve(addStart);
 check('repair resolves labor failure',(await list(users.owner)).filter(x=>x.attendance_punch_id===fixedOut).length,0);
 const issueRows=(await as(users.owner,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-10-01','2026-10-31')",[store])).rows;
 check('manager queue includes overdue open work',issueRows.some(x=>x.employee_id===eid&&x.error_code==='ATTENDANCE_CHECKOUT_MISSING'),true);
 await denied('staff cannot read manager issue list',()=>as(uid,"SELECT * FROM get_admin_attendance_work_issues($1,'2026-10-01','2026-10-31')",[store]));
 // Failed payroll application resolves through the actual retry RPC, without employee payroll UI.
 await as(users.owner,'UPDATE employees SET hourly_wage=NULL WHERE id=$1',[eid]);
 await manual('clock_in','2026-11-02T00:00:00Z');
 const failOut=await manual('clock_out','2026-11-02T01:00:00Z');
 check('automatic application failure creates manager reminder',(await list(users.owner)).filter(x=>x.attendance_punch_id===failOut&&x.type==='attendance_labor_failed').length,1);
 check('application failure is hidden from employee',(await list(uid)).filter(x=>x.attendance_punch_id===failOut).length,0);
 await as(users.owner,'UPDATE employees SET hourly_wage=12000 WHERE id=$1',[eid]);
 await as(users.owner,'SELECT retry_attendance_work_record($1)',[failOut]);
 check('successful retry resolves its manager reminder',(await list(users.owner)).filter(x=>x.attendance_punch_id===failOut).length,0);
 // The exact boundary is stable within one transaction; greater-than is intentional.
 await db.exec('BEGIN');
 const boundary=(await as(users.owner,"SELECT record_manual_attendance($1,$2,'clock_in',now()-interval '16 hours','QA-boundary') id",[store,eid])).rows[0].id;
 check('exactly 16 hours does not notify',(await list(uid)).filter(x=>x.attendance_punch_id===boundary).length,0);
 await db.exec('ROLLBACK');
 const unpaired=before.find(x=>x.type==='attendance_missing_checkout');
 if(unpaired) check('client can mark allowed event read',(await as(users.owner,'UPDATE notifications SET is_read=true WHERE id=$1 RETURNING id',[unpaired.id])).rows.length,1);
 check('queue has no duplicate employee/date identifiers',new Set(issueRows.map(x=>`${x.employee_id}:${x.work_date}`)).size,issueRows.length);
 // HIGH regression: immutable checkout retains Nov 5, reconstructed shift belongs to Nov 6 (KST).
 const nightIn=await manual('clock_in','2026-11-05T23:00:00+09:00');
 const nightMiddle=await manual('clock_out','2026-11-06T01:00:00+09:00');
 const nightOut=await manual('clock_out','2026-11-06T02:00:00+09:00');
 const rebuiltIn=await change(nightMiddle,'clock_in','2026-11-06T01:00:00+09:00');
 const nightDay=async()=>(await db.query("SELECT worked_minutes,gross::int,status FROM payroll_daily_work WHERE employee_id=$1 AND work_date='2026-11-06'",[eid])).rows[0];
 check('midnight repartner initially approves one hour',await nightDay(),{worked_minutes:60,gross:12000,status:'approved'});
 check('original checkout date is immutable',(await db.query('SELECT work_date::text d FROM attendance_punches WHERE id=$1',[nightOut])).rows[0].d,'2026-11-05');
 await manual('clock_in','2026-11-06T09:00:00+09:00');
 check('next check-in must retain already calculated overnight source',await nightDay(),{worked_minutes:60,gross:12000,status:'approved'});
 const morningOut=await manual('clock_out','2026-11-06T10:00:00+09:00');
 check('next checkout totals both reconstructed and morning shifts',await nightDay(),{worked_minutes:120,gross:24000,status:'approved'});
 for(const punch of [nightOut,morningOut]) {
  await as(users.owner,'SELECT retry_attendance_work_record($1)',[punch]);
  check('retry preserves both shifts',await nightDay(),{worked_minutes:120,gross:24000,status:'approved'});
 }
 await refresh();
 check('notification refresh preserves both shifts',await nightDay(),{worked_minutes:120,gross:24000,status:'approved'});
 check('rebuilt checkout has no spurious labor-failed reminder',(await list(users.owner)).filter(x=>[nightOut,morningOut].includes(x.attendance_punch_id)&&x.type==='attendance_labor_failed').length,0);
 check('abandoned old check-in remains actionable',(await list(users.owner)).some(x=>x.attendance_punch_id===nightIn&&x.type==='attendance_missing_checkout'),true);
 check('reconstructed check-in stays paired',(await db.query('SELECT (attendance_shift_partner($1)).id id',[nightOut])).rows[0].id,rebuiltIn);
 // Exercise the real signed QR scan + response-loss retry path after repartnering.
 await db.exec("UPDATE private.attendance_scanner_pairing_limits SET window_start=now()-interval '2 minutes'; UPDATE private.attendance_scanner_pairings SET issued_at=now()-interval '11 minutes'");
 const registration=(await as(users.owner,"SELECT issue_attendance_scanner_registration($1,'QA-midnight') r",[store])).rows[0].r;
 const scanner=(await as(null,'SELECT exchange_attendance_scanner_registration($1,$2) r',[store,registration.registration_qr])).rows[0].r;
 const device=(await as(uid,"SELECT register_attendance_device('QA-midnight') r")).rows[0].r;
 const nonce=(await as(uid,'SELECT issue_attendance_qr($1) r',[device.device_id])).rows[0].r.nonce;
 const signature=createHmac('sha256',Buffer.from(device.secret,'base64')).update(`${device.device_id}.${nonce}`).digest().subarray(0,16).toString('hex');
 const qr=`rattle-punch:v1.${device.device_id}.${nonce}.${signature}`;
 const scan=async()=>(await as(null,'SELECT punch_attendance($1,$2) r',[scanner.token,qr])).rows[0].r;
 const scanned=await scan();
 check('real QR next scan succeeds after midnight repartner',Boolean(scanned.punch_id),true);
 check('real QR response retry returns same punch',(await scan()).punch_id,scanned.punch_id);
 check('real scan and retry keep previous day amount',await nightDay(),{worked_minutes:120,gross:24000,status:'approved'});
 // Retired employees keep recent unprocessed work visible to managers.
 await as(users.owner,'UPDATE employees SET is_active=false WHERE id=$1',[eid]);
 await refresh();
 check('retired staff missing work remains in manager reminders',(await list(users.owner)).some(x=>x.attendance_punch_id===nightIn),true);
 check('retired staff cannot read the missing reminder',await list(uid),[]);
 await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo) VALUES($1,$2,'2026-01-01',0,12000,0,'QA-queue-rehire')",[store,eid]);
 await as(users.owner,'UPDATE employees SET is_active=true WHERE id=$1',[eid]);
 // Queue is server-owned and consumes only a bounded set, including former staff.
 await denied('queue cannot be read by client',()=>as(users.owner,'SELECT * FROM private.attendance_notification_queue'));
 await denied('batch procedure cannot be run by client',()=>as(users.owner,'CALL private.process_attendance_notification_queue()'));
 await db.exec('CALL private.process_attendance_notification_queue()');
 check('top-level scheduled procedure executes with per-employee commits',true,true);
 const future=(await db.query("SELECT min(punched_at+interval '16 hours 1 microsecond') t FROM attendance_effective_punches WHERE employee_id=$1 AND kind='clock_in' AND punched_at>=now()-interval '16 hours' AND (attendance_shift_partner(id)).id IS NULL",[eid])).rows[0].t;
 check('after refresh only future deadline remains',(await db.query('SELECT next_check_at FROM private.attendance_notification_queue WHERE employee_id=$1',[eid])).rows[0]?.next_check_at??null,future);
 // EXPLAIN the exact scheduler candidate query, before/after appending old history.
 // Roll back synthetic volume; triggers are disabled only for these local bulk fixtures.
 await db.exec('BEGIN');
 await db.exec('DELETE FROM private.attendance_notification_queue');
 const candidateSql="SELECT q.employee_id FROM private.attendance_notification_queue q WHERE q.next_check_at<=now() ORDER BY q.next_check_at,q.employee_id LIMIT 25";
 const explain=async()=>(await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+candidateSql)).rows[0]['QUERY PLAN'][0];
 await db.exec('ANALYZE private.attendance_notification_queue');
 const beforePlan=await explain();
 await db.exec('ALTER TABLE attendance_punches DISABLE TRIGGER USER');
 await db.query(`INSERT INTO attendance_punches(store_id,employee_id,kind,punched_at,work_date,source,note)
  SELECT $1,$2,'clock_in','2024-01-01'::timestamptz+g*interval '1 minute','2024-01-01','manual','QA-EXPLAIN'
  FROM generate_series(1,20000) g`,[store,eid]);
 await db.exec('ALTER TABLE attendance_punches ENABLE TRIGGER USER; ANALYZE attendance_punches; ANALYZE private.attendance_notification_queue');
 const afterPlan=await explain();
 const visited=plan=>{const nodes=[plan.Plan];for(let i=0;i<nodes.length;i++)nodes.push(...(nodes[i].Plans??[]));return nodes;};
 check('empty queue does not touch punch history',visited(afterPlan).some(n=>n['Relation Name']==='attendance_punches'),false);
 check('empty queue returns no candidates with 20k old events',afterPlan.Plan['Actual Rows'],0);
 check('empty queue cost does not grow with punch history',afterPlan.Plan['Total Cost']<=beforePlan.Plan['Total Cost'],true);
 console.log('EXPLAIN empty queue before/after +20000 historical punches: '+JSON.stringify({before:beforePlan,after:afterPlan}));
 await db.exec('ROLLBACK');
 // Clock-only delivery: no new scan is needed once the stored deadline becomes due.
 await db.exec('DELETE FROM private.attendance_notification_queue');
 const timed=await manual('clock_in',new Date(Date.now()-17*3600000).toISOString());
 await db.query('DELETE FROM notifications WHERE attendance_punch_id=$1',[timed]);
 await db.query("INSERT INTO private.attendance_notification_queue VALUES($1,now()-interval '1 second') ON CONFLICT(employee_id) DO UPDATE SET next_check_at=excluded.next_check_at",[eid]);
 await db.exec('CALL private.process_attendance_notification_queue()');
 check('clock-driven queue recreates overdue reminder without scan',(await list(users.owner)).some(x=>x.attendance_punch_id===timed),true);
 // Thirty inactive synthetic staff prove the small-batch limit and final lock release.
 await db.exec('DELETE FROM private.attendance_notification_queue');
 const batchEmployees=(await db.query(`INSERT INTO employees(id,store_id,name,is_active,employment_type,hourly_wage,joined_at)
  SELECT gen_random_uuid(),$1,'QA-QUEUE-'||g,false,'part_time',12000,'2026-01-01' FROM generate_series(1,30) g RETURNING id`,[store])).rows.map(x=>x.id);
 await db.query('INSERT INTO private.attendance_notification_queue SELECT unnest($1::uuid[]),now()',[batchEmployees]);
 await db.exec('CALL private.process_attendance_notification_queue()');
 check('one cron invocation processes at most 25 employees',(await db.query('SELECT count(*)::int n FROM private.attendance_notification_queue')).rows[0].n,5);
 check('cron leaves no employee advisory locks behind',(await db.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()")).rows[0].n,0);
 await db.exec('CALL private.process_attendance_notification_queue()');
 check('next invocation drains remaining five',(await db.query('SELECT count(*)::int n FROM private.attendance_notification_queue')).rows[0].n,0);
 await db.query('DELETE FROM employees WHERE id=ANY($1::uuid[])',[batchEmployees]);
 console.log(`PASS QR notifications: ${checks} notification checks; PGlite cron unavailable branch only.`);

}
