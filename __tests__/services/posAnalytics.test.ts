jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { getBusinessDayRange } from '../../lib/services/posAnalytics';

describe('getBusinessDayRange (토스 기준: 마감시간이 하루의 시작)', () => {
  test('영업일 D = [D 마감, D+1 마감)', () => {
    const { from, to } = getBusinessDayRange('2026-06-12', '16:00');
    const f = new Date(from);
    const t = new Date(to);

    // 시작은 당일 16:00
    expect(f.getHours()).toBe(16);
    expect(f.getDate()).toBe(12);
    // 종료는 익일 16:00
    expect(t.getHours()).toBe(16);
    expect(t.getDate()).toBe(13);
    // 정확히 24시간 구간
    expect(t.getTime() - f.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test('자정 넘어가는 마감시간(02:00)도 동일 규칙', () => {
    const { from, to } = getBusinessDayRange('2026-06-12', '02:00');
    const f = new Date(from);
    const t = new Date(to);
    expect(f.getHours()).toBe(2);
    expect(f.getDate()).toBe(12);
    expect(t.getDate()).toBe(13);
    expect(t.getTime() - f.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
