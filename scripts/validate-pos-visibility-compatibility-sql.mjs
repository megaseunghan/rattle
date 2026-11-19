// QA-POS-VISIBILITY-20261118: local PGlite only, synthetic users/stores, no remote connection.
// Called by the QR integration fixture to exercise the real POS -> sharing -> Disk IO -> role/visibility chain.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
export async function preparePosVisibilityCompatibility({db,users,store,otherStore,emp,member,as,migration}) {
 let checks=0;
 const check=(label,a,b)=>{assert.deepEqual(a,b,label);checks++;};
 const reject=async(label,fn)=>{await assert.rejects(fn,e=>e.code==='42501',label);checks++;};
 await db.exec(`ALTER TABLE toss_orders ADD COLUMN toss_order_id text UNIQUE;
 ALTER TABLE toss_order_items ADD COLUMN order_id uuid REFERENCES toss_orders(id),ADD COLUMN item_id text,
 ADD COLUMN item_name text,ADD COLUMN category_name text,ADD COLUMN quantity numeric,ADD COLUMN unit_price numeric,
 ADD COLUMN total_price numeric,ADD COLUMN option_choices jsonb;
 CREATE TABLE toss_catalog(store_id uuid,item_id text,category_name text,UNIQUE(store_id,item_id));`);
 // Use the actual current soft-delete-aware access helper, not an owner-only test substitute.
 const access=await migration('20261114120000_store_soft_delete.sql');
 const start=access.indexOf('CREATE OR REPLACE FUNCTION user_has_store_access(');
 await db.exec(access.slice(start,access.indexOf('$$;',start)+3));
 await db.exec(await migration('20261023121000_pos_read_models.sql'));
 const contract=async()=> (await db.query(`SELECT pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner
  FROM pg_proc p WHERE p.oid='public.upsert_pos_order_batch(uuid,jsonb)'::regprocedure`)).rows[0];
 let patchedContract;let helperDefinition;
 const baseline=new Map();
 const payload=(key)=>({orderId:key,orderAt:'2026-10-20T00:00:00Z',totalAmount:200,cardAmount:200,cashAmount:0,status:'COMPLETED',
  items:[{itemId:'a',itemName:'QA-a',quantity:1,unitPrice:100,totalPrice:100},
   {itemId:'b',itemName:'QA-b',quantity:1,unitPrice:100,totalPrice:100}]});
 const batch=async(user,orders,sid=store)=>(await as(user,'SELECT upsert_pos_order_batch($1,$2::jsonb) n',[sid,JSON.stringify(orders)])).rows[0].n;
 const scopes=['none','regular_only','all_staff'];
 const allowed=(key,scope)=>key==='owner'||key==='manager'||key==='regular'&&scope!=='none'||key==='part'&&scope==='all_staff';
 async function exerciseAccess(stage) {
  for(const scope of scopes) {
   await as(users.owner,'SELECT set_store_financial_sharing($1,$2)',[store,scope]);
   for(const key of ['owner','manager','regular','part','pending','inactive','outside']) {
    const canRead=(await as(users[key],'SELECT can_read_store_financials($1) yes',[store])).rows[0].yes;
    check(`${stage}/${scope}/${key}: actual financial guard`,canRead,allowed(key,scope));
    if(stage==='before-visibility')baseline.set(`${scope}/${key}`,canRead);
    else check(`${scope}/${key}: no unauthorized permission expansion`,canRead,baseline.get(`${scope}/${key}`));
    const order=payload(`QA-${stage}-${scope}-${key}`);
    if(canRead)check(`${stage}/${scope}/${key}: batch save`,await batch(users[key],[order]),1);
    else {
     await reject(`${stage}/${scope}/${key}: no POS save without financial visibility`,()=>batch(users[key],[order]));
     check('denied request leaves no master',(await db.query('SELECT count(*)::int n FROM toss_orders WHERE toss_order_id=$1',[order.orderId])).rows[0].n,0);
    }
   }
  }
  await as(users.owner,"SELECT set_store_financial_sharing($1,'none')",[store]);
 }
 return {
  async installDiskPatch() {
   const before=await contract();
   await db.exec(await migration('20261117100000_pos_skip_unchanged.sql'));
   patchedContract=await contract();
   check('Disk IO patch preserves ACL and owner',[patchedContract.acl,patchedContract.owner],[before.acl,before.owner]);
   helperDefinition=(await db.query("SELECT pg_get_functiondef('public.user_has_store_access(uuid)'::regprocedure) d")).rows[0].d;
  },
  async beforeVisibility() {
   // Pending and inactive employees still have real linked rows; neither gains sync access.
   for(const key of ['pending','inactive']) {
    await db.query('INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,$4,$5)',
     [member[key],store,users[key],'member',key==='pending'?'pending':'approved']);
    await db.query("INSERT INTO employees(id,store_id,user_id,name,is_active,employment_type,hourly_wage,joined_at) VALUES($1,$2,$3,$4,$5,'part_time',12000,'2026-01-01')",
     [emp[key],store,users[key],`QA-POS-${key}`,key!=='inactive']);
   }
   await exerciseAccess('before-visibility');
  },
  async afterVisibility() {
   await exerciseAccess('after-visibility');
   await reject('anon does not gain batch sync',()=>batch(null,[payload('QA-anon')]));
   await db.exec('SET ROLE service_role');
   await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
   try {await reject('service_role without user JWT remains denied by original guard',()=>db.query('SELECT upsert_pos_order_batch($1,$2::jsonb)',[store,JSON.stringify([payload('QA-service')])]));}
   finally {await db.exec('RESET ROLE');}
   // Count physical DML, not just totals: unchanged/reordered detail input must not rewrite rows.
   await db.exec(`CREATE TEMP TABLE qa_pos_dml(table_name text,operation text);
    CREATE FUNCTION public.qa_pos_dml_audit() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN INSERT INTO qa_pos_dml VALUES(TG_TABLE_NAME,TG_OP);RETURN NULL;END$$;
    CREATE TRIGGER qa_pos_order_audit AFTER INSERT OR UPDATE OR DELETE ON toss_orders FOR EACH ROW EXECUTE FUNCTION qa_pos_dml_audit();
    CREATE TRIGGER qa_pos_item_audit AFTER INSERT OR UPDATE OR DELETE ON toss_order_items FOR EACH ROW EXECUTE FUNCTION qa_pos_dml_audit();`);
   let order=payload('QA-no-change');
   check('new order processed count',await batch(users.owner,[order]),1);
   const ids=(await db.query("SELECT i.id::text FROM toss_order_items i JOIN toss_orders o ON o.id=i.order_id WHERE o.toss_order_id='QA-no-change' ORDER BY i.id")).rows;
   await db.exec('TRUNCATE qa_pos_dml');
   check('same order still counted as processed',await batch(users.manager,[{...order,items:[...order.items].reverse()}]),1);
   check('unchanged/reordered payload executes zero physical DML',(await db.query('SELECT * FROM qa_pos_dml')).rows,[]);
   check('unchanged details preserve row identities',(await db.query("SELECT i.id::text FROM toss_order_items i JOIN toss_orders o ON o.id=i.order_id WHERE o.toss_order_id='QA-no-change' ORDER BY i.id")).rows,ids);
   order={...order,cardAmount:150,cashAmount:50};
   await batch(users.owner,[order]);
   check('payment-only change rewrites master only',(await db.query('SELECT table_name,operation FROM qa_pos_dml')).rows,[{table_name:'toss_orders',operation:'UPDATE'}]);
   await db.exec('TRUNCATE qa_pos_dml');
   order={...order,items:[{...order.items[0],itemName:'QA-renamed'},order.items[1]]};
   await batch(users.owner,[order]);
   check('detail change replaces details without rewriting master',(await db.query('SELECT table_name,operation,count(*)::int n FROM qa_pos_dml GROUP BY 1,2 ORDER BY 2')).rows,
    [{table_name:'toss_order_items',operation:'DELETE',n:2},{table_name:'toss_order_items',operation:'INSERT',n:2}]);
   await db.exec('TRUNCATE qa_pos_dml');
   await reject('cross-store order collision rejected',()=>batch(users.owner,[order],otherStore));
   check('collision rollback causes zero DML',(await db.query('SELECT * FROM qa_pos_dml')).rows,[]);
   await db.exec('DROP TRIGGER qa_pos_order_audit ON toss_orders;DROP TRIGGER qa_pos_item_audit ON toss_order_items;DROP FUNCTION qa_pos_dml_audit();DROP TABLE qa_pos_dml;');
  },
  async verifyFinalChain() {
   check('all later QR/role/visibility migrations preserve Disk IO function and ACL',await contract(),patchedContract);
   check('later migrations preserve the actual store access helper',(await db.query("SELECT pg_get_functiondef('public.user_has_store_access(uuid)'::regprocedure) d")).rows[0].d,helperDefinition);
   const dir=new URL('../supabase/migrations/',import.meta.url);
   const later=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&name>'20261117120000').sort();
   const overlaps=[];
   for(const name of later) {
    const source=await readFile(new URL(name,dir),'utf8');
    for(const match of source.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(upsert_pos_order_batch|upsert_toss_order_with_items|process_toss_webhook|user_has_store_access|can_read_store_financials|get_pos_daily_summaries|get_pos_daily_items|get_financial_summaries(?:_v2)?|get_daily_labor_sources|get_shared_financial_summary)\s*\(/gi))overlaps.push({file:name,function:match[1]});
    check(`${name}: no dynamic POS rewrite`,!(/pg_get_functiondef[\s\S]*upsert_pos_order_batch|upsert_pos_order_batch[\s\S]*EXECUTE\s+definition/i.test(source)),true);
   }
   console.log('POS/financial overlaps after retry_guard: '+JSON.stringify(overlaps));
   console.log(`PASS POS visibility and Disk IO compatibility: ${checks} checks (QA-POS-VISIBILITY-20261118, PGlite, no remote).`);
  },
 };
}
