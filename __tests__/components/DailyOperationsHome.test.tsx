import { render, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
const mockTab = jest.fn();
let mockSummary: any;
let mockWorkflow: any;
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/hooks/useHomeWorkflow', () => ({ useHomeWorkflow: () => mockWorkflow }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => ({ goToTab: mockTab }) }));
jest.mock('../../lib/hooks/useDailyChecklistSummary', () => ({ useDailyChecklistSummary: () => mockSummary }));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
beforeEach(() => { jest.clearAllMocks(); mockWorkflow = { data: null, isSuccess: true }; mockSummary = { data: { open: { total: 3, done: 1 }, close: { total: 0, done: 0 } }, isError: false, refetch: jest.fn() }; });
const props = { active: true, refreshKey: 0, canUseFinancialTabs: true, isPartTime: false, isAdmin: false };
it('오픈과 마감 버튼은 해당 체크리스트 구간을 직접 연다', () => {
  render(<DailyOperationsHome {...props} />);
  fireEvent.press(screen.getByLabelText('오픈 체크리스트'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/cleaning', params: { segment: 'open' } });
  fireEvent.press(screen.getByLabelText('마감 체크리스트'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/cleaning', params: { segment: 'close' } });
  expect(screen.getByText('1/3 체크')).toBeTruthy();
  expect(screen.getByText('체크 항목을 추가해요')).toBeTruthy();
});
it('금융 탭이 없는 역할에게 매입·매출 진입을 노출하지 않는다', () => {
  render(<DailyOperationsHome {...props} canUseFinancialTabs={false} isPartTime />);
  expect(screen.queryByLabelText('매입 등록')).toBeNull();
  expect(screen.queryByLabelText('매출 확인')).toBeNull();
  expect(screen.queryByLabelText('비용 기록')).toBeNull();
  expect(screen.getByText('월 실근무 시간 제출')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('재고 수량 수정'));
  expect(mockTab).toHaveBeenCalledWith('stock');
});
it('조회 오류를 완료나 0건으로 바꾸지 않고 재시도를 제공한다', () => {
  mockSummary = { data: undefined, isError: true, refetch: jest.fn() };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getAllByText('확인 필요')).toHaveLength(2);
  expect(screen.queryByText('체크 항목을 추가해요')).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockSummary.refetch).toHaveBeenCalledTimes(1);
});

it('저장된 구성의 선택과 숨김을 적용한다', () => {
  mockWorkflow.data = { open: ['schedule', 'stock'], business: [], close: ['sales'] };
  render(<DailyOperationsHome {...props} />);
  expect(screen.queryByText('영업 중')).toBeNull();
  expect(screen.queryByLabelText('오픈 체크리스트')).toBeNull();
  expect(screen.getByLabelText('내 스케줄')).toBeTruthy();
  expect(screen.getByLabelText('매출 확인')).toBeTruthy();
});
