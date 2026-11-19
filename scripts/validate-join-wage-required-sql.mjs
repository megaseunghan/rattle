// QA-JOIN-WAGE-REQUIRED-20261118: local PGlite fixture only, no network/real staff.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export async function validateJoinWageRequired({db,as,owner,store}) {
 let checks=0;
 const check=(label,a,b)=>{assert.deepEqual(a,b,label);checks++;};
 const deny=async(label,fn,code)=>{await assert.rejects(fn,e=>!code||e.message===code,label);checks++;};
 const snapshot=async()=>(await db.query("SELECT (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM employees e) e,(SELECT jsonb_agg(to_jsonb(w) ORDER BY id) FROM employee_wage_history w) w,(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM payroll p) p")).rows[0];
 const original=await snapshot();
 // Legacy incomplete staff existed before the migration; installation must not rewrite them.
 const legacy=(await db.query("INSERT INTO employees(store_id,name,phone,employment_type,is_active,hourly_wage,base_salary) VALUES($1,'QA-retired-no-wage','01098760001','part_time',false,NULL,0) RETURNING id",[store])).rows[0].id;
 const before=await snapshot();
 await db.exec(await readFile(new URL('../supabase/migrations/20261118160000_join_wage_required.sql',import.meta.url),'utf8'));
 check('migration preserves existing employees, wage history and slips',await snapshot(),before);
 for(const [type,rate,monthly,code] of [
  ['part_time',null,0,'JOIN_HOURLY_WAGE_REQUIRED'],['part_time',0,0,'JOIN_HOURLY_WAGE_REQUIRED'],
  ['part_time',-1,0,'JOIN_HOURLY_WAGE_REQUIRED'],['part_time','NaN',0,'JOIN_HOURLY_WAGE_REQUIRED'],
  ['part_time','Infinity',0,'JOIN_HOURLY_WAGE_REQUIRED'],['regular',null,0,'JOIN_BASE_SALARY_REQUIRED'],
  ['regular',null,-1,'JOIN_BASE_SALARY_REQUIRED'],['regular',null,'NaN','JOIN_BASE_SALARY_REQUIRED']]) {
  await deny('new employee requires positive finite type-specific salary',()=>as(owner,'INSERT INTO employees(store_id,name,employment_type,hourly_wage,base_salary) VALUES($1,$2,$3,$4,$5)',[store,'QA-INVALID',type,rate,monthly]),code);
 }
 check('invalid creations roll back',(await db.query("SELECT count(*)::int n FROM employees WHERE name='QA-INVALID'")).rows[0].n,0);
 const nextUser=async(name,phone)=>{
  const uid=(await db.query('INSERT INTO auth.users(id) VALUES(gen_random_uuid()) RETURNING id')).rows[0].id;
  const mid=(await db.query("INSERT INTO store_members(store_id,user_id,applicant_name,phone,role,status) VALUES($1,$2,$3,$4,'member','pending') RETURNING id",[store,uid,name,phone])).rows[0].id;
  return {uid,mid};
 };
 const fresh=await nextUser('QA-new-no-wage','01098760002');
 await deny('legacy resolve cannot create staff without wage',()=>as(owner,'SELECT * FROM resolve_store_member_approval($1,NULL)',[fresh.mid]),'JOIN_BASE_SALARY_REQUIRED');
 await deny('direct status update cannot bypass salary boundary',()=>as(owner,"UPDATE store_members SET status='approved' WHERE id=$1",[fresh.mid]),'JOIN_BASE_SALARY_REQUIRED');
 await deny('legacy approve trigger cannot create staff without wage',()=>as(owner,'SELECT * FROM approve_store_member($1)',[fresh.mid]),'JOIN_BASE_SALARY_REQUIRED');
 check('failed approval remains pending',(await db.query('SELECT status FROM store_members WHERE id=$1',[fresh.mid])).rows[0].status,'pending');
 check('failed approval creates no employee',(await db.query('SELECT count(*)::int n FROM employees WHERE user_id=$1',[fresh.uid])).rows[0].n,0);
 const profile={employment_type:'part_time',hourly_wage:12000,weekly_hours:20,base_salary:0,non_taxable:0,joined_at:'2026-01-01',bank_name:'QA-bank',account_number:'1234567890'};
 const approve=(mid,review,choice='auto',eid=null)=>as(owner,'SELECT * FROM approve_join_onboarding($1,0,$2,$3,$4)',[mid,review,choice,eid]);
 const approved=(await approve(fresh.mid,profile)).rows[0];
 check('administrator final wage creates linked approved employee',(await db.query('SELECT status FROM store_members WHERE id=$1',[fresh.mid])).rows[0].status,'approved');
 check('new final join writes historical wage',(await db.query('SELECT hourly_wage::int FROM employee_wage_history WHERE employee_id=$1',[approved.employee_id])).rows.map(x=>x.hourly_wage),[12000]);
 const regular=await nextUser('QA-new-regular','01098760003');
 await approve(regular.mid,{...profile,employment_type:'regular',hourly_wage:null,weekly_hours:null,base_salary:3100000});
 check('positive monthly salary final join succeeds',(await db.query('SELECT base_salary::int FROM employees WHERE user_id=$1',[regular.uid])).rows[0].base_salary,3100000);
 const rehire=await nextUser('QA-retired-no-wage','01098760001');
 const wageCandidates=mid=>as(owner,'SELECT * FROM get_member_approval_wage_candidates($1)',[mid]);
 check('missing historical wage returns null summary',(await wageCandidates(rehire.mid)).rows.find(x=>x.id===legacy).existing_wage,null);
 await deny('preserve without history returns required history error',()=>approve(rehire.mid,{preserve_existing_wage:true,wage_history_id:legacy},'rehire',legacy),'JOIN_WAGE_HISTORY_REQUIRED');
 check('missing historical wage is explicitly ineligible',(await wageCandidates(rehire.mid)).rows.find(x=>x.id===legacy).wage_condition_valid,false);
 await deny('rehire without effective history requires administrator input',()=>as(owner,'SELECT * FROM resolve_store_member_approval($1,$2)',[rehire.mid,legacy]),'JOIN_WAGE_HISTORY_REQUIRED');
 await db.query('UPDATE employees SET hourly_wage=15000 WHERE id=$1',[legacy]);
 await deny('stale current wage without history is insufficient for rehire',()=>as(owner,'SELECT * FROM resolve_store_member_approval($1,$2)',[rehire.mid,legacy]),'JOIN_WAGE_HISTORY_REQUIRED');
 check('failed rehire leaves employee inactive',(await db.query('SELECT is_active FROM employees WHERE id=$1',[legacy])).rows[0].is_active,false);
 await approve(rehire.mid,profile,'rehire',legacy);
 check('admin entered condition repairs rehire atomically',(await db.query('SELECT is_active,hourly_wage::int FROM employees WHERE id=$1',[legacy])).rows[0],{is_active:true,hourly_wage:12000});
 // Reuse effective history without creating a new history or changing employee pay values.
 await db.query('UPDATE employees SET is_active=false,hourly_wage=NULL WHERE id=$1',[legacy]);
 await db.query('DELETE FROM store_members WHERE id=$1',[rehire.mid]);
 const member=(await db.query("INSERT INTO store_members(store_id,user_id,applicant_name,phone,role,status) VALUES($1,$2,'QA-retired-no-wage','01098760001','member','pending') RETURNING id",[store,rehire.uid])).rows[0].id;
 const oldHistory=(await db.query('SELECT * FROM employee_wage_history WHERE employee_id=$1 ORDER BY id',[legacy])).rows;
 const candidate=(await wageCandidates(member)).rows.find(x=>x.id===legacy);
 check('candidate exposes valid effective wage despite missing current field',[candidate.wage_condition_valid,candidate.employment_type,Number(candidate.wage_hourly_wage),candidate.wage_history_id],[true,'part_time',12000,oldHistory[0].id]);
 check('PT summary provides the requested reusable object',candidate.existing_wage,{employment_type:'part_time',hourly_wage:12000,base_salary:0,effective_date:oldHistory[0].effective_date.toISOString().slice(0,10)});
 check('original candidates API remains compatible',Object.keys((await as(owner,'SELECT * FROM get_member_approval_candidates($1)',[member])).rows[0]).length,8);
 const preserve={preserve_existing_wage:true,wage_history_id:candidate.wage_history_id};
 await deny('preserve requires rehire choice',()=>approve(member,preserve,'new'), 'JOIN_WAGE_PRESERVE_INVALID');
 await deny('preserve rejects mixed edited wage fields',()=>approve(member,{...preserve,hourly_wage:25000},'rehire',legacy),'JOIN_WAGE_PRESERVE_INVALID');
 await deny('preserve requires an observed history token',()=>approve(member,{preserve_existing_wage:true},'rehire',legacy),'JOIN_WAGE_PRESERVE_INVALID');
 await deny('staff cannot read administrative wage candidates',()=>as(rehire.uid,'SELECT * FROM get_member_approval_wage_candidates($1)',[member]));
 await approve(member,preserve,'rehire',legacy);
 check('rehire preserves missing current field when valid history is reused',(await db.query('SELECT hourly_wage FROM employees WHERE id=$1',[legacy])).rows[0].hourly_wage,null);
 check('rehire reuses effective history without appending changes',(await db.query('SELECT * FROM employee_wage_history WHERE employee_id=$1 ORDER BY id',[legacy])).rows,oldHistory);
 // A newer invalid effective rate must not fall back to an older valid rate.
 await db.query('UPDATE employees SET is_active=false WHERE id=$1',[legacy]);
 await db.query("UPDATE store_members SET status='pending' WHERE id=$1",[member]);
 const invalidHistory=(await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_at) VALUES($1,$2,(now() AT TIME ZONE 'Asia/Seoul')::date,0,0,0,'QA-invalid-latest',now()+interval '10 seconds') RETURNING id",[store,legacy])).rows[0].id;
 check('invalid historical wage returns null reusable summary',(await wageCandidates(member)).rows.find(x=>x.id===legacy).existing_wage,null);
 check('newest invalid history is displayed as ineligible',(await wageCandidates(member)).rows.find(x=>x.id===legacy).wage_condition_valid,false);
 await deny('preserve revalidates observed condition identity',()=>approve(member,preserve,'rehire',legacy),'JOIN_WAGE_CONDITION_CHANGED');
 await deny('newest invalid condition cannot reuse older valid wage',()=>as(owner,'SELECT * FROM resolve_store_member_approval($1,$2)',[member,legacy]),'JOIN_HOURLY_WAGE_REQUIRED');
 await db.query('DELETE FROM employee_wage_history WHERE id=$1',[invalidHistory]);
 // Existing applicant profile is retained and only review audit fields are updated.
 await db.query("INSERT INTO store_join_profiles(member_id,store_id,applicant_user_id,submitted_by,employment_type,hourly_wage,weekly_hours,base_salary,non_taxable,joined_at,bank_name,account_number) VALUES($1,$2,$3,$3,'part_time',19000,20,0,0,'2026-01-01','QA-bank','1234567890')",[member,store,rehire.uid]);
 await deny('preserve detects stale applicant revision',()=>approve(member,preserve,'rehire',legacy),'JOIN_REVIEW_CHANGED');
 await as(owner,"SELECT * FROM approve_join_onboarding($1,1,$2,'rehire',$3)",[member,preserve,legacy]);
 const audited=(await db.query('SELECT hourly_wage::int,reviewed_revision,reviewed_profile FROM store_join_profiles WHERE member_id=$1',[member])).rows[0];
 check('preserve audits decision without overwriting applicant source',[audited.hourly_wage,audited.reviewed_revision,audited.reviewed_profile.preserve_existing_wage,audited.reviewed_profile.wage_history_id],[19000,1,true,candidate.wage_history_id]);
 check('preserve with applicant profile still adds no wage history',(await db.query('SELECT * FROM employee_wage_history WHERE employee_id=$1 ORDER BY id',[legacy])).rows,oldHistory);
 await db.query('UPDATE employees SET is_active=false WHERE user_id=$1',[regular.uid]);
 await db.query("UPDATE store_members SET status='pending' WHERE id=$1",[regular.mid]);
 const monthlyCandidate=(await wageCandidates(regular.mid)).rows[0];
 check('regular reusable summary contains monthly rate',[monthlyCandidate.existing_wage.employment_type,monthlyCandidate.existing_wage.base_salary,monthlyCandidate.existing_wage.hourly_wage],['regular',3100000,null]);
 check('regular candidate reports monthly wage summary',[monthlyCandidate.wage_condition_valid,monthlyCandidate.employment_type,Number(monthlyCandidate.wage_base_salary),monthlyCandidate.wage_hourly_wage],[true,'regular',3100000,null]);
 // Existing active data may still be edited; boundary does not bulk repair historical gaps.
 await db.query('UPDATE employees SET hourly_wage=NULL WHERE id=$1',[approved.employee_id]);
 await as(owner,"UPDATE employees SET name=name||'-edited' WHERE id=$1",[approved.employee_id]);
 check('unrelated legacy staff and slips remain intact',(await snapshot()).p,original.p);
 // Exercise the real direct-create RPC too, without replaying historical data backfills.
 await db.exec('ALTER TABLE employees ADD COLUMN is_probation boolean,ADD COLUMN probation_started_at date,ADD COLUMN dependents integer,ADD COLUMN is_resigned_during_probation boolean');
 const wageSql=await readFile(new URL('../supabase/migrations/20261027010000_wage_effective_baselines.sql',import.meta.url),'utf8');
 await db.exec(wageSql.slice(wageSql.indexOf('CREATE OR REPLACE FUNCTION public.create_employee_with_initial_wage'),wageSql.indexOf('CREATE OR REPLACE FUNCTION public.add_employee_wage_change')));
 // Original CREATE OR REPLACE preserves the existing production ACL; fixture has none.
 await db.exec('REVOKE ALL ON FUNCTION create_employee_with_initial_wage(uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION create_employee_with_initial_wage(uuid,jsonb) TO authenticated');
 for(const input of [{employment_type:'part_time',hourly_wage:null},{employment_type:'regular',base_salary:0}])
  await deny('direct create RPC rejects missing salary',()=>as(owner,'SELECT * FROM create_employee_with_initial_wage($1,$2)',[store,{name:'QA-DIRECT',joined_at:'2026-01-01',...input}]),'INVALID_EMPLOYEE_CONDITIONS');
 const direct=(await as(owner,'SELECT * FROM create_employee_with_initial_wage($1,$2)',[store,{name:'QA-DIRECT',joined_at:'2026-01-01',employment_type:'part_time',hourly_wage:13000}])).rows[0];
 check('direct create RPC with wage succeeds',Number(direct.hourly_wage),13000);
 const acl=(await db.query("SELECT has_function_privilege('anon','private.assert_join_wage(uuid,text)','EXECUTE') a,has_function_privilege('authenticated','private.assert_join_wage(uuid,text)','EXECUTE') u")).rows[0];
 check('internal assertion is not callable by clients',acl,{a:false,u:false});
 console.log(`PASS join wage required: ${checks} checks (QA-JOIN-WAGE-REQUIRED-20261118, local PGlite).`);
}

