import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { clearQueryData } from '../../lib/query/client';
const mockGet = jest.fn(), mockRead = jest.fn(), mockAll = jest.fn(), mockDismiss = jest.fn();
let mockRole = 'admin';
let mockUser = { id: 'u' };
let mockPreview = 'self';
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => {
  const React = require('react'); React.useEffect(callback, [callback]);
} }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'a' }, user: mockUser, realRole: 'admin', canReadFinancials: true, currentRole: mockRole, memberRoles: {}, devPreviewMode: mockPreview }) }));
jest.mock('../../lib/services/notifications', () => ({ dismissNotification: (...args: unknown[]) => mockDismiss(...args), getNotifications: (...args: unknown[]) => mockGet(...args), markNotificationRead: (...args: unknown[]) => mockRead(...args), markAllNotificationsRead: (...args: unknown[]) => mockAll(...args) }));
const notifications = [{ id: 'n1', category: 'stock', is_read: false }, { id: 'n2', category: 'members', is_read: false }];
beforeAll(() => { notifyManager.setNotifyFunction(callback => { act(() => callback()); }); });
afterAll(() => { notifyManager.setNotifyFunction(callback => callback()); });
beforeEach(async () => {
  await act(async () => { await clearQueryData(); });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active', writable: true });
  mockRole = 'admin'; mockUser = { id: 'u' }; mockPreview = 'self';
  mockGet.mockReset().mockResolvedValue(notifications);
  mockDismiss.mockReset().mockResolvedValue(undefined); mockRead.mockReset().mockResolvedValue(undefined); mockAll.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => { await clearQueryData(); }); jest.restoreAllMocks(); });
it('두 화면은 한 조회·타이머를 공유하고 읽음 상태가 동시에 반영된다', async () => {
  const timer = jest.spyOn(globalThis, 'setInterval');
  const first = renderHook(() => useNotifications());
  const second = renderHook(() => useNotifications());
  await waitFor(() => expect(second.result.current.unreadCount).toBe(2));
  expect(mockGet).toHaveBeenCalledTimes(1); expect(timer.mock.calls.filter(call => call[1] === 30_000)).toHaveLength(1);
  await act(async () => { await first.result.current.markRead('n1'); });
  await waitFor(() => expect(second.result.current.unreadCount).toBe(1));
  await act(async () => { await second.result.current.markAllRead(); });
  await waitFor(() => expect(first.result.current.unreadCount).toBe(0));
  expect(mockGet).toHaveBeenCalledTimes(1);
  first.unmount(); second.unmount();
});
it('직원 미리보기·계정 전환에는 이전 알림을 노출하지 않는다', async () => {
  const { result, rerender } = renderHook(() => useNotifications());
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  mockGet.mockImplementation(() => new Promise(() => {}));
  mockRole = 'member'; mockPreview = 'regular'; rerender({});
  expect(result.current.notifications).toEqual([]);
  mockUser = { id: 'other' }; rerender({});
  expect(result.current.notifications).toEqual([]);
});
it('직원 알림에는 멤버 신청이 없고 수동 새로고침은 캐시를 건너뛴다', async () => {
  mockRole = 'member';
  const { result } = renderHook(() => useNotifications());
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  expect(result.current.notifications.map(n => n.id)).toEqual(['n1']);
  await act(async () => { await result.current.refetch(); });
  expect(mockGet).toHaveBeenCalledTimes(2);
});
it('갱신 권한이 거부되면 이전 캐시를 숨긴다', async () => {
  const { result } = renderHook(() => useNotifications());
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  mockGet.mockRejectedValue(new Error('permission denied'));
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.notifications).toEqual([]));
  expect(result.current.error).toBeTruthy();
});

it('본인 삭제 성공 후 공유 캐시에서 해당 알림만 빼고 다른 화면도 갱신한다', async () => {
 const one=renderHook(()=>useNotifications()), two=renderHook(()=>useNotifications());
 await waitFor(()=>expect(two.result.current.unreadCount).toBe(2));
 await act(async()=>{await one.result.current.dismiss('n1')});
 expect(mockDismiss).toHaveBeenCalledWith('a','u','n1');await waitFor(()=>expect(two.result.current.notifications.map(n=>n.id)).toEqual(['n2']));
});
it('삭제 실패는 원본 목록을 보존하고 오류를 표시한다',async()=>{
 mockDismiss.mockRejectedValueOnce(new Error('서버 연결 실패'));const view=renderHook(()=>useNotifications());await waitFor(()=>expect(view.result.current.unreadCount).toBe(2));
 await act(async()=>{await view.result.current.dismiss('n1')});expect(view.result.current.notifications).toHaveLength(2);expect(view.result.current.error).toBeTruthy();
});
it('삭제 대기 중 계정이 바뀌면 늦은 응답이 새 계정 목록을 바꾸지 않는다',async()=>{
 let done!:()=>void;mockDismiss.mockImplementation(()=>new Promise<void>(resolve=>{done=resolve}));const view=renderHook(()=>useNotifications());await waitFor(()=>expect(view.result.current.unreadCount).toBe(2));
 let request!:Promise<boolean>;act(()=>{request=view.result.current.dismiss('n1')});mockUser={id:'other'};view.rerender({});await waitFor(()=>expect(view.result.current.notifications).toHaveLength(2));
 await act(async()=>{done();await request});expect(view.result.current.notifications).toHaveLength(2);
});
it('같은 알림의 중복 삭제와 미리보기 삭제를 차단한다',async()=>{
 let done!:()=>void;mockDismiss.mockImplementation(()=>new Promise<void>(resolve=>{done=resolve}));const view=renderHook(()=>useNotifications());await waitFor(()=>expect(view.result.current.unreadCount).toBe(2));
 let request!:Promise<boolean>;act(()=>{request=view.result.current.dismiss('n1')});await act(async()=>{await view.result.current.dismiss('n1')});expect(mockDismiss).toHaveBeenCalledTimes(1);await act(async()=>{done();await request});
 mockPreview='regular';view.rerender({});await waitFor(()=>expect(view.result.current.notifications).toHaveLength(2));await act(async()=>{await view.result.current.dismiss('n2')});expect(mockDismiss).toHaveBeenCalledTimes(1);
});
