import { addWageChange } from '../../lib/services/wageHistory';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
const mockSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: () => ({ single: (...args: unknown[]) => mockSingle(...args) }) } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
it('DB 저장 후 캐시 갱신 실패는 저장 실패로 바꾸지 않는다', async () => {
  mockSingle.mockResolvedValue({ data: { id: 'saved' }, error: null });
  (invalidateCachedStore as jest.Mock).mockRejectedValue(new Error('refresh failed'));
  await expect(addWageChange({ storeId: 'store', employeeId: 'employee', effectiveDate: '2026-09-01', baseSalary: 3000000, hourlyWage: null, nonTaxable: 200000 })).resolves.toEqual({ id: 'saved', cacheRefreshFailed: true });
});
