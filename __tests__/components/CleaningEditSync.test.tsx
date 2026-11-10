import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { clearQueryData } from '../../lib/query/client';
import CleaningEditScreen from '../../app/cleaning/edit';
const mockList = jest.fn(), mockAdd = jest.fn(), mockScroll = jest.fn(), mockOffset = jest.fn();
let mockOnScrollFailed: (info: { index: number; averageItemLength: number }) => void;
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useFocusEffect: (callback: () => void) => {
  const React = require('react'); React.useEffect(callback, [callback]);
} }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 's' }, user: { id: 'u' }, realRole: 'admin', currentRole: 'admin' }) }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/ui', () => {
  const { Text, TextInput, Pressable } = require('react-native');
  return { AppBar: () => null,
    Field: (props: any) => <TextInput {...props} accessibilityLabel={props.label} />,
    Button: ({ label, onPress, disabled }: any) => <Pressable onPress={onPress} disabled={disabled}><Text>{label}</Text></Pressable>,
  };
});
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react'), { View } = require('react-native');
  return { __esModule: true, ScaleDecorator: ({ children }: any) => children,
    default: React.forwardRef(({ data, renderItem, ListFooterComponent, ListHeaderComponent, keyboardShouldPersistTaps, onScrollToIndexFailed }: any, ref: any) => {
      mockOnScrollFailed = onScrollToIndexFailed;
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScroll, scrollToOffset: mockOffset }));
      return <View testID={`list-${keyboardShouldPersistTaps}`}>{ListHeaderComponent}{data.map((item: any) => <React.Fragment key={item.id}>{renderItem({ item, drag: jest.fn(), isActive: false })}</React.Fragment>)}{ListFooterComponent}</View>;
    }),
  };
});
jest.mock('../../lib/services/cleaning', () => ({
  listCleaningItems: (...args: unknown[]) => mockList(...args), listCleaningLogsByDate: async () => [],
  addCleaningItem: (...args: unknown[]) => mockAdd(...args), updateCleaningItem: jest.fn(),
  removeCleaningItem: jest.fn(), reorderCleaningItems: jest.fn(), checkCleaningItem: jest.fn(), uncheckCleaningItem: jest.fn(),
}));
beforeAll(() => { notifyManager.setNotifyFunction(callback => { act(() => callback()); }); });
afterAll(() => { notifyManager.setNotifyFunction(callback => callback()); });
beforeEach(async () => {
  await act(async () => { await clearQueryData(); }); mockScroll.mockReset(); mockOffset.mockReset();
  mockList.mockReset().mockResolvedValue([]);
  mockAdd.mockReset().mockImplementation(async (_store, segment, title, sort_order, weekday) => ({ id: 'added', store_id: 's', segment, title, sort_order, weekday }));
});
afterEach(async () => { await act(async () => { await clearQueryData(); }); });
it('요일 선택 후 한 번 추가하면 재진입 없이 행을 표시하고 그 행으로 이동한다', async () => {
  render(<CleaningEditScreen />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  fireEvent.press(screen.getByLabelText('요일별'));
  fireEvent.press(screen.getByLabelText('항목 추가 열기'));
  fireEvent.press(screen.getByLabelText('수요일'));
  fireEvent.changeText(screen.getByLabelText('새 항목'), 'QA-수요일 청소');
  fireEvent.press(screen.getByLabelText('항목 추가'));
  await waitFor(() => expect(screen.getByText('QA-수요일 청소')).toBeTruthy());
  expect(screen.getByText('수요일')).toBeTruthy();
  await waitFor(() => expect(mockScroll).toHaveBeenCalledWith({ index: 0, animated: true, viewPosition: 0.2 }));
  expect(mockAdd).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('list-handled')).toBeTruthy();
});

it('미측정 행으로 스크롤이 실패하면 근사 위치로 간 뒤 대상 행을 다시 시도한다', async () => {
  mockScroll.mockImplementationOnce(() => mockOnScrollFailed({ index: 0, averageItemLength: 100 }));
  render(<CleaningEditScreen />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  fireEvent.press(screen.getByLabelText('요일별'));
  fireEvent.press(screen.getByLabelText('항목 추가 열기'));
  fireEvent.changeText(screen.getByLabelText('새 항목'), 'QA-새 항목');
  fireEvent.press(screen.getByLabelText('항목 추가'));
  await waitFor(() => expect(screen.getByText('QA-새 항목')).toBeTruthy());
  await waitFor(() => expect(mockScroll).toHaveBeenCalledTimes(2));
  expect(mockOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
});

it('재시도 대기 중 구분을 바꾸면 이전 목록의 index로 스크롤하지 않는다', async () => {
  mockScroll.mockImplementationOnce(() => mockOnScrollFailed({ index: 0, averageItemLength: 100 }));
  render(<CleaningEditScreen />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  fireEvent.press(screen.getByLabelText('요일별'));
  fireEvent.press(screen.getByLabelText('항목 추가 열기'));
  fireEvent.changeText(screen.getByLabelText('새 항목'), 'QA-전환 전 항목');
  fireEvent.press(screen.getByLabelText('항목 추가'));
  await waitFor(() => expect(mockOffset).toHaveBeenCalled());
  fireEvent.press(screen.getByLabelText('오픈'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
  expect(screen.queryByText('QA-전환 전 항목')).toBeNull();
  expect(mockScroll).toHaveBeenCalledTimes(1);
});
