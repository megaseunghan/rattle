import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import CleaningScreen from '../../app/cleaning';
const mockToggle = jest.fn(), mockRefetch = jest.fn(), mockEmployeeRefetch = jest.fn();
let mockState: any, mockSegment = 'open';
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: jest.fn(), useLocalSearchParams: () => ({ segment: mockSegment }) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'store' }, user: { id: 'user', email: 'qa@example.invalid' }, devPreviewEmployeeId: null }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [{ id: 'employee', user_id: 'user', name: '직원 A' }], refetch: mockEmployeeRefetch }) }));
jest.mock('../../lib/hooks/useCleaningChecklist', () => ({ useCleaningChecklist: () => mockState }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('../../lib/components/ChecklistProgress', () => ({ ChecklistProgress: ({ done, total }: any) => {
  const { Text } = require('react-native'); return <Text accessibilityRole="progressbar" accessibilityValue={{ now: done, max: total }}>{Math.round(done / total * 100)}% 완료</Text>;
} }));
jest.mock('../../lib/components/ui', () => ({
  AppBar: ({ title, rightSlot }: any) => { const { Text } = require('react-native'); return <><Text>{title}</Text>{rightSlot}</>; },
  EmptyState: ({ title }: any) => { const { Text } = require('react-native'); return <Text>{title}</Text>; },
}));
const open = { id: 'open1', store_id: 'store', title: '냉장고와 제빙기 전원 상태 확인', segment: 'open', weekday: null, sort_order: 0 };
const second = { ...open, id: 'open2', title: '테이블 정리', sort_order: 1 };
const close = { ...open, id: 'close1', title: '마감 소등', segment: 'close' };
const log = { item_id: 'open1', checked_by_name: '완료한 직원의 긴 이름', checked_at: '2026-11-07T01:20:00.000Z' };
beforeEach(() => {
  jest.clearAllMocks(); mockSegment = 'open'; mockToggle.mockResolvedValue(undefined);
  mockState = { items: [open, second, close], logs: [], loading: false, error: null, itemsReady: true, checkingId: null, refetch: mockRefetch, toggle: mockToggle };
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('완료 정보를 예약한 오른쪽 한 줄 영역에 유지하고 행 구조를 바꾸지 않는다', () => {
  const view = render(<CleaningScreen />);
  const before = StyleSheet.flatten(screen.getByTestId('cleaning-row-open1').props.style);
  expect(before.minHeight).toBe(76);
  expect(StyleSheet.flatten(screen.getByTestId('cleaning-meta-open1', { includeHiddenElements: true }).props.style)).toMatchObject({ width: 104, opacity: 0 });
  mockState.logs = [log]; view.rerender(<CleaningScreen />);
  expect(StyleSheet.flatten(screen.getByTestId('cleaning-row-open1').props.style)).toEqual(before);
  expect(StyleSheet.flatten(screen.getByTestId('cleaning-meta-open1', { includeHiddenElements: true }).props.style)).toMatchObject({ width: 104 });
  expect(screen.getByText(log.checked_by_name, { includeHiddenElements: true }).props.numberOfLines).toBe(1);
  expect(screen.getByRole('checkbox', { name: new RegExp(log.checked_by_name) })).toBeTruthy();
  expect(screen.getByText(open.title).props.numberOfLines).toBeUndefined();
});

it('진행률은 현재 구간의 저장된 로그만 집계하며 탭은 기존 별도 화면 안에서 전환한다', () => {
  mockState.logs = [log]; render(<CleaningScreen />);
  expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ now: 1, max: 2 });
  fireEvent.press(screen.getByRole('tab', { name: '마감' }));
  expect(screen.getByText('마감 소등')).toBeTruthy();
  expect(screen.queryByText(open.title)).toBeNull();
  expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ now: 0, max: 1 });
});

it('체크 요청만으로 완료를 꾸미지 않고 저장된 로그가 바뀐 후 반영한다', async () => {
  const view = render(<CleaningScreen />);
  await act(async () => { fireEvent.press(screen.getByRole('checkbox', { name: open.title })); });
  expect(mockToggle).toHaveBeenCalledWith(open, '직원 A');
  expect(screen.getByRole('checkbox', { name: open.title }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(0);
  mockState.logs = [log]; view.rerender(<CleaningScreen />);
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(1);
});

it('저장 중에는 다른 체크도 잠그고 해당 행의 busy를 유지한다', () => {
  mockState.checkingId = 'open1'; render(<CleaningScreen />);
  expect(screen.getByTestId('cleaning-row-open1').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(screen.getByTestId('cleaning-row-open2').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('checkbox', { name: second.title }));
  expect(mockToggle).not.toHaveBeenCalled();
});

it.each([{ loading: true }, { error: '조회 실패' }, { items: [] }, { itemsReady: false }])('미확정·실패·빈 상태에는 진행률을 표시하지 않는다: %j', state => {
  mockState = { ...mockState, ...state }; render(<CleaningScreen />);
  expect(screen.queryByRole('progressbar')).toBeNull();
});
