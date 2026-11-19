const mockRpc = jest.fn(), mockRemove = jest.fn(), mockFrom = jest.fn();
jest.mock('../../lib/supabase',()=>({supabase:{rpc:(...a:unknown[])=>mockRpc(...a),from:(...a:unknown[])=>mockFrom(...a),storage:{from:()=>({remove:(...a:unknown[])=>mockRemove(...a)})}}}));
jest.mock('../../lib/services/cacheInvalidation',()=>({invalidateCachedStore:jest.fn().mockResolvedValue(undefined)}));
import { deletePurchase } from '../../lib/services/purchases';
import { deleteExpense } from '../../lib/services/expenses';
const events:string[]=[];
const proof=(id:string)=>({id,store_id:'store',status:'ready',mime_type:'image/jpeg'});
beforeEach(()=>{
 jest.clearAllMocks();events.length=0;
 mockRpc.mockImplementation(async(name:string)=>{events.push(name);return name==='get_evidence_for_parent_delete'?{data:[proof('a'),proof('b')],error:null}:{error:null};});
 mockRemove.mockImplementation(async()=>{events.push('storage');return {error:null};});
 mockFrom.mockImplementation((table:string)=>({delete:()=>({eq:async()=>{events.push('delete:'+table);return {error:null,count:1};}})}));
});
test.each([['purchase',deletePurchase,'purchases'],['expense',deleteExpense,'expenses']] as const)('%s deletes objects and metadata before parent',async(kind,remove,table)=>{
 await remove('parent');expect(mockRpc).toHaveBeenCalledWith('get_evidence_for_parent_delete',{p_kind:kind,p_id:'parent'});
 expect(events).toEqual(['get_evidence_for_parent_delete','begin_ready_evidence_delete','storage','discard_transaction_evidence_metadata','begin_ready_evidence_delete','storage','discard_transaction_evidence_metadata','delete:'+table]);
});
test('partial Storage failure leaves parent and remaining metadata for retry',async()=>{
 mockRemove.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:new Error('offline')});
 await expect(deletePurchase('parent')).rejects.toThrow('거래를 삭제하지 않았어요');expect(mockFrom).not.toHaveBeenCalled();
 expect(mockRpc.mock.calls.filter(x=>x[0]==='discard_transaction_evidence_metadata')).toHaveLength(1);
});
test('preflight denial leaves every proof intact',async()=>{
 mockRpc.mockResolvedValue({error:new Error('EVIDENCE_FORBIDDEN')});await expect(deleteExpense('parent')).rejects.toThrow('EVIDENCE_FORBIDDEN');expect(mockRemove).not.toHaveBeenCalled();expect(mockFrom).not.toHaveBeenCalled();
});
test('silent object removal denial cannot remove metadata or parent',async()=>{
 mockRpc.mockImplementation(async(name:string)=>name==='get_evidence_for_parent_delete'?{data:[proof('a')],error:null}:{error:new Error('EVIDENCE_FILES_REMAIN')});
 await expect(deleteExpense('parent')).rejects.toThrow('거래를 삭제하지 않았어요');expect(mockFrom).not.toHaveBeenCalled();
});

test('pending cleanup claims server state before touching Storage, then verifies object absence', async()=>{
 const {discardPendingEvidence}=require('../../lib/services/evidence');
 await discardPendingEvidence(proof('a'));
 expect(events).toEqual(['begin_pending_evidence_discard','storage','discard_transaction_evidence_metadata']);
});
test('ready transition or permission rejection prevents bulk cleanup touching Storage',async()=>{
 const {discardPendingEvidence}=require('../../lib/services/evidence');
 mockRpc.mockResolvedValueOnce({error:Error('EVIDENCE_ALREADY_READY')});
 await expect(discardPendingEvidence(proof('a'))).rejects.toThrow('EVIDENCE_ALREADY_READY');
 expect(mockRemove).not.toHaveBeenCalled();
});

test.each([deletePurchase,deleteExpense])('권한 변경으로 삭제 행이 없으면 실패한다', async remove => {
 mockFrom.mockReturnValue({delete:()=>({eq:async()=>({error:null,count:0})})});
 await expect(remove('parent')).rejects.toThrow('삭제를 확인하지 못했어요');
});
