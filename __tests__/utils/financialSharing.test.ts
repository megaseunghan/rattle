import { allowsFinancialSharing, isFinancialRoute } from '../../lib/utils/financialSharing';
it.each([
  ['none','regular',false], ['none','part_time',false], ['regular_only','regular',true], ['regular_only','part_time',false], ['all_staff','regular',true], ['all_staff','part_time',true], ['all_staff',null,false], [undefined,'regular',false],
] as const)('%s/%s financial access %s', (scope, employment, expected) => expect(allowsFinancialSharing(scope, employment)).toBe(expected));
it('financial deep links are denied while own payroll and work remain available', () => {
  ['/pos','/pos/2026-10-22','/purchases/new','/expenses','/profit-loss'].forEach(path => expect(isFinancialRoute(path)).toBe(true));
  ['/mypage/payslip','/mypage/schedule','/stock','/cleaning'].forEach(path => expect(isFinancialRoute(path)).toBe(false));
});
