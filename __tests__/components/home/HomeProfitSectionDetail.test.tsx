import { render, screen } from '@testing-library/react-native';
import { HomeProfitSection } from '../../../lib/components/home/profit/HomeProfitSection';

let mockDetail: Record<string, unknown> = {};
jest.mock('../../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'store' }, user: { id: 'owner' }, canManageStore: true }) }));
jest.mock('../../../lib/hooks/useHomeProfit', () => ({
  MONTH_BAR_COUNT: 6,
  useHomeProfit: () => ({
    bars: [{ key: '2026-11', name: '11월', current: true, values: { profit: 100, revenue: 1000, purchase: 300, labor: 400, expense: 200 } }],
    loading: false, error: false, sameDay: null, comparisonState: 'ready', refetch: jest.fn(),
  }),
}));
jest.mock('../../../lib/hooks/useHomeProfitDetail', () => ({ useHomeProfitDetail: () => mockDetail }));
jest.mock('../../../lib/components/home/profit/ProfitBars', () => ({ ProfitBars: () => null, ProfitBarsSkeleton: () => null }));
jest.mock('../../../lib/components/home/profit/ProfitHead', () => ({ ProfitHead: () => null }));
jest.mock('../../../lib/components/home/profit/ProfitDetail', () => ({
  ProfitDetail: ({ kind }: { kind: string }) => require('react').createElement(require('react-native').Text, null, `세부:${kind}`),
}));

it('상세 손익 열람이 거절되면 세부를 불러오는 중으로 남기지 않고 그리지 않는다', () => {
  mockDetail = { denied: true, sources: undefined, loading: false, error: false, refetch: jest.fn() };
  render(<HomeProfitSection active refreshKey={0} />);
  expect(screen.queryByText(/세부:/)).toBeNull();
});

it('거절이 아니면 받는 동안 불러오는 중을 보여 준다', () => {
  mockDetail = { denied: false, sources: undefined, loading: true, error: false, refetch: jest.fn() };
  render(<HomeProfitSection active refreshKey={0} />);
  expect(screen.getByText('세부:loading')).toBeTruthy();
});
