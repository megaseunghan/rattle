import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { HomeAlertStack } from '../../../lib/components/home/alerts/HomeAlertStack';
import type { HomeAlert } from '../../../types';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const mockMarkRead = jest.fn(async () => true);
const mockRestore = jest.fn(async () => true);
let mockAlerts: HomeAlert[] = [];
let mockError: string | null = null;
jest.mock('../../../lib/hooks/useHomeAlerts', () => ({ useHomeAlerts: () => ({
  scope: 'QA', alerts: mockAlerts, initialLoading: false, loading: false, error: mockError,
  refetch: jest.fn(), markRead: mockMarkRead, restoreRead: mockRestore,
}) }));

const alert = (key: string, message: string): HomeAlert => ({ key, kind: 'stock', message, actionLabel: '재고 확인', route: `/stock/${key}` });
function Harness({ leading = [] }: { leading?: any[] }) {
  const [expanded, setExpanded] = useState(false);
  return <HomeAlertStack active refreshKey={0} financial expanded={expanded} onExpandedChange={setExpanded} leadingCards={leading} />;
}
beforeEach(() => { jest.clearAllMocks(); mockAlerts = []; mockError = null; });

it('알림이 없으면 아무 칸도 그리지 않는다', () => {
  render(<Harness />);
  expect(screen.queryByText(/알림/)).toBeNull();
});
it('1건이면 펼치지 않고 누르면 해당 화면으로 간다', () => {
  mockAlerts = [alert('a', '우유 · 1개 남았어요')];
  render(<Harness />);
  fireEvent.press(screen.getByLabelText('우유 · 1개 남았어요, 재고 · 재고 확인'));
  expect(router.push).toHaveBeenCalledWith('/stock/a');
  expect(screen.queryByLabelText('알림 접기')).toBeNull();
});
it('여러 건은 맨 위 1장만 보이고 누르면 펼쳐 접기를 보인다', () => {
  mockAlerts = [alert('a', '우유'), alert('b', '원두'), alert('c', '컵')];
  render(<Harness />);
  expect(screen.queryByText('원두')).toBeNull();
  fireEvent.press(screen.getByLabelText('우유, 재고 · 재고 확인, 알림 3건 펼치기'));
  expect(screen.getByText('원두')).toBeTruthy(); expect(screen.getByText('컵')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('알림 접기'));
  expect(screen.queryByText('원두')).toBeNull();
});
it('닫기는 홈에서만 숨김을 저장하고 실행취소를 보인다', async () => {
  mockAlerts = [alert('a', '우유')];
  render(<Harness />);
  await act(async () => { fireEvent.press(screen.getByLabelText('이 알림 홈에서 닫기')); });
  expect(mockMarkRead).toHaveBeenCalledWith('a');
  expect(screen.getByText('홈에서 숨겼어요')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('실행취소')); });
  expect(mockRestore).toHaveBeenCalledWith('a');
});
it('숨기기 저장에 실패하면 완료로 보이지 않고 다시 시도를 준다', async () => {
  mockAlerts = [alert('a', '우유')];
  mockMarkRead.mockRejectedValueOnce(new Error('offline'));
  render(<Harness />);
  await act(async () => { fireEvent.press(screen.getByLabelText('이 알림 홈에서 닫기')); });
  expect(screen.getByText('알림을 숨기지 못했어요')).toBeTruthy();
  expect(screen.queryByText('홈에서 숨겼어요')).toBeNull();
});
it('마저 채우기 카드는 묶음 맨 위에 두고 닫기 버튼이 없다', () => {
  mockAlerts = [alert('a', '우유')];
  const onPress = jest.fn();
  render(<Harness leading={[{ key: 'fill', title: '매장 정보를 마저 채워 주세요', description: '4개 중 1개 채웠어요', actionHint: '', onPress }]} />);
  fireEvent.press(screen.getByLabelText('매장 정보를 마저 채워 주세요, 4개 중 1개 채웠어요, 알림 2건 펼치기'));
  expect(screen.getAllByLabelText('이 알림 홈에서 닫기')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('매장 정보를 마저 채워 주세요, 4개 중 1개 채웠어요'));
  expect(onPress).toHaveBeenCalled();
});
it('불러오기 실패는 빈 칸 대신 다시 시도를 보인다', () => {
  mockError = '홈 알림을 불러오지 못했어요.';
  render(<Harness />);
  expect(screen.getByText('알림을 불러오지 못했어요')).toBeTruthy();
});
