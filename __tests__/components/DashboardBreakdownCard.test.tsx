import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DashboardBreakdownCard } from '../../lib/components/DashboardBreakdownCard';
import { useDashboardBreakdown } from '../../lib/hooks/useDashboardBreakdown';
jest.mock('../../lib/hooks/useDashboardBreakdown', () => ({ useDashboardBreakdown: jest.fn() }));
const props = { stores: [], period: 'month' as const, yearMonth: '2026-10', metric: 'purchase' as const, expectedTotal: 500, onClose: jest.fn(), onRefresh: jest.fn().mockResolvedValue(undefined) };
beforeEach(() => {
  (useDashboardBreakdown as jest.Mock).mockReturnValue({ isPending: false, isError: false, refetch: jest.fn().mockResolvedValue(undefined), data: { total: 500, rows: [{ label: '식자재', amount: 300 }, { label: '비품', amount: 200 }], suppliers: [{ label: '거래처A', amount: 500 }] } });
});
it('분류별과 거래처별 작은 카드를 같은 자리에서 전환한다', () => {
  render(<DashboardBreakdownCard {...props} />);
  expect(screen.getByText('식자재')).toBeTruthy();
  fireEvent.press(screen.getByText('거래처별'));
  expect(screen.getByText('거래처A')).toBeTruthy();
  expect(screen.queryByText('식자재')).toBeNull();
});
it('상세 금액이 요약과 다르면 차이를 알리고 새로고침 실패도 표시한다', async () => {
  render(<DashboardBreakdownCard {...props} expectedTotal={700} onRefresh={async () => { throw new Error('offline'); }} />);
  expect(screen.getByText(/요약과 차이/)).toBeTruthy();
  fireEvent.press(screen.getByText('자료 새로고침'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
});
it('조회 실패를 빈 내역으로 표시하지 않는다', () => {
  (useDashboardBreakdown as jest.Mock).mockReturnValue({ isPending: false, isError: true, data: undefined, refetch: jest.fn() });
  render(<DashboardBreakdownCard {...props} />);
  expect(screen.getByText('세부 내역을 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByText('등록된 내역이 없어요')).toBeNull();
});
