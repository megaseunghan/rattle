import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import HomeWorkflowScreen from '../../app/settings/home-workflow';
import { HomeWorkflowEditor } from '../../lib/components/HomeWorkflowEditor';
import { DEFAULT_HOME_WORKFLOW } from '../../lib/utils/homeWorkflow';
import { saveHomeWorkflow } from '../../lib/services/homeWorkflow';
let mockRole = 'admin', mockStore = 'store1', mockUser = 'u', mockPreview = 'self';
let mockQuery: any;
let mockListProps: any;
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: any) => children }));
jest.mock('react-native-draggable-flatlist', () => {
 const React = require('react'), { View } = require('react-native');
 return { __esModule: true, default: (props: any) => {
  mockListProps = props;
  return <View testID={props.testID} onTouchCancel={props.onTouchCancel}>{props.ListHeaderComponent}{props.data.length ? props.data.map((item: any, index: number) => <React.Fragment key={item}>{props.renderItem({ item, getIndex: () => index, drag: jest.fn(), isActive: false })}</React.Fragment>) : props.ListEmptyComponent}{props.ListFooterComponent}</View>;
 } };
});
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUser }, store: { id: mockStore }, currentRole: mockRole, devPreviewMode: mockPreview }) }));
jest.mock('../../lib/hooks/useHomeWorkflow', () => ({ useHomeWorkflow: () => mockQuery }));
jest.mock('../../lib/services/homeWorkflow', () => ({ saveHomeWorkflow: jest.fn(), homeWorkflowLoadMessage: () => '설정 조회 실패' }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/ui/SheetModal', () => ({ SheetModal: ({ visible, children }: any) => visible ? children : null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
beforeEach(() => {
 jest.clearAllMocks(); mockRole = 'admin'; mockStore = 'store1'; mockUser = 'u'; mockPreview = 'self';
 mockQuery = { isSuccess: true, isError: false, data: null, refetch: jest.fn() };
 (saveHomeWorkflow as jest.Mock).mockResolvedValue(undefined);
 jest.spyOn(Alert, 'alert').mockImplementation(() => {});
 jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const editor = (onClose = jest.fn()) => render(<HomeWorkflowEditor visible initialPhase="open" onClose={onClose} />);
it('기존 설정 URL도 동일 편집기를 사용해 전체 목록과 구간별 선택을 저장한다', async () => {
 render(<HomeWorkflowScreen />);
 expect(screen.getAllByRole('checkbox')).toHaveLength(10);
 expect(screen.getByRole('checkbox', { name: '오픈 체크리스트' }).props.accessibilityState.checked).toBe(true);
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityHint).toBe('배치 구간: 마감');
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 expect(screen.getAllByRole('checkbox')).toHaveLength(10);
 fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
 fireEvent.press(screen.getByRole('checkbox', { name: '오픈 체크리스트' }));
 expect(saveHomeWorkflow).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', { ...DEFAULT_HOME_WORKFLOW, open: ['stock', 'schedule', 'sales'] }));
 expect((saveHomeWorkflow as jest.Mock).mock.calls[0][1].close).toEqual(DEFAULT_HOME_WORKFLOW.close);
 await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
});
it('구간 전환 후에도 미저장 선택을 유지하고 다른 구간을 표시한다', () => {
 editor(); fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 fireEvent.press(screen.getByLabelText('마감 구성'));
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityState.checked).toBe(true);
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityHint).toBe('배치 구간: 오픈, 마감');
 fireEvent.press(screen.getByLabelText('오픈 구성'));
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityState.checked).toBe(true);
});
it('최초 구간을 전달하고 접근성 첫/마지막 순서 이동은 기존 순서를 보존한다', async () => {
 render(<HomeWorkflowEditor visible initialPhase="business" onClose={jest.fn()} />);
 expect(screen.getByText('영업 중 바로가기 편집')).toBeTruthy();
 fireEvent(screen.getByLabelText('재고 수량 수정 순서 이동'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
 fireEvent(screen.getByLabelText('요일별 체크 순서 이동'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', DEFAULT_HOME_WORKFLOW));
});
it('취소는 확인 후 닫고 원격 저장하지 않는다', () => {
 const close = jest.fn(); editor(close);
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));fireEvent.press(screen.getByLabelText('바로가기 편집 닫기'));
 expect(close).not.toHaveBeenCalled();
 const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];buttons.find((b: any) => b.text === '변경 취소').onPress();
 expect(close).toHaveBeenCalledTimes(1);expect(saveHomeWorkflow).not.toHaveBeenCalled();
});
it('저장 실패는 선택을 보존하고 다시 저장할 수 있다', async () => {
 (saveHomeWorkflow as jest.Mock).mockRejectedValueOnce(new Error('일시 실패'));
 editor();fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(screen.getByText('저장하지 못했어요. 선택한 구성은 유지했어요.')).toBeTruthy());
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityState.checked).toBe(true);
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledTimes(2));
});
it('저장 대기 중 닫기·편집·중복 저장을 차단한다', async () => {
 let finish!: () => void;(saveHomeWorkflow as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
 const close = jest.fn();editor(close);fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));fireEvent.press(screen.getByLabelText('바로가기 편집 닫기'));
 expect(saveHomeWorkflow).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityState.disabled).toBe(true);
 await act(async () => finish());expect(close).toHaveBeenCalledTimes(1);
});
it('다른 계정/매장으로 바뀌면 초안을 초기화하고 이전 응답으로 닫지 않는다', async () => {
 let finish!: () => void;(saveHomeWorkflow as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
 const close = jest.fn();const view = editor(close);fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 mockUser = 'other';mockStore = 'store2';view.rerender(<HomeWorkflowEditor visible initialPhase="open" onClose={close} />);
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityState.checked).toBe(false);
 await act(async () => finish());expect(close).not.toHaveBeenCalled();
});
it('조회 실패는 기본 구성으로 저장하지 않고 재조회만 제공한다', () => {
 mockQuery = { isError: true, isSuccess: false, data: undefined, refetch: jest.fn() };editor();
 expect(screen.queryByRole('checkbox')).toBeNull();fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));expect(saveHomeWorkflow).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('바로가기 설정 다시 불러오기'));expect(mockQuery.refetch).toHaveBeenCalledTimes(1);
});
it.each(['member', 'preview'])('직원 또는 미리보기(%s)는 구성 저장을 할 수 없다', (role) => {
 if (role === 'preview') mockPreview = 'regular';else mockRole = role;
 render(<HomeWorkflowScreen />);expect(screen.getByText('홈 구성은 매장 관리자만 변경할 수 있어요.')).toBeTruthy();expect(screen.queryByLabelText('바로가기 구성 저장')).toBeNull();
});
it('배경 재조회는 편집 중인 선택을 덮어쓰지 않는다', () => {
 const close = jest.fn();const view = editor(close);
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 mockQuery = { ...mockQuery, data: { open: [], business: [], close: [] } };
 view.rerender(<HomeWorkflowEditor visible initialPhase="open" onClose={close} />);
 expect(screen.getByRole('checkbox', { name: '매출 확인' }).props.accessibilityState.checked).toBe(true);
 expect(screen.getByRole('checkbox', { name: '오픈 체크리스트' }).props.accessibilityState.checked).toBe(true);
});
it('언마운트 이후 늦은 저장 완료는 이전 화면 닫기를 실행하지 않는다', async () => {
 let finish!: () => void;(saveHomeWorkflow as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
 const close = jest.fn();const view = editor(close);fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 view.unmount();await act(async () => finish());expect(close).not.toHaveBeenCalled();
});
it('선택 목록 해제만 제거하며 마지막 제거를 원래 구간과 위치에 복원한다', async () => {
 editor();
 expect(screen.queryByLabelText('재고 확인 위로 이동')).toBeNull();
 expect(screen.queryByLabelText('재고 확인 이 구간에서 빼기')).toBeNull();
 fireEvent.press(screen.getByRole('checkbox', { name: '재고 확인' }));
 expect(screen.queryByLabelText('재고 확인 순서 이동')).toBeNull();
 expect(screen.queryByText('재고 확인 뺐어요')).toBeNull();
 expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('재고 확인 표시 해제. 실행 취소할 수 있어요.');
 fireEvent.press(screen.getByLabelText('영업 중 구성'));
 fireEvent.press(screen.getByLabelText('바로가기 실행 취소'));
 expect(screen.queryByText('재고 확인 뺐어요')).toBeNull();
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', DEFAULT_HOME_WORKFLOW));
});
it('다시 선택한 뒤 실행 취소해도 같은 항목을 중복 복원하지 않는다', async () => {
 editor();
 const checkbox = () => screen.getByRole('checkbox', { name: '재고 확인' });
 fireEvent.press(checkbox()); fireEvent.press(checkbox());
 fireEvent.press(screen.getByLabelText('바로가기 실행 취소'));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', { ...DEFAULT_HOME_WORKFLOW, open: ['open_check', 'schedule', 'stock'] }));
});
it('새 제거는 이전 실행 취소를 대체하고 저장 시 실행 취소를 정리한다', async () => {
 (saveHomeWorkflow as jest.Mock).mockRejectedValueOnce(new Error('fail'));
 editor();
 fireEvent.press(screen.getByRole('checkbox', { name: '재고 확인' }));
 fireEvent.press(screen.getByRole('checkbox', { name: '내 스케줄' }));
 expect(screen.queryByText('재고 확인 뺐어요')).toBeNull();
 expect(screen.queryByText('내 스케줄 뺐어요')).toBeNull();
 expect(screen.getByLabelText('바로가기 실행 취소').props.accessibilityHint).toContain('내 스케줄');
 fireEvent.press(screen.getByLabelText('바로가기 실행 취소'));
 fireEvent.press(screen.getByRole('checkbox', { name: '내 스케줄' }));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(screen.getByText('저장하지 못했어요. 선택한 구성은 유지했어요.')).toBeTruthy());
 expect(screen.queryByLabelText('바로가기 실행 취소')).toBeNull();
 expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', { ...DEFAULT_HOME_WORKFLOW, open: ['open_check'] });
});
it('끌기 중 구간·선택·취소·저장을 잠그고 완료 순서만 반영한다', async () => {
 const close = jest.fn(), state = jest.fn();
 render(<HomeWorkflowEditor visible initialPhase="open" onClose={close} onStateChange={state} />);
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 expect(state).toHaveBeenLastCalledWith({ dirty: false, busy: true });
 for (const label of ['마감 구성', '바로가기 편집 닫기', '바로가기 실행 취소', '바로가기 구성 저장']) expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
 expect(screen.getByRole('checkbox', { name: '내 스케줄' }).props.accessibilityState.disabled).toBe(true);
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 fireEvent.press(screen.getByLabelText('바로가기 편집 닫기'));
 expect(saveHomeWorkflow).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
 act(() => mockListProps.onDragEnd({ data: ['stock', 'open_check', 'schedule'], from: 1, to: 0 }));
 expect(screen.getByLabelText('바로가기 구성 저장').props.accessibilityState.disabled).toBe(false);
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', { ...DEFAULT_HOME_WORKFLOW, open: ['stock', 'open_check', 'schedule'] }));
});
it.each([
 ['누락', ['stock', 'open_check']],
 ['중복', ['stock', 'stock', 'open_check']],
 ['새 항목', ['stock', 'open_check', 'sales']],
])('끌기 완료의 %s 결과는 순서를 잃거나 추가하지 않는다', async (_name, order) => {
 editor(); fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 act(() => mockListProps.onDragEnd({ data: order, from: 1, to: 0 }));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', DEFAULT_HOME_WORKFLOW));
});
it('네이티브가 RN 터치를 인수해도 일반 touchCancel로 유효한 끌기를 초기화하지 않는다', async () => {
 editor(); fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 expect(mockListProps.onTouchCancel).toBeUndefined();
 expect(screen.getByLabelText('바로가기 구성 저장').props.accessibilityState.disabled).toBe(true);
 act(() => mockListProps.onDragEnd({ data: ['stock', 'open_check', 'schedule'], from: 1, to: 0 }));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', { ...DEFAULT_HOME_WORKFLOW, open: ['stock', 'open_check', 'schedule'] }));
});
it('비활성화로 끌기를 취소해도 선택은 유지하고 늦은 완료는 무시한다', async () => {
 let notify!: (state: AppStateStatus) => void;
 jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => { notify = handler; return { remove: jest.fn() }; });
 editor(); fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 const oldEnd = mockListProps.onDragEnd;
 act(() => notify('inactive'));
 act(() => oldEnd({ data: ['stock', 'open_check', 'schedule'], from: 1, to: 0 }));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', DEFAULT_HOME_WORKFLOW));
});
it('계정 전환 후 이전 끌기 완료는 새 초안과 잠금을 건드리지 않는다', async () => {
 const close = jest.fn(), view = editor(close);
 fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 const oldEnd = mockListProps.onDragEnd;
 mockUser = 'other'; mockStore = 'store2'; view.rerender(<HomeWorkflowEditor visible initialPhase="open" onClose={close} />);
 fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 act(() => oldEnd({ data: ['stock', 'open_check', 'schedule'], from: 1, to: 0 }));
 expect(screen.getByLabelText('바로가기 구성 저장').props.accessibilityState.disabled).toBe(true);
 act(() => mockListProps.onDragEnd({ data: ['schedule', 'stock', 'open_check'], from: 2, to: 0 }));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store2', { ...DEFAULT_HOME_WORKFLOW, open: ['schedule', 'stock', 'open_check'] }));
});
it('시트 재열기 후 실행 취소와 이전 끌기 완료는 초기화된다', async () => {
 const close = jest.fn(), view = editor(close);
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 fireEvent.press(screen.getByRole('checkbox', { name: '매출 확인' }));
 fireEvent(screen.getByLabelText('재고 확인 순서 이동'), 'pressIn');
 const oldEnd = mockListProps.onDragEnd;
 view.rerender(<HomeWorkflowEditor visible={false} initialPhase="open" onClose={close} />);
 view.rerender(<HomeWorkflowEditor visible initialPhase="open" onClose={close} />);
 expect(screen.queryByLabelText('바로가기 실행 취소')).toBeNull();
 act(() => oldEnd({ data: ['stock', 'open_check', 'schedule'], from: 1, to: 0 }));
 fireEvent.press(screen.getByLabelText('바로가기 구성 저장'));
 await waitFor(() => expect(saveHomeWorkflow).toHaveBeenCalledWith('store1', DEFAULT_HOME_WORKFLOW));
});

