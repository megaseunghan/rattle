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
const tileLabels = () => screen.getAllByRole('button').map(item => item.props.accessibilityLabel).filter(Boolean);

it('최초 오픈을 선택하고 마감 전환 시 해당 체크리스트만 직접 연다', () => {
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByRole('tab', { name: '오픈' }).props.accessibilityState.selected).toBe(true);
  expect(screen.queryByLabelText(/^마감 정리 끝내기/)).toBeNull();
  fireEvent.press(screen.getByLabelText('오픈 준비 끝내기, 남은 2개 챙기고'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/cleaning', params: { segment: 'open' } });
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  expect(screen.queryByLabelText(/^오픈 준비 끝내기/)).toBeNull();
  // 체크 항목이 없는 체크리스트는 완료가 아니라 '추가'로 보인다.
  fireEvent.press(screen.getByLabelText('마감 정리 끝내기, 체크 항목을 추가해요'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/cleaning', params: { segment: 'close' } });
});
it('영업 중에는 저장된 해당 구간 순서를 유지하고 다른 구간은 표시하지 않는다', () => {
  mockWorkflow.data = { open: ['schedule'], business: ['recipes', 'stock_edit', 'purchase'], close: ['sales'] };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText(/^내 스케줄 보기/)).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.queryByLabelText(/^내 스케줄 보기/)).toBeNull();
  expect(tileLabels().slice(0, 3).map(label => label.split(',')[0])).toEqual(['레시피 확인하기', '재고 수량 고치기', '매입 등록하기']);
  fireEvent.press(screen.getByLabelText(/^매입 등록하기/));
  expect(router.push).toHaveBeenLastCalledWith('/purchases/new');
});
it('4개를 넘으면 앞 4개만 보이고 더 보기로 펼친다', () => {
  mockWorkflow.data = { open: ['open_check', 'stock', 'schedule', 'weekday_check', 'recipes', 'sales'], business: [], close: [] };
  render(<DailyOperationsHome {...props} />);
  expect(screen.queryByLabelText(/^레시피 확인하기/)).toBeNull();
  fireEvent.press(screen.getByText('2개 더 보기'));
  expect(screen.getByLabelText(/^레시피 확인하기/)).toBeTruthy();
  expect(screen.getByText('접기')).toBeTruthy();
});
it('금융 권한이 없는 역할은 모든 구간에서 재무 기능을 숨긴다', () => {
  render(<DailyOperationsHome {...props} canUseFinancialTabs={false} isPartTime />);
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.queryByLabelText(/^매입 등록하기/)).toBeNull();
  expect(screen.queryByLabelText(/^레시피 확인하기/)).toBeNull();
  fireEvent.press(screen.getByLabelText(/^재고 수량 고치기/));
  expect(mockTab).toHaveBeenCalledWith('stock');
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  expect(screen.queryByLabelText(/^하루 매출 확인하기/)).toBeNull();
  expect(screen.queryByLabelText(/^비용 기록하기/)).toBeNull();
});
it('체크 조회 오류를 0건·완료로 바꾸지 않으며 체크 타일이 있는 구간에서만 재시도한다', () => {
  mockSummary = { data: undefined, isError: true, refetch: jest.fn() };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText('오픈 준비 끝내기, 확인 필요')).toBeTruthy();
  expect(screen.queryByText(/체크 항목을 추가해요|모두 챙겼어요/)).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockSummary.refetch).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.queryByText('체크 현황을 불러오지 못했어요.')).toBeNull();
});
it('빈 구간은 할 일 없음으로 보이고 임의로 기본 항목을 채우지 않는다', () => {
  mockWorkflow.data = { open: ['schedule', 'stock'], business: [], close: ['sales'] };
  render(<DailyOperationsHome {...props} isAdmin />);
  fireEvent.press(screen.getByRole('tab', { name: '영업 중' }));
  expect(screen.getByText('영업 중에 넣어 둔 할 일이 없어요')).toBeTruthy();
  expect(screen.queryByLabelText(/^매입 등록하기/)).toBeNull();
  fireEvent.press(screen.getByLabelText('할 일 목록 편집'));
  expect(screen.getByText('business 편집창')).toBeTruthy();
});
it('편집은 현재 구간에서 별도 창을 열고 닫아도 구간을 유지한다', () => {
  render(<DailyOperationsHome {...props} isAdmin />);
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  fireEvent.press(screen.getByLabelText('할 일 목록 편집'));
  expect(screen.getByText('close 편집창')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('시안 편집 닫기'));
  expect(screen.queryByText('close 편집창')).toBeNull();
  expect(screen.getByRole('tab', { name: '마감' }).props.accessibilityState.selected).toBe(true);
});
it('목록 편집은 실제 관리자 본인 모드에만 제공한다', () => {
  mockAuth.devPreviewMode = 'regular';
  const view = render(<DailyOperationsHome {...props} isAdmin />);
  expect(screen.queryByLabelText('할 일 목록 편집')).toBeNull();
  mockAuth.devPreviewMode = 'self'; mockAuth.currentRole = 'member';
  view.rerender(<DailyOperationsHome {...props} refreshKey={1} isAdmin />);
  expect(screen.queryByLabelText('할 일 목록 편집')).toBeNull();
});
it('최초 설정 로딩에는 기본 구성으로 완료처럼 보이지 않는다', () => {
  mockWorkflow = { ...mockWorkflow, data: undefined, isPending: true };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText('할 일 불러오는 중')).toBeTruthy();
  expect(screen.queryByLabelText(/^재고 확인하기/)).toBeNull();
  expect(screen.getByRole('tab', { name: '오픈' })).toBeTruthy();
});
it('처음 불러오기가 실패하면 기본 구성 대신 실패를 보이고 다시 불러온다', () => {
  mockWorkflow = { data: undefined, isPending: false, isError: true, error: new Error('offline'), refetch: jest.fn() };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByText('할 일을 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByLabelText(/^재고 확인하기/)).toBeNull();
  fireEvent.press(screen.getByText('다시 불러오기'));
  expect(mockWorkflow.refetch).toHaveBeenCalledTimes(1);
});
it('설정 재조회 실패에는 이전 구성을 보존하고 새로고침만 요청한다', () => {
  mockWorkflow = { data: { open: ['schedule'], business: [], close: [] }, isError: true, error: new Error('offline'), refetch: jest.fn() };
  render(<DailyOperationsHome {...props} />);
  expect(screen.getByLabelText(/^내 스케줄 보기/)).toBeTruthy();
  expect(screen.getByText(/이전 목록을 보여드려요/)).toBeTruthy();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockWorkflow.refetch).toHaveBeenCalledTimes(1);
});
it('매장 전환은 오픈으로 초기화하고 이전 매장 편집창을 닫는다', () => {
  const view = render(<DailyOperationsHome {...props} isAdmin />);
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  fireEvent.press(screen.getByLabelText('할 일 목록 편집'));
  mockAuth = { ...mockAuth, store: { id: 'other' } };
  view.rerender(<DailyOperationsHome {...props} refreshKey={1} isAdmin />);
  expect(screen.getByRole('tab', { name: '오픈' }).props.accessibilityState.selected).toBe(true);
  expect(screen.queryByText('close 편집창')).toBeNull();
});
