jest.mock('../../lib/supabase',()=>({supabase:{from:jest.fn(),auth:{getUser:jest.fn()}}}));
jest.mock('../../lib/services/cacheInvalidation',()=>({invalidateCachedStore:jest.fn()}));
import { supabase } from '../../lib/supabase';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
import { reviewScheduleRequest } from '../../lib/services/schedule';
import { ScheduleRequest } from '../../types';
const request={id:'r',store_id:'s',employee_id:'e',days:[]} as unknown as ScheduleRequest;
const chain:any={};
beforeEach(()=>{jest.clearAllMocks(); for(const key of ['update','eq','select']) chain[key]=jest.fn().mockReturnValue(chain);chain.maybeSingle=jest.fn().mockResolvedValue({data:{id:'r'},error:null});chain.upsert=jest.fn().mockResolvedValue({error:null});(supabase.from as jest.Mock).mockReturnValue(chain);(supabase.auth.getUser as jest.Mock).mockResolvedValue({data:{user:{id:'admin'}}});(invalidateCachedStore as jest.Mock).mockResolvedValue(undefined);});
it('요청 상태 변경이 0건이면 승인 성공으로 처리하지 않는다',async()=>{
 chain.maybeSingle.mockResolvedValue({data:null,error:null});await expect(reviewScheduleRequest(request,false)).rejects.toThrow('요청 처리 결과');expect(invalidateCachedStore).not.toHaveBeenCalled();
});
it('처리한 요청 행을 확인한 뒤 캐시를 갱신한다',async()=>{
 await reviewScheduleRequest(request,false);expect(chain.select).toHaveBeenCalledWith('id');expect(invalidateCachedStore).toHaveBeenCalledWith('s',['schedule','notifications']);
});
it('스케줄 반영 뒤 요청 상태 변경이 실패하면 오류를 유지하며 이미 반영된 캐시를 갱신한다',async()=>{
 chain.maybeSingle.mockResolvedValue({data:null,error:{message:'status failed'}});await expect(reviewScheduleRequest(request,true)).rejects.toThrow('status failed');expect(chain.upsert).toHaveBeenCalled();expect(invalidateCachedStore).toHaveBeenCalledWith('s',['schedule','notifications']);
});
