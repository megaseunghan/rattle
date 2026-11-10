import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import NotificationsScreen from '../../app/notifications';
jest.mock('react-native-gesture-handler', () => ({ Gesture: { Native: () => ({}) }, GestureDetector: ({ children }: any) => children }));
const mockDismiss = jest.fn(), mockRead = jest.fn(), mockAll = jest.fn();
let mockStore = 's', mockState: any;
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, store: { id: mockStore }, currentRole: 'admin', devPreviewMode: 'self' }) }));
jest.mock('../../lib/hooks/useNotifications', () => ({ useNotifications: () => mockState }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('../../lib/components/NotificationSwipeRow', () => ({ NotificationSwipeRow: ({ item, onPress, onDeleteRequest }: any) => {
 const { Pressable, Text } = require('react-native'); return <><Pressable accessibilityLabel={item.message} onPress={onPress}><Text>{item.message}</Text></Pressable><Pressable accessibilityLabel={`${item.id} 삭제 확인`} onPress={onDeleteRequest}><Text>삭제 확인</Text></Pressable></>;
} }));
jest.mock('../../lib/components/ui', () => ({ AppBar: ({ title, rightSlot }: any) => { const { Text } = require('react-native'); return <><Text>{title}</Text>{rightSlot}</>; }, EmptyState: ({ title }: any) => { const { Text } = require('react-native'); return <Text>{title}</Text>; } }));
const items = [{ id: 'n1', category: 'stock', message: '재고 확인', is_read: false, created_at: new Date().toISOString() }, { id: 'n2', category: 'members', message: '참여 신청', is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() }];
beforeEach(() => { jest.clearAllMocks(); mockStore='s'; mockState={ notifications: items, loading: false, error: null, unreadCount: 1, refetch: jest.fn(), markRead: mockRead, markAllRead: mockAll, dismiss: mockDismiss, deletingId: null }; jest.spyOn(Alert,'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
it('날짜별 미니멀 목록은 분류칩 없이 표시하고 기존 읽음을 유지한다', () => {
 render(<NotificationsScreen />);expect(screen.getByText('오늘')).toBeTruthy();expect(screen.getByText('어제')).toBeTruthy();expect(screen.queryByText('전체')).toBeNull();
 fireEvent.press(screen.getByLabelText('재고 확인'));expect(mockRead).toHaveBeenCalledWith('n1');
});
it('삭제는 확인창 없이 내 목록 삭제를 요청하며 읽음 처리를 하지 않는다', async () => {
 render(<NotificationsScreen />);
 await act(async () => { fireEvent.press(screen.getByLabelText('n1 삭제 확인')); });
 expect(mockDismiss).toHaveBeenCalledWith('n1');
 expect(Alert.alert).not.toHaveBeenCalled();
 expect(mockRead).not.toHaveBeenCalled();
});
it('삭제 요청 중에는 추가 삭제를 실행하지 않는다', () => {
 mockState.deletingId='n1';render(<NotificationsScreen />);
 fireEvent.press(screen.getByLabelText('n2 삭제 확인'));
 expect(mockDismiss).not.toHaveBeenCalled();
});
it('응답 대기 중 연속 삭제를 차단한다', async () => {
 let finish!: () => void;
 mockDismiss.mockImplementationOnce(() => new Promise<void>(resolve => { finish=resolve; }));
 render(<NotificationsScreen />);
 fireEvent.press(screen.getByLabelText('n1 삭제 확인'));
 fireEvent.press(screen.getByLabelText('n2 삭제 확인'));
 expect(mockDismiss).toHaveBeenCalledTimes(1);
 await act(async () => { finish(); });
});
