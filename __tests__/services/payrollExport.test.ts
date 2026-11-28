jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
import { buildPayrollCsv, csvCell } from '../../lib/services/payrollExport';
import type { DailyLaborEntry, DailyLaborPayment, Payroll } from '../../types';

it('쉼표·따옴표를 감싸고 수식으로 시작하는 글자를 무력화한다', () => {
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
  expect(csvCell(-1000)).toBe('-1000');
  expect(csvCell(null)).toBe('');
});
it('월 급여·일용 기록을 한 표로 만들고 계좌번호는 넣지 않는다', () => {
  const csv = buildPayrollCsv({
    employees: [{ id: 'e', name: '김직원', employment_type: 'regular', income_type: 'employee', joined_at: '2026-01-01', is_active: true }],
    payrolls: [{ employee_id: 'e', year_month: '2026-10', gross: 3_000_000, taxable_base: 2_800_000, national_pension: 1, health_insurance: 2, long_term_care: 3,
      employment_insurance: 4, income_tax: 5, local_income_tax: 6, withholding_tax: 0, net_pay: 2_999_979, is_settled: true, calculation_version: '2026-v2' } as Payroll],
    dailyWork: [],
    laborers: [{ id: 'l', name: '박일용' }],
    laborEntries: [{ laborer_id: 'l', work_date: '2026-10-03', gross: 200_000, employment_insurance: 1_800, day_income_tax: 1_350,
      payment_id: 'p', calculation_version: '2026-v2' } as DailyLaborEntry],
    laborPayments: [{ id: 'p', laborer_id: 'l', paid_on: '2026-10-04', gross: 200_000, income_tax: 1_350, local_income_tax: 130, employment_insurance: 1_800,
      net_pay: 196_720, calculation_version: '2026-v2', canceled_at: null } as DailyLaborPayment],
  });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  expect(csv.startsWith('﻿')).toBe(true);
  expect(lines).toHaveLength(4);
  expect(lines[1]).toBe('월 급여,김직원,정규직,근로자,2026-10,,,,3000000,2800000,1,2,3,4,5,6,0,2999979,정산완료,2026-v2');
  expect(lines[2]).toContain('일용 근무,박일용,일용,일용근로자,2026-10,2026-10-03');
  expect(lines[2]).toContain('지급 완료 2026-10-04');
  expect(lines[3]).toBe('일용 지급,박일용,일용,일용근로자,2026-10,2026-10-04,,,200000,,,,,1800,1350,130,,196720,지급,2026-v2');
  expect(csv).not.toContain('계좌');
});
