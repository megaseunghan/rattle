jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../lib/services/employees', () => ({ isInProbation: jest.fn(), isInsuranceApplicable: jest.fn() }));
import { supabase } from '../../lib/supabase';
import { settlePayrolls } from '../../lib/services/payroll';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
const select = jest.fn(), inIds = jest.fn(), update = jest.fn();
beforeEach(() => {
 jest.clearAllMocks();
 (invalidateCachedStore as jest.Mock).mockResolvedValue(undefined);
 (supabase.from as jest.Mock).mockReturnValue({ update });
 update.mockReturnValue({ in: inIds }); inIds.mockReturnValue({ select });
});
it('중복 ID는 한 번만 요청하고 실제 처리 ID를 대조한다', async () => {
 select.mockResolvedValue({ data: [{ id: 'b' }, { id: 'a' }], error: null });
 await settlePayrolls(['a','b','a']);
 expect(inIds).toHaveBeenCalledWith('id',['a','b']);
 expect(select).toHaveBeenCalledWith('id');
});
it.each([{data:[]}, {data:[{ id:'a' }]}, {data:[{ id:'a' },{ id:'unexpected' }]}])('0건·일부·다른 ID를 전체 성공으로 보지 않는다: %j', async ({data}) => {
 select.mockResolvedValue({ data, error: null });
 await expect(settlePayrolls(['a','b'])).rejects.toThrow('일부 급여');
 expect(invalidateCachedStore).toHaveBeenCalled();
});
it('저장 성공 후 갱신 실패는 재정산을 유도하지 않는다', async () => {
 select.mockResolvedValue({ data: [{ id:'a' }], error: null });
 (invalidateCachedStore as jest.Mock).mockRejectedValue(new Error('refresh'));
 await expect(settlePayrolls(['a'])).rejects.toThrow('정산은 저장됐어요');
});
it('DB 거절은 성공 처리하지 않는다', async () => {
 select.mockResolvedValue({ data:null,error:{ message:'denied' } });
 await expect(settlePayrolls(['a'])).rejects.toThrow('denied');
});
it('대상이 없으면 쓰지 않는다', async () => {
 await settlePayrolls([]); expect(supabase.from).not.toHaveBeenCalled();
});
