import { rateOnDate, regularGrossForMonth } from '../../lib/services/wageHistory';
import type { WageHistory } from '../../types';
jest.mock('../../lib/supabase',()=>({supabase:{}}));
it('같은 날 확정한 새 조건을 응답 순서와 관계없이 적용한다',()=>{
  const old={id:'a',effective_date:'2026-10-22',created_at:'2026-10-22T00:00:00Z',base_salary:3000000} as WageHistory;
  const latest={...old,id:'b',created_at:'2026-10-22T01:00:00Z',base_salary:3200000};
  expect(rateOnDate([latest,old],'2026-10-22')?.base_salary).toBe(3200000);
  expect(rateOnDate([old,latest],'2026-10-22')?.base_salary).toBe(3200000);
  expect(rateOnDate([old,latest],'2026-10-21',true)).toBeNull();
});


it('급여 이력이 입사 전부터 있어도 실제 입사일부터 일할 계산한다', () => {
  const wage = { id: 'wage', effective_date: '2026-01-01', base_salary: 3100000 } as WageHistory;
  expect(regularGrossForMonth([wage], 2026, 1, new Date(2026, 0, 31), 1, '2026-01-15')).toBe(1700000);
});
it('입사일이 조회 월 이후면 과거 급여 이력이 있어도 인건비는 0원이다', () => {
  const wage = { id: 'wage', effective_date: '2026-01-01', base_salary: 3100000 } as WageHistory;
  expect(regularGrossForMonth([wage], 2026, 1, new Date(2026, 0, 31), 1, '2026-02-01')).toBe(0);
});
