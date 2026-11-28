const mockSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => ({ select: () => ({ single: mockSingle }) }) }) }) },
}));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
import { updateEmployee } from '../../lib/services/employees';

it('수습 마지막 날 범위 거절은 안내 문구로 바꾼다', async () => {
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'PROBATION_END_OUT_OF_RANGE' } });
  await expect(updateEmployee('e', { probation_ends_on: '2027-01-01' } as never)).rejects.toThrow('수습 마지막 날은 입사일부터 3개월 안에서 골라 주세요.');
});
it('잘못된 계좌번호 거절도 안내 문구로 바꾼다', async () => {
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'ACCOUNT_NUMBER_INVALID' } });
  await expect(updateEmployee('e', { account_number: '12' } as never)).rejects.toThrow('계좌번호를 숫자 6~30자리로 입력해 주세요.');
});
