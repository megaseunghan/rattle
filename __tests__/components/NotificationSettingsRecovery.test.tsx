import { fireEvent, render, screen } from '@testing-library/react-native';
import NotificationSettingsScreen from '../../app/notifications/settings';
const mockRead = jest.fn(), mockToggle = jest.fn();
let mockState: any;
jest.mock('../../lib/hooks/useNotificationSettings', () => ({ useNotificationSettings: () => mockState }));
jest.mock('../../lib/services/notifications', () => ({ NOTIFICATION_SETTING_DEFS: [
 { key: 'low', group: '재고', label: '재고 부족', description: '부족할 때', default: true },
 { key: 'margin', group: '매출·손익', label: '마진 알림', description: '마진 변화', default: false },
] }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/components/ui', () => {
 const { Text } = require('react-native'); return { AppBar: ({ title }: any) => <Text>{title}</Text> };
});
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
beforeEach(() => { jest.clearAllMocks(); mockState = { settings: { low: true, margin: false }, ready: true, loading: false, error: null, savingKey: null, refetch: mockRead, toggle: mockToggle }; });
it('조회 오류 때 기본값 토글을 숨기고 읽기 재시도만 제공한다', () => {
 mockState = { ...mockState, ready: false, error: '조회 실패' }; render(<NotificationSettingsScreen />);
 expect(screen.queryByRole('switch')).toBeNull(); fireEvent.press(screen.getByText('다시 시도'));
 expect(mockRead).toHaveBeenCalledTimes(2); expect(mockToggle).not.toHaveBeenCalled();
});
it('저장 중인 항목을 알리고 모든 토글을 잠근다', () => {
 mockState = { ...mockState, savingKey: 'low' }; render(<NotificationSettingsScreen />);
 expect(screen.getByText('재고 부족 저장 중이에요.')).toBeTruthy();
 expect(screen.getAllByRole('switch', { disabled: true })).toHaveLength(2);
});
it('설정 준비가 안 된 상태에서는 토글을 표시하지 않는다', () => {
 mockState = { ...mockState, ready: false }; render(<NotificationSettingsScreen />);
 expect(screen.queryByRole('switch')).toBeNull(); expect(screen.getByText('로그인과 선택한 매장을 확인해주세요.')).toBeTruthy();
});
it('준비된 설정은 저장된 값으로 표시한다', () => {
 render(<NotificationSettingsScreen />);
 expect(screen.getByRole('switch', { name: '재고 부족' }).props.value).toBe(true);
 expect(screen.getByRole('switch', { name: '마진 알림' }).props.value).toBe(false);
});
