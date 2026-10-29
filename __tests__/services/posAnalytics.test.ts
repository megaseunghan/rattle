jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { getBusinessDayRange } from '../../lib/services/posAnalytics';

describe('getBusinessDayRange (토스 기준: 마감시간이 하루의 시작)', () => {
  test('영업일 D = [D 마감, D+1 마감)', () => {
    const { from, to } = getBusinessDayRange('2026-06-12', '16:00');
    expect(from).toBe('2026-06-12T07:00:00.000Z');
    expect(to).toBe('2026-06-13T07:00:00.000Z');
  });

  test('자정 넘어가는 마감시간(02:00)도 동일 규칙', () => {
    const { from, to } = getBusinessDayRange('2026-06-12', '02:00');
    expect(from).toBe('2026-06-11T17:00:00.000Z');
    expect(to).toBe('2026-06-12T17:00:00.000Z');
  });
});
