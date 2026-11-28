jest.mock('../../lib/services/wageHistory', () => ({ getWageHistory: jest.fn(), addWageChange: jest.fn() }));
import { addWageChange, getWageHistory } from '../../lib/services/wageHistory';
import { changeEmployeeWage, WageChangeOutcomeUnknownError } from '../../lib/services/employees';
import { UserFacingError } from '../../lib/utils/error';

const input = { storeId: 's', employeeId: 'e', effectiveDate: '2026-12-01', baseSalary: 0, hourlyWage: 11000, nonTaxable: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  (getWageHistory as jest.Mock).mockResolvedValue([{ effective_date: '2026-11-01' }]);
});

it('서버가 응답으로 거절하면 결과불명이 아니라 다시 고칠 수 있는 안내를 준다', async () => {
  (addWageChange as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('INVALID'), { code: '22023' }));
  const error = await changeEmployeeWage(input).catch(e => e);
  expect(error).toBeInstanceOf(UserFacingError);
  expect(error).not.toBeInstanceOf(WageChangeOutcomeUnknownError);
  expect(error.message).toBe('급여를 바꾸지 못했어요. 적용일과 금액을 확인해 주세요.');
});

it('권한 거절은 권한 안내를 준다', async () => {
  (addWageChange as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: '42501' }));
  await expect(changeEmployeeWage(input)).rejects.toThrow('급여를 바꿀 권한이 없어요. 관리 권한을 확인해 주세요.');
});

it('전송 실패(code 없음)는 결과불명으로 알린다', async () => {
  (addWageChange as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
  await expect(changeEmployeeWage(input)).rejects.toBeInstanceOf(WageChangeOutcomeUnknownError);
});

it('같은 적용일 이력이 있으면 보내지 않는다', async () => {
  (getWageHistory as jest.Mock).mockResolvedValueOnce([{ effective_date: '2026-12-01' }]);
  await expect(changeEmployeeWage(input)).rejects.toThrow('같은 날부터 적용하는 급여가 이미 있어요. 급여 이력을 확인해 주세요.');
  expect(addWageChange).not.toHaveBeenCalled();
});
