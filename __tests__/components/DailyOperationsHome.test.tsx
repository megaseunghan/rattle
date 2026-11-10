import { render, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
const mockTab = jest.fn();
let mockSummary: any;
let mockWorkflow: any;
let mockAuth: any;
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/hooks/useHomeWorkflow', () => ({ useHomeWorkflow: () => mockWorkflow }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => ({ goToTab: mockTab }) }));
jest.mock('../../lib/hooks/useDailyChecklistSummary', () => ({ useDailyChecklistSummary: () => mockSummary }));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
jest.mock('../../lib/components/HomeWorkflowEditor', () => ({ HomeWorkflowEditor: ({ visible, initialPhase, onClose }: any) => {
  const { Text, Pressable } = require('react-native');
  return visible ? <Pressable accessibilityLabel="시안 편집 닫기" onPress={onClose}><Text>{initialPhase} 편집창</Text></Pressable> : null;
} }));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { user: { id: 'u' }, store: { id: 's' }, currentRole: 'admin', devPreviewMode: 'self' };
  mockWorkflow = { data: null, isSuccess: true, isPending: false, refetch: jest.fn() };
  mockSummary = { data: { open: { total: 3, done: 1 }, close: { total: 0, done: 0 } }, isError: false, refetch: jest.fn() };
});
const props = { active: true, refreshKey: 0, canUseFinancialTabs: true, isPartTime: false, isAdmin: false };
it('최초 오픈을 선택하고 마감 전환 시 해당 체크리스트만 직접 연다', () => {
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByRole('tab', { name: '오픈' }).props.accessibilityState.selected).toBe(true);
  expect(screen.queryByLabelText(/^마감 체크리스트/)).toBeNull();
  fireEvent.press(screen.getByLabelText(/^오픈 체크리스트/));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/cleaning', params: { segment: 'open' } });
  expect(screen.getByText('33% 완료')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  expect(screen.queryByLabelText(/^오픈 체크리스트/)).toBeNull();
  fireEvent.press(screen.getByLabelText(/^마감 체크리스트/));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/cleaning', params: { segment: 'close' } });
  expect(screen.getByText('체크 항목을 추가해요')).toBeTruthy();
});
it('영업 중에는 저장된 해당 구간 순서를 유지하고 다른 구간은 표시하지 않는다', () => {
  mockWorkflow.data = { open: ['schedule'], business: ['recipes', 'stock_edit', 'purchase'], close: ['sales'] };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText('내 스케줄')).toBeTruthy();
  expect(screen.queryByLabelText('레시피 확인')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.queryByLabelText('내 스케줄')).toBeNull();
  const buttons = screen.getAllByRole('button').map(item => item.props.accessibilityLabel).filter(Boolean);
  expect(buttons.slice(0, 3)).toEqual(['레시피 확인', '재고 수량 수정', '매입 등록']);
  fireEvent.press(screen.getByLabelText('매입 등록'));
  expect(router.push).toHaveBeenLastCalledWith('/purchases/new');
});
it('금융 권한이 없는 역할은 모든 구간에서 재무 기능을 숨기고 개인 기능은 유지한다', () => {
  render(<DailyOperationsHome {...props} canUseFinancialTabs={false} isPartTime />);
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.queryByLabelText('매입 등록')).toBeNull();
  expect(screen.queryByLabelText('레시피 확인')).toBeNull();
  fireEvent.press(screen.getByLabelText('재고 수량 수정'));
  expect(mockTab).toHaveBeenCalledWith('stock');
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  expect(screen.queryByLabelText('매출 확인')).toBeNull();
  expect(screen.queryByLabelText('비용 기록')).toBeNull();
  fireEvent.press(screen.getByLabelText('내 급여'));
  expect(router.push).toHaveBeenLastCalledWith('/mypage/payslip');
  fireEvent.press(screen.getByLabelText('근무시간 제출'));
  expect(router.push).toHaveBeenLastCalledWith('/mypage/work-minutes');
});
it('체크 조회 오류를 0건으로 바꾸지 않으며 해당 구간에서만 재시도한다', () => {
  mockSummary = { data: undefined, isError: true, refetch: jest.fn() };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByText('확인 필요')).toBeTruthy();
  expect(screen.queryByText('체크 항목을 추가해요')).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockSummary.refetch).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.queryByText('체크 현황을 불러오지 못했어요.')).toBeNull();
});
it('빈 구간도 선택할 수 있고 임의로 기본 항목을 채우지 않는다', () => {
  mockWorkflow.data = { open: ['schedule', 'stock'], business: [], close: ['sales'] };
  render(<DailyOperationsHome {...props} isAdmin />);
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.getByText('이 구간에 표시할 기능이 없어요.')).toBeTruthy();
  expect(screen.queryByLabelText('매입 등록')).toBeNull();
  expect(screen.getByLabelText('직원·급여')).toBeTruthy();
  fireEvent.press(screen.getByText('구성 편집'));
  expect(screen.getByText('business 편집창')).toBeTruthy();
});
it('편집은 현재 구간에서 별도 창을 열고 닫아도 구간을 유지한다', () => {
  render(<DailyOperationsHome {...props} isAdmin />);
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  fireEvent.press(screen.getByLabelText('매장 바로가기 구성 수정'));
  expect(screen.getByText('close 편집창')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('시안 편집 닫기'));
  expect(screen.queryByText('close 편집창')).toBeNull();
  expect(screen.getByRole('tab', { name: '마감' }).props.accessibilityState.selected).toBe(true);
});
it('구성 편집은 실제 관리자 본인 모드에만 제공한다', () => {
  mockAuth.devPreviewMode = 'regular';
  const view = render(<DailyOperationsHome {...props} isAdmin />);
  expect(screen.queryByLabelText('매장 바로가기 구성 수정')).toBeNull();
  mockAuth.devPreviewMode = 'self'; mockAuth.currentRole = 'member';
  view.rerender(<DailyOperationsHome {...props} refreshKey={1} isAdmin />);
  expect(screen.queryByLabelText('매장 바로가기 구성 수정')).toBeNull();
});
it('최초 설정 로딩에는 기본 구성으로 완료처럼 보이지 않는다', () => {
  mockWorkflow = { ...mockWorkflow, data: undefined, isPending: true };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText('바로가기 불러오는 중')).toBeTruthy();
  expect(screen.queryByLabelText('재고 확인')).toBeNull();
  expect(screen.getByLabelText('내 급여')).toBeTruthy();
});
it('설정 재조회 실패에는 이전 구성을 보존하고 새로고침만 요청한다', () => {
  mockWorkflow = { data: { open: ['schedule'], business: [], close: [] }, isError: true, error: new Error('offline'), refetch: jest.fn() };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText('내 스케줄')).toBeTruthy();
  expect(screen.getByText(/이전 구성을 유지해요/)).toBeTruthy();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockWorkflow.refetch).toHaveBeenCalledTimes(1);
});
it('매장 전환은 오픈으로 초기화하고 이전 매장 편집창을 닫는다', () => {
  const view = render(<DailyOperationsHome {...props} isAdmin />);
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  fireEvent.press(screen.getByLabelText('매장 바로가기 구성 수정'));
  mockAuth = { ...mockAuth, store: { id: 'other' } };
  view.rerender(<DailyOperationsHome {...props} refreshKey={1} isAdmin />);
  expect(screen.getByRole('tab', { name: '오픈' }).props.accessibilityState.selected).toBe(true);
  expect(screen.queryByText('close 편집창')).toBeNull();
});
