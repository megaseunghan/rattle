jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), auth: { getUser: jest.fn() } } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
import { supabase } from '../../lib/supabase';
import { getManualSaleByDate, saveManualSale, deleteManualSale } from '../../lib/services/manualSales';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
import { ManualSale } from '../../types';
const chain: any = {};
const old: ManualSale = { id:'row',store_id:'store',date:'2026-11-01',cash_amount:100,card_amount:200,discount_amount:30,memo:'보존',created_by:'original',created_at:'today' };
const input = { storeId:'store',date:old.date,cashAmount:100,cardAmount:250,discountAmount:30,memo:'보존',expected:old };
beforeEach(() => {
 jest.clearAllMocks();
 for (const method of ['select','eq','is','update','insert','delete']) chain[method] = jest.fn().mockReturnValue(chain);
 chain.maybeSingle = jest.fn().mockResolvedValue({ data:old,error:null });
 chain.single = jest.fn().mockResolvedValue({ data:old,error:null });
 (supabase.from as jest.Mock).mockReturnValue(chain);
 (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data:{ user:{ id:'author' } },error:null });
 (invalidateCachedStore as jest.Mock).mockResolvedValue(undefined);
});
it('카드만 수정할 때 기존 현금·할인·메모와 작성자를 보존하고 원본을 비교한다', async () => {
 await saveManualSale(input);
 expect(chain.update).toHaveBeenCalledWith({cash_amount:100,card_amount:250,discount_amount:30,memo:'보존'});
 expect(chain.eq).toHaveBeenCalledWith('card_amount',200);
 expect(chain.eq).toHaveBeenCalledWith('cash_amount',100);
 expect(chain.eq).toHaveBeenCalledWith('memo','보존');
 expect(chain.insert).not.toHaveBeenCalled();
});
it('다른 매장·날짜의 원본으로 갱신하지 않는다', async () => {
 await expect(saveManualSale({...input,storeId:'other'})).rejects.toThrow('매장과 날짜');
 expect(supabase.from).not.toHaveBeenCalled();
});
it('다른 곳에서 값을 바꾸거나 삭제하면 덮어쓰지 않고 재확인을 요구한다', async () => {
 chain.maybeSingle.mockResolvedValue({data:null,error:null});
 await expect(saveManualSale(input)).rejects.toThrow('다른 곳에서');
});
it('새 날짜는 insert만 하므로 동시 등록의 기존 값을 대체하지 않는다', async () => {
 chain.single.mockResolvedValue({data:null,error:{code:'23505'}});
 await expect(saveManualSale({...input,expected:null})).rejects.toThrow('다른 곳에서');
 expect(chain.update).not.toHaveBeenCalled();
});
it('null 메모는 SQL NULL로 비교한다', async () => {
 await saveManualSale({...input,expected:{...old,memo:null}});
 expect(chain.is).toHaveBeenCalledWith('memo',null);
});
it('조회 오류를 해당 날짜의 매출 없음으로 취급하지 않는다', async () => {
 chain.maybeSingle.mockResolvedValue({data:null,error:{message:'read failed'}});
 await expect(getManualSaleByDate('store',old.date)).rejects.toThrow('read failed');
});
it('저장 성공 후 캐시 오류는 저장 실패와 구분한다', async () => {
 (invalidateCachedStore as jest.Mock).mockRejectedValue(new Error('cache'));
 await expect(saveManualSale(input)).resolves.toMatchObject({id:old.id,cacheRefreshFailed:true});
});
it('안전하지 않은 금액은 서버 요청 전에 거절한다', async () => {
 await expect(saveManualSale({...input,cashAmount:Infinity})).rejects.toThrow('정수');
 expect(supabase.from).not.toHaveBeenCalled();
});

it('삭제 응답이 0건이면 성공으로 처리하지 않는다', async () => {
 chain.maybeSingle.mockResolvedValue({data:null,error:null});
 await expect(deleteManualSale('row')).rejects.toThrow('삭제 결과');
 expect(invalidateCachedStore).not.toHaveBeenCalled();
});
it('삭제된 행을 확인한 뒤 캐시를 갱신한다', async () => {
 chain.maybeSingle.mockResolvedValue({data:{id:'row'},error:null});
 await deleteManualSale('row'); expect(chain.select).toHaveBeenCalledWith('id');
 expect(invalidateCachedStore).toHaveBeenCalledTimes(1);
});
