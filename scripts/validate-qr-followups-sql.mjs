// QA-QR-FOLLOWUPS-20261119: synthetic staff, October 2026, isolated PGlite only.
import assert from 'node:assert/strict';
export async function validateQrFollowups({ db, users, store, emp, as, migration }) {
 let checks=0;
 const check=(name,a,b)=>{assert.deepEqual(a,b,name);checks++;};
 const denied=async(name,fn)=>{await assert.rejects(fn);checks++;};
 await db.exec(await migration('20261119130000_attendance_kind_corrections.sql'));
 const uid='00000000-0000-0000-0000-000000008001',eid='00000000-0000-0000-0000-000000008002';
 await db.query("INSERT INTO auth.users(id,email) VALUES($1,'qa-followups@example.invalid')",[uid]);
 await db.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,'member','approved')",[store,uid]);
 await as(users.owner,"INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type,hourly_wage,joined_at) VALUES($1,$2,$3,'QA-followups',true,'part_time',12000,'2026-01-01')",[eid,store,uid]);
 const manual=async(kind,at)=>(await as(users.owner,'SELECT record_manual_attendance($1,$2,$3,$4,$5) id',[store,eid,kind,at,'QA-followups'])).rows[0].id;
 const request=async(p,kind,at,user=uid,employee=eid)=>(await as(user,"SELECT request_attendance_correction($1,$2,'change',$3,$4,$5,'QA-kind') id",[store,employee,p,kind,at])).rows[0].id;
 const approve=async(r,user=users.owner)=>(await as(user,'SELECT review_attendance_correction($1,true) id',[r])).rows[0].id;
 const change=async(p,kind,at)=>approve(await request(p,kind,at));
 const day=async(d)=>(await db.query('SELECT worked_minutes,gross::int,status FROM payroll_daily_work WHERE employee_id=$1 AND work_date=$2',[eid,d])).rows[0];
 const partner=async(p)=>(await db.query('SELECT (attendance_shift_partner($1)).id id',[p])).rows[0].id;
 // Missing first check-in: lone scan recorded as in, corrected to out then add original start.
 const lone=await manual('clock_in','2026-10-20T09:00:00Z');
 const out=await change(lone,'clock_out','2026-10-20T09:00:00Z');
 check('original punch is immutable',(await db.query('SELECT kind FROM attendance_punches WHERE id=$1',[lone])).rows[0].kind,'clock_in');
 check('kind change snapshots both kinds',(await db.query("SELECT original_snapshot->>'kind' before,kind after FROM attendance_correction_requests WHERE applied_punch_id=$1",[out])).rows[0],{before:'clock_in',after:'clock_out'});
 const added=(await as(uid,"SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in','2026-10-20T00:00:00Z','QA-missed-in') id",[store,eid])).rows[0].id;
 await approve(added);
 check('new previous pair recalculates actual elapsed time',await day('2026-10-20'),{worked_minutes:540,gross:108000,status:'approved'});
 // Break an existing pair, form next pair, then switch back: stale explicit links cannot win.
 const a=await manual('clock_in','2026-10-21T00:00:00Z');
 const b=await manual('clock_out','2026-10-21T01:00:00Z');
 const c=await manual('clock_out','2026-10-21T02:00:00Z');
 const newIn=await change(b,'clock_in','2026-10-21T01:00:00Z');
 check('changed out forms pair with next out',await partner(c),newIn);
 check('old start is now open',await partner(a),null);
 check('no double-counting after repartner',await day('2026-10-21'),{worked_minutes:60,gross:12000,status:'approved'});
 const back=await change(newIn,'clock_out','2026-10-21T01:00:00Z');
 check('repeated kind correction pairs with previous start',await partner(back),a);
 check('former next out is orphaned',await partner(c),null);
 check('orphaned out makes day unresolved',(await db.query("SELECT state FROM private.attendance_work_sync WHERE employee_id=$1 AND work_date='2026-10-21'",[eid])).rows[0].state,'failed');
 const vr=(await as(uid,"SELECT request_attendance_correction($1,$2,'void',$3,NULL,NULL,'QA-remove-orphan') id",[store,eid,c])).rows[0].id;
 await approve(vr);
 // Same-kind correction still rejects inversions, preserves historical rate and clears settlement.
 const d=await manual('clock_in','2026-10-22T00:00:00Z');
 const e=await manual('clock_out','2026-10-22T01:00:00Z');
 await denied('check-in may not move after its checkout',()=>request(d,'clock_in','2026-10-22T02:00:00Z'));
 await db.query("INSERT INTO payroll(store_id,employee_id,year_month,gross,worked_minutes,daily_work_snapshot,is_settled,settled_at) SELECT $1,$2,'2026-10',sum(gross),sum(worked_minutes),daily_work_month_snapshot($2,'2026-10'),true,now() FROM payroll_daily_work WHERE employee_id=$2 AND to_char(work_date,'YYYY-MM')='2026-10' AND status='approved'",[store,eid]);
 await change(d,'clock_in','2026-10-21T23:30:00Z');
 check('settlement cleared, historical monthly slip retained',(await db.query("SELECT is_settled,gross::int FROM payroll WHERE employee_id=$1 AND year_month='2026-10'",[eid])).rows[0],{is_settled:false,gross:132000});
 // 16h boundary: adjacent automatic pairing includes exactly 16h; excludes >16h.
 const f=await manual('clock_in','2026-10-23T00:00:00Z');
 const g=await manual('clock_in','2026-10-23T16:00:00Z');
 const gOut=await change(g,'clock_out','2026-10-23T16:00:00Z');
 check('kind change includes exactly 16 hours',await partner(gOut),f);
 const h=await manual('clock_in','2026-10-25T00:00:00Z');
 const j=await manual('clock_in','2026-10-25T16:00:01Z');
 const jOut=await change(j,'clock_out','2026-10-25T16:00:01Z');
 check('kind change cannot manufacture a >16h new pair',await partner(jOut),null);
 await denied('kind change may not jump adjacent events',()=>request(h,'clock_out','2026-10-26T00:00:00Z'));
 await denied('employee cannot approve own kind request',async()=>approve(await request(jOut,'clock_in','2026-10-25T16:00:01Z'),uid));
 const managerIn=(await as(users.owner,"SELECT record_manual_attendance($1,$2,'clock_in','2026-10-27T00:00:00Z','QA-manager') id",[store,emp.manager])).rows[0].id;
 const mr=await request(managerIn,'clock_out','2026-10-27T00:00:00Z',users.manager,emp.manager);
 await denied('manager cannot approve own kind change',()=>approve(mr,users.manager));
 await approve(mr);
 check('owner can approve manager kind change',(await db.query('SELECT status FROM attendance_correction_requests WHERE id=$1',[mr])).rows[0].status,'approved');
 // Same timestamp follows the original scan order, not the newly appended correction ID.
 const zeroIn=await manual('clock_in','2026-10-24T00:00:00Z');
 const zeroNext=await manual('clock_out','2026-10-24T00:00:00Z');
 const zeroChanged=await change(zeroIn,'clock_out','2026-10-24T00:00:00Z');
 const zeroRestored=await change(zeroChanged,'clock_in','2026-10-24T00:00:00Z');
 check('same-time kind reversal preserves original event ordering',await partner(zeroNext),zeroRestored);
 check('confirmed zero-minute pair is preserved',await day('2026-10-24'),{worked_minutes:0,gross:0,status:'approved'});
 const movedIn=await manual('clock_in','2026-10-30T14:00:00Z');
 const movedOut=await manual('clock_out','2026-10-30T16:00:00Z');
 await change(movedOut,'clock_in','2026-10-30T16:00:00Z');
 const newOut=await manual('clock_out','2026-10-30T17:00:00Z');
 check('broken last old-day pair records SOURCE_REMOVED',(await db.query("SELECT error_code FROM private.attendance_work_sync WHERE employee_id=$1 AND work_date='2026-10-30'",[eid])).rows[0].error_code,'ATTENDANCE_WORK_SOURCE_REMOVED');
 check('new date uses reconstructed pair only',await day('2026-10-31'),{worked_minutes:60,gross:12000,status:'approved'});
 await as(users.owner,"INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type,hourly_wage,joined_at) VALUES($1,$2,$3,'QA-owner',true,'part_time',12000,'2026-01-01')",[emp.owner,store,users.owner]);
 const ownerIn=(await as(users.owner,"SELECT record_manual_attendance($1,$2,'clock_in','2026-10-28T00:00:00Z','QA-owner') id",[store,emp.owner])).rows[0].id;
 const ownerRequest=await request(ownerIn,'clock_out','2026-10-28T00:00:00Z',users.owner,emp.owner);
 await approve(ownerRequest);
 check('owner may approve own kind change',(await db.query('SELECT status FROM attendance_correction_requests WHERE id=$1',[ownerRequest])).rows[0].status,'approved');
 console.log(`PASS QR kind followups: ${checks} checks (QA-QR-FOLLOWUPS-20261119).`); return {uid,eid,manual,change,approve};
}
