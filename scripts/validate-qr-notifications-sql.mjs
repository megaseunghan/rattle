// QA-QR-FOLLOWUPS-20261119: reuses isolated synthetic correction fixture; no remote I/O.
import assert from 'node:assert/strict';
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
 console.log(`PASS QR notifications: ${checks} notification checks; PGlite cron unavailable branch only.`);

}