export async function validateJoinWageRoles({db,users,store,as,migration}) {
 // Complete only the candidate-read fields omitted by this QR fixture.
 await db.exec('ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(); ALTER TABLE store_members ADD COLUMN IF NOT EXISTS applicant_name text,ADD COLUMN IF NOT EXISTS phone text');
 const choiceSql=await migration('20261021_member_approval_choice.sql');
 await db.exec(choiceSql.slice(choiceSql.indexOf('CREATE FUNCTION public.get_member_approval_candidates'),choiceSql.indexOf('-- 기존 자동 연결')));
 await db.exec(await migration('20261118160000_join_wage_required.sql'));
 const insert="INSERT INTO employees(store_id,name,employment_type,hourly_wage,base_salary) VALUES($1,$2,'part_time',$3,0) RETURNING id";
 for(const uid of [users.owner,users.manager]) {
  await assert.rejects(()=>as(uid,insert,[store,'QA-WAGE-MISSING',null]),e=>e.message==='JOIN_HOURLY_WAGE_REQUIRED');
  const row=(await as(uid,insert,[store,'QA-WAGE-VALID',12000])).rows[0];
  assert.ok(row.id);
 }
 for(const uid of [users.regular,users.part,users.pending,users.outside])
  await assert.rejects(()=>as(uid,insert,[store,'QA-WAGE-NO-AUTH',12000]));
 const pending=(await db.query('SELECT id FROM store_members WHERE store_id=$1 AND user_id=$2',[store,users.pending])).rows[0].id;
 await db.query("UPDATE store_members SET applicant_name=(SELECT name FROM employees WHERE store_id=$1 AND user_id=$2) WHERE id=$3",[store,users.part,pending]);
 for(const uid of [users.owner,users.manager])assert.ok((await as(uid,'SELECT * FROM get_member_approval_wage_candidates($1)',[pending])).rows.length>0);
 for(const uid of [users.regular,users.part,users.pending,users.outside])await assert.rejects(()=>as(uid,'SELECT * FROM get_member_approval_wage_candidates($1)',[pending]));
 console.log('PASS join wage role chain: 14 checks (owner/manager allowed, staff/pending/outside denied; local PGlite).');
}
