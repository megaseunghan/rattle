jest.mock('../../lib/supabase',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}));
jest.mock('../../lib/services/cacheInvalidation',()=>({invalidateCachedStore:jest.fn()}));
jest.mock('../../lib/services/notifications',()=>({notifyIfEnabled:jest.fn().mockResolvedValue(undefined)}));
import {supabase} from '../../lib/supabase';
import {invalidateCachedStore} from '../../lib/services/cacheInvalidation';
import {updateIngredient} from '../../lib/services/ingredients';
import {updatePurchaseItem} from '../../lib/services/purchases';
const chain:any={};
beforeEach(()=>{jest.clearAllMocks();for(const m of ['update','eq','select'])chain[m]=jest.fn().mockReturnValue(chain);chain.single=jest.fn().mockResolvedValue({data:{id:'i',store_id:'s',current_stock:10,min_stock:1},error:null});(supabase.from as jest.Mock).mockReturnValue(chain);(supabase.rpc as jest.Mock).mockResolvedValue({error:null});(invalidateCachedStore as jest.Mock).mockResolvedValue(undefined);});
it('재고 저장 성공 후 캐시 갱신 실패는 저장 결과와 복구 표식을 반환한다',async()=>{
 (invalidateCachedStore as jest.Mock).mockRejectedValueOnce(new Error('cache failed'));
 await expect(updateIngredient('i',{current_stock:10})).resolves.toMatchObject({id:'i',cacheRefreshFailed:true});expect(chain.update).toHaveBeenCalledTimes(1);
});
it('매입 품목 저장 성공 후 캐시 갱신 실패는 쓰기 실패로 던지지 않는다',async()=>{
 (invalidateCachedStore as jest.Mock).mockRejectedValueOnce(new Error('cache failed'));
 await expect(updatePurchaseItem('i',2,100)).resolves.toEqual({refreshFailed:true});expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it('실제 재고 쓰기 거절은 저장 성공으로 표시하지 않는다',async()=>{
 chain.single.mockResolvedValue({data:null,error:{message:'write denied'}});await expect(updateIngredient('i',{current_stock:10})).rejects.toThrow('write denied');expect(invalidateCachedStore).not.toHaveBeenCalled();
});
it('실제 매입 품목 쓰기 거절은 후속 갱신을 실행하지 않는다',async()=>{
 (supabase.rpc as jest.Mock).mockResolvedValue({error:{message:'write denied'}});await expect(updatePurchaseItem('i',2,100)).rejects.toThrow('write denied');expect(invalidateCachedStore).not.toHaveBeenCalled();
});