it('전체 배치 칩을 표시하고 현재 구간 해제는 다른 구간 배치를 유지한다', () => {
 mockQuery.data = { open: ['stock'], business: ['stock'], close: ['stock'] };
 editor();
 const stock = () => screen.getByRole('checkbox', { name: '재고 확인' });
 expect(stock().props.accessibilityHint).toBe('배치 구간: 오픈, 영업 중, 마감');
 fireEvent.press(stock());
 expect(stock().props.accessibilityState.checked).toBe(false);
 expect(stock().props.accessibilityHint).toBe('배치 구간: 영업 중, 마감');
 fireEvent.press(screen.getByLabelText('바로가기 실행 취소'));
 expect(stock().props.accessibilityHint).toBe('배치 구간: 오픈, 영업 중, 마감');
 expect(stock().props.accessibilityState.checked).toBe(true);
});

it('파란 행 배경은 현재 구간 체크에만 따라가고 다른 구간 칩은 유지한다', () => {
 mockQuery.data = { open: ['stock'], business: ['stock'], close: ['sales'] };
 editor();
 const row = (name: string) => screen.getByRole('checkbox', { name });
 const background = (name: string) => StyleSheet.flatten(row(name).props.style).backgroundColor;
 expect(background('재고 확인')).toBe('#E0EDFF');
 expect(background('매출 확인')).toBeUndefined();
 fireEvent.press(row('재고 확인'));
 expect(background('재고 확인')).toBeUndefined();
 expect(row('재고 확인').props.accessibilityHint).toBe('배치 구간: 영업 중');
 fireEvent.press(screen.getByLabelText('바로가기 실행 취소'));
 expect(background('재고 확인')).toBe('#E0EDFF');
 fireEvent.press(screen.getByLabelText('마감 구성'));
 expect(background('재고 확인')).toBeUndefined();
 expect(background('매출 확인')).toBe('#E0EDFF');
});
