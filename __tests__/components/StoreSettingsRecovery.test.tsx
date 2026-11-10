import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import StoreInfoScreen from '../../app/settings/store';
import SalesSettingsScreen from '../../app/settings/sales';
const mockSave = jest.fn(), mockRefresh = jest.fn(), mockUpdate = jest.fn();
let mockStore = { id: 's', name: '매장', address: '', owner_id: 'owner', closing_time: '23:00' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, user: { id: 'owner' }, currentRole: 'admin', refreshStore: mockRefresh }) }));
jest.mock('../../lib/services/stores', () => ({ updateStoreInfo: (...args: unknown[]) => mockSave(...args), deleteEmptyOwnedStore: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ update: (...args: unknown[]) => { mockUpdate(...args); return { eq: mockSave }; } }) } }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() } }));
jest.mock('../../lib/components/ui/SheetModal', () => ({ SheetModal: ({ visible, children }: any) => visible ? children : null }));
jest.mock('../../lib/components/ui', () => {
  const { Text, TextInput, Pressable } = require('react-native');
  return { AppBar: () => null, Field: ({ label, ...props }: any) => <TextInput accessibilityLabel={label} {...props} />, Button: ({ label, onPress, disabled, loading }: any) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!(disabled || loading) }} disabled={disabled || loading} onPress={onPress}><Text>{label}</Text></Pressable> };
});
beforeEach(() => { jest.clearAllMocks(); mockStore = { id: 's', name: '매장', address: '', owner_id: 'owner', closing_time: '23:00' }; mockSave.mockReset().mockResolvedValue({ error: null }); mockRefresh.mockReset().mockResolvedValue(undefined); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
function editClosingTime() { fireEvent.press(screen.getByText('오후')); fireEvent.press(screen.getByText('오전')); }
it('매장 정보 저장 후 조회만 실패하면 저장 완료 안내와 읽기 전용 재시도를 제공한다', async () => {
  mockRefresh.mockRejectedValueOnce(new Error('offline')); render(<StoreInfoScreen />);
  fireEvent.changeText(screen.getByLabelText('매장명'), '변경'); await act(async () => { fireEvent.press(screen.getByText('저장하기')); });
  await waitFor(() => expect(screen.getByText('저장된 정보 다시 불러오기')).toBeTruthy());
  expect(Alert.alert).toHaveBeenCalledWith('저장 완료 · 새로고침 필요', expect.any(String));
  fireEvent.press(screen.getByText('저장하기')); expect(mockSave).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByRole('button', { name: '저장된 정보 다시 불러오기', disabled: false })).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '저장된 정보 다시 불러오기', disabled: false })); });
  await waitFor(() => expect(screen.queryByText('저장된 정보 다시 불러오기')).toBeNull());
  expect(mockSave).toHaveBeenCalledTimes(1); expect(mockRefresh).toHaveBeenCalledTimes(2);
});
it('마감 시각 저장 후 조회 실패도 쓰기를 반복하지 않고 읽기만 재시도한다', async () => {
  mockRefresh.mockRejectedValueOnce(new Error('offline')); render(<SalesSettingsScreen />); editClosingTime();
  fireEvent.press(screen.getByText('저장'));
  await waitFor(() => expect(screen.getByText('저장된 정보 다시 불러오기')).toBeTruthy());
  expect(mockUpdate).toHaveBeenCalledWith({ closing_time: '11:00' });
  fireEvent.press(screen.getByText('저장')); expect(mockSave).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('저장된 정보 다시 불러오기'));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(2)); expect(mockSave).toHaveBeenCalledTimes(1);
});
it('쓰기 실패는 저장 실패로 표시하고 재조회를 실행하지 않는다', async () => {
  mockSave.mockRejectedValueOnce(new Error('write failed')); render(<StoreInfoScreen />);
  fireEvent.press(screen.getByText('저장하기'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('저장 실패', expect.any(String)));
  expect(mockRefresh).not.toHaveBeenCalled(); expect(screen.queryByText('저장된 정보 다시 불러오기')).toBeNull();
});
it('이전 매장 쓰기 응답이 새 매장에 저장 완료 메시지를 띄우지 않는다', async () => {
  let resolve!: (v: unknown) => void; mockSave.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const { rerender } = render(<StoreInfoScreen />); fireEvent.press(screen.getByText('저장하기'));
  mockStore = { ...mockStore, id: 'other', name: '다른 매장' }; rerender(<StoreInfoScreen />);
  await act(async () => { resolve(undefined); });
  expect(Alert.alert).not.toHaveBeenCalled(); expect(mockRefresh).not.toHaveBeenCalled();
});
it('매장 정보 읽기 재시도 연속 실패 뒤 성공해도 쓰기를 반복하지 않는다', async () => {
 mockRefresh.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('still offline')).mockResolvedValueOnce(undefined);
 const view=render(<StoreInfoScreen/>);fireEvent.changeText(screen.getByLabelText('매장명'),'저장된 이름');fireEvent.press(screen.getByText('저장하기'));
 await waitFor(()=>expect(screen.getByRole('button',{name:'저장된 정보 다시 불러오기',disabled:false})).toBeTruthy());
 await act(async()=>{fireEvent.press(screen.getByText('저장된 정보 다시 불러오기'));});
 await waitFor(()=>expect(screen.getByRole('button',{name:'저장된 정보 다시 불러오기',disabled:false})).toBeTruthy());expect(mockSave).toHaveBeenCalledTimes(1);
 mockStore={...mockStore,name:'저장된 이름'}; await act(async()=>{fireEvent.press(screen.getByText('저장된 정보 다시 불러오기'));});view.rerender(<StoreInfoScreen/>);
 await waitFor(()=>expect(screen.queryByText('저장된 정보 다시 불러오기')).toBeNull());expect(screen.getByLabelText('매장명').props.value).toBe('저장된 이름');expect(mockSave).toHaveBeenCalledTimes(1);
});
it('마감 시각 재조회 성공 뒤 저장된 시각을 표시하고 변경 없음 상태로 돌아간다', async () => {
 mockRefresh.mockRejectedValueOnce(new Error('offline'));const view=render(<SalesSettingsScreen/>);editClosingTime();fireEvent.press(screen.getByText('저장'));
 await waitFor(()=>expect(screen.getByText('저장된 정보 다시 불러오기')).toBeTruthy());
 mockRefresh.mockImplementationOnce(async()=>{mockStore={...mockStore,closing_time:'12:00'};});
 await act(async()=>{fireEvent.press(screen.getByText('저장된 정보 다시 불러오기'));});view.rerender(<SalesSettingsScreen/>);
 await waitFor(()=>expect(screen.queryByText('저장된 정보 다시 불러오기')).toBeNull());
 expect(screen.getAllByText('12시').length).toBeGreaterThan(0);expect(mockSave).toHaveBeenCalledTimes(1);
});
it('동일 객체를 유지하는 새로고침 성공 뒤 백그라운드 갱신이 새 초안을 지우지 않는다', async () => {
 const view=render(<StoreInfoScreen/>);await act(async()=>{fireEvent.press(screen.getByText('저장하기'));});
 await waitFor(()=>expect(screen.getByRole('button',{name:'저장하기',disabled:false})).toBeTruthy());
 fireEvent.changeText(screen.getByLabelText('매장명'),'아직 저장하지 않은 초안');
 mockStore={...mockStore,address:'백그라운드에서 갱신된 주소'};view.rerender(<StoreInfoScreen/>);
 expect(screen.getByLabelText('매장명').props.value).toBe('아직 저장하지 않은 초안');
});
