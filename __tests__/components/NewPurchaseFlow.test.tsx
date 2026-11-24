import 'react-native-gesture-handler/jestSetup';
import * as Reanimated from 'react-native-reanimated';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
Object.assign(Reanimated, { useEvent: () => undefined, useReducedMotion: () => true });
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, Keyboard, Modal, Text } from 'react-native';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) }));
afterEach(() => jest.restoreAllMocks());
import type { ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import NewPurchaseScreen from '../../app/purchases/new';
import { PurchaseWriteError } from '../../lib/services/purchases';
const mockQuickCreate = jest.fn();
let mockMode = 'self';
let mockRevision = '1';
const mockWrite = jest.fn(), mockReserveEvidence = jest.fn(), mockUploadEvidence = jest.fn(), mockCacheDelete = jest.fn(), mockRefetch = jest.fn(), mockReloadFresh = jest.fn(), mockLibrary = jest.fn(), mockCamera = jest.fn();
let mockStoreId = 'store';
let mockLedger: { id: string; date: string; supplier: string; amount: number }[] = [];
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: (...a: unknown[]) => mockCamera(...a),
  getMediaLibraryPermissionsAsync: async () => ({ status: 'granted', accessPrivileges: 'all' }),
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
  launchImageLibraryAsync: (...a: unknown[]) => mockLibrary(...a),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'draft-id' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: jest.fn().mockImplementation(() => ({ delete: mockCacheDelete, size: 100 })) }));
jest.mock('../../lib/hooks/useStorePermissions', () => ({ useStorePermissions: () => ({ canManageStock: true }) }));
jest.mock('../../lib/services/evidence', () => ({ listEvidence: jest.fn().mockResolvedValue([]), reserveEvidence: (...a: unknown[]) => mockReserveEvidence(...a), signEvidence: jest.fn(), discardEvidence: jest.fn(), discardPendingEvidence: jest.fn() }));
jest.mock('../../lib/media/evidenceUpload', () => ({ uploadEvidence: (...a: unknown[]) => mockUploadEvidence(...a) }));
const mockIngredient = { id: 'rice', name: '쌀', category: '식자재', unit: 'kg', last_price: 0 };
const mockIngredients = [mockIngredient];
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: () => ({ date: '2026-10-01' }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: mockStoreId, name: '검증 매장' }, currentRole: 'admin', canReadFinancials: true, canManageStore: true, storeRole: 'owner', permissionRevision: mockRevision, devPreviewMode: mockMode }) }));
jest.mock('../../lib/hooks/usePurchases', () => ({ usePurchases: () => ({ purchases: mockLedger, addWithItems: mockWrite, refetch: mockRefetch, reloadFresh: mockReloadFresh, loading: false, error: null }) }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: mockIngredients, create: jest.fn(), refetch: jest.fn(), loading: false }) }));
jest.mock('../../lib/hooks/usePurchaseCategories', () => ({ usePurchaseCategories: () => ({ categories: ['식자재', '비품', '소모품'], loading: false }) }));
jest.mock('../../lib/hooks/usePurchaseTypes', () => ({ usePurchaseTypes: () => ({ types: ['수기'], loading: false }) }));
jest.mock('../../lib/hooks/useCategories', () => ({ useCategories: () => ({ categories: ['식자재'] }) }));
jest.mock('../../lib/services/ingredients', () => ({ createIngredient: (...a: unknown[]) => mockQuickCreate(...a) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
// 시트 애니메이션 없이 렌더하고, 닫힐 때 네이티브처럼 onDismiss를 부른다.
jest.mock('../../lib/components/ui/SheetModal', () => ({
  SheetModal: ({ visible, children, onDismiss }: { visible: boolean; children: ReactNode; onDismiss?: () => void }) => {
    const { useEffect: useMockEffect, useRef: useMockRef } = jest.requireActual('react');
    const shown = useMockRef(false);
    useMockEffect(() => { if (visible) shown.current = true; else if (shown.current) { shown.current = false; onDismiss?.(); } }, [visible]);
    return visible ? children : null;
  },
}));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/services/purchases', () => ({ getPurchaseSuppliers: jest.fn().mockResolvedValue(['지난달 거래처']), PurchaseWriteError: class extends Error {
  outcome: 'rejected' | 'unknown';
  constructor(outcome: 'rejected' | 'unknown', original: unknown) { super(String(original)); this.outcome = outcome; }
} }));

const photo = { uri: 'file:///cache/receipt.jpg', fileName: '영수증.jpg', fileSize: 100, mimeType: 'image/jpeg' };
let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(router.canGoBack).mockReturnValue(true); mockMode = 'self'; mockQuickCreate.mockReset(); mockStoreId = 'store'; mockWrite.mockReset(); mockLedger = []; 
  mockLibrary.mockResolvedValue({ canceled: false, assets: [photo] });
  mockCamera.mockResolvedValue({ canceled: true, assets: [] });
  mockReserveEvidence.mockResolvedValue({ id: 'draft-id', status: 'pending', mime_type: 'image/jpeg' });
  mockUploadEvidence.mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert');
});

type View = ReturnType<typeof render>;
/** 마지막으로 뜬 팝업에서 버튼을 누른다. */
function pressAlert(title: string, button: string) {
  const call = [...alertSpy.mock.calls].reverse().find(([t]) => t === title);
  expect(call).toBeTruthy();
  const action = (call![2] as { text: string; onPress?: () => void }[]).find(b => b.text === button);
  expect(action).toBeTruthy();
  act(() => { action!.onPress?.(); });
}
async function pickSupplier(view: View, name: string) {
  fireEvent.press(view.getByLabelText(/^거래처 /));
  const existing = await view.findByText(name).catch(() => null);
  if (existing) { fireEvent.press(existing); return; }
  fireEvent.changeText(view.getByLabelText('거래처 검색'), name);
  fireEvent.press(view.getByText(`+ '${name}' 새 거래처로 추가`));
}
// 실제처럼 금액 칸을 눌러(포커스) 다른 펼침을 닫고 그 자리에서 입력한다.
function setAmount(view: View, label: string, amount: string) {
  const input = view.getByLabelText(`${label} 금액`);
  fireEvent(input, 'focus', { nativeEvent: { target: 1 } });
  fireEvent.changeText(input, amount);
}
function setQuantity(view: View, label: string, quantity: string) {
  fireEvent.press(view.getByLabelText(new RegExp(`^${label} 수량 `)));
  fireEvent.changeText(view.getByLabelText(`${label} 수량`), quantity);
}
async function filledPurchase() {
  const view = render(<NewPurchaseScreen />);
  await pickSupplier(view, '가상 거래처');
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '쌀');
  fireEvent.press(await view.findByText('쌀 · kg'));
  setQuantity(view, '쌀', '2');
  setAmount(view, '쌀', '20000');
  return view;
}
async function stageReceipt(view: View) {
  fireEvent.press(view.getByLabelText('사진 추가'));
  await act(async () => { fireEvent.press(view.getByText('앨범에서 선택')); });
  await waitFor(() => expect(view.getByLabelText('영수증.jpg 미리보기')).toBeTruthy());
}
const save = (view: View) => act(async () => { fireEvent.press(view.getByLabelText('매입 저장')); });
const LEAVE = { timeout: 2000 };

it('매입일·거래처 → 증빙 사진 → 입력 순서로 보여주고 품목을 저장한다', async () => {
  const view = render(<NewPurchaseScreen />);
  const order = ['매입일과 거래처', '증빙 사진', '매입 입력'].map(label => view.getByLabelText(label));
  expect(order).toHaveLength(3);
  expect(view.queryByText('파일 선택')).toBeNull();
  await pickSupplier(view, '지난달 거래처');
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '가상 장갑');
  fireEvent.press(view.getByLabelText('가상 장갑 카테고리 식자재'));
  fireEvent.press(view.getByLabelText('가상 장갑 카테고리 소모품'));
  setAmount(view, '가상 장갑', '1000');
  setQuantity(view, '가상 장갑', '3');
  expect(view.getByText('단가 333원')).toBeTruthy();
  fireEvent.press(view.getByText('+ 품목 추가'));
  fireEvent.changeText(view.getByLabelText('2번째 품목 항목명'), '가상 봉투');
  setAmount(view, '가상 봉투', '250');
  expect(view.getByLabelText('합계 1,250원')).toBeTruthy();
  mockWrite.mockResolvedValue({ purchaseId: 'saved' });
  await save(view);
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-01', supplier: '지난달 거래처', mode: 'items', rows: [
    expect.objectContaining({ category: '소모품', quantity: 3, amount: 1000 }), expect.objectContaining({ category: '식자재', quantity: 1, amount: 250 })] }));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
});

it('빠진 칸은 저장하지 않고 그 칸 아래에 알려준다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '양파');
  await save(view);
  expect(mockWrite).not.toHaveBeenCalled();
  expect(view.getByText('거래처를 골라 주세요.')).toBeTruthy();
  expect(view.getByText('금액을 입력해 주세요.')).toBeTruthy();
});

it('단위는 격자에서 고르고 수량을 바꿔도 금액은 그대로다', async () => {
  const view = render(<NewPurchaseScreen />);
  await pickSupplier(view, '가상 거래처');
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '휴지');
  setAmount(view, '휴지', '9900');
  setQuantity(view, '휴지', '2');
  fireEvent.press(view.getByLabelText('휴지 단위 없음'));
  fireEvent.press(view.getByText('롤'));
  expect(view.getByLabelText('휴지 수량 2롤')).toBeTruthy();
  expect(view.getByLabelText('합계 9,900원')).toBeTruthy();
  mockWrite.mockResolvedValue({ purchaseId: 'saved' });
  await save(view);
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ name: '휴지', quantity: 2, unit: '롤', amount: 9900 })] }));
});

it('재고 품목은 단위를 바꿀 수 없다', async () => {
  const view = await filledPurchase();
  fireEvent.press(view.getByLabelText(/^쌀 수량 /));
  expect(view.getByLabelText('쌀 단위 kg, 재고 품목이라 고정').props.accessibilityState).toMatchObject({ disabled: true });
});

it('저장 실패는 입력을 그대로 두고 [다시 저장]으로만 다시 보낸다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected', 'validation')).mockResolvedValueOnce({ refreshFailed: false });
  const view = await filledPurchase();
  await save(view);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText('합계 20,000원')).toBeTruthy();
  await act(async () => { pressAlert('저장하지 못했어요', '다시 저장'); });
  await waitFor(() => expect(mockWrite).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
});

it('저장 결과를 모르면 잠그고 내역을 확인한 뒤 없었으면 다시 저장한다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown', 'response lost')).mockResolvedValueOnce({ purchaseId: 'saved' });
  mockLedger = [{ id: 'p1', date: '2026-10-01', supplier: '다른 거래처', amount: 5000 }];
  const view = await filledPurchase();
  await save(view);
  pressAlert('저장됐는지 확인이 필요해요', '닫기');
  expect(view.getByText('저장됐는지 먼저 확인해 주세요.')).toBeTruthy();
  await save(view);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByText('내역 확인'));
  expect(mockReloadFresh).toHaveBeenCalled();
  expect(view.getByText('다른 거래처')).toBeTruthy();
  const back = view.getAllByLabelText('뒤로');
  fireEvent.press(back[back.length - 1]);
  act(() => { view.UNSAFE_getByType(Modal).props.onDismiss?.(); });
  const ask = alertSpy.mock.calls.find(([title]) => title === '방금 매입이 목록에 있었나요?');
  expect(ask?.[1]).toBe('10월 1일 (목) · 가상 거래처 · 20,000원');
  pressAlert('방금 매입이 목록에 있었나요?', '없었어요');
  expect(view.queryByText('저장됐는지 먼저 확인해 주세요.')).toBeNull();
  await act(async () => { fireEvent.press(view.getByLabelText('매입 다시 저장')); });
  expect(mockWrite).toHaveBeenCalledTimes(2);
});

it('확인해 보니 이미 있었으면 다시 저장하지 않고 목록으로 돌아간다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown', 'response lost'));
  const view = await filledPurchase();
  await save(view);
  pressAlert('저장됐는지 확인이 필요해요', '내역 확인');
  const back = view.getAllByLabelText('뒤로');
  fireEvent.press(back[back.length - 1]);
  act(() => { view.UNSAFE_getByType(Modal).props.onDismiss?.(); });
  pressAlert('방금 매입이 목록에 있었나요?', '있었어요');
  expect(view.getByText('이미 저장된 매입이에요. 목록으로 돌아가요.')).toBeTruthy();
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('저장 후 목록 갱신 실패도 저장 완료로 보고 다시 보내지 않는다', async () => {
  mockWrite.mockResolvedValue({ refreshFailed: true });
  const view = await filledPurchase();
  await save(view);
  expect(view.getByText('매입을 저장했어요.')).toBeTruthy();
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('금액별은 입력한 분류만 저장하고 품목별 초안은 전환 중 보존한다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '쌀');
  fireEvent.press(view.getByText('금액별'));
  await pickSupplier(view, '가상 상점');
  fireEvent.changeText(view.getByLabelText('식자재 금액'), '0');
  await save(view);
  expect(mockWrite).not.toHaveBeenCalled();
  expect(view.getByText('카테고리에 금액을 입력해 주세요.')).toBeTruthy();
  fireEvent.changeText(view.getByLabelText('비품 금액'), '1,200');
  fireEvent.press(view.getByText('품목별'));
  expect(view.getByLabelText('쌀 항목명').props.value).toBe('쌀');
  fireEvent.press(view.getByText('금액별'));
  expect(view.getByLabelText('비품 금액').props.value).toBe('1,200');
  mockWrite.mockResolvedValue({ purchaseId: 'saved' });
  await save(view);
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ mode: 'amounts', rows: [{ category: '비품', amount: 1200 }] }));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('purchase-entry-mode:user', 'amounts');
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
  expect(router.replace).not.toHaveBeenCalled();
});

it('직접 들어온 경우 저장 뒤 해당 월의 매입 탭을 연다', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(false);
  mockWrite.mockResolvedValue({ purchaseId: 'saved', refreshFailed: false });
  const view = await filledPurchase();
  await save(view);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith({
    pathname: '/(tabs)', params: { targetTab: 'purchases', month: '2026-10', homeScope: 'store' },
  }), LEAVE);
  expect(router.back).not.toHaveBeenCalled();
});

it('저장은 실제 스택을 한 단계만 닫고 이전 화면의 선택을 보존한다', async () => {
  const actual = jest.requireActual<typeof import('expo-router')>('expo-router');
  jest.mocked(router.back).mockImplementationOnce(actual.router.back);
  jest.mocked(router.canGoBack).mockImplementationOnce(actual.router.canGoBack);
  mockWrite.mockResolvedValue({ purchaseId: 'saved', refreshFailed: false });
  function Origin() {
    const [selectedDay, selectDay] = useState(1);
    return <>
      <Text onPress={() => selectDay(9)}>선택일 {selectedDay}</Text>
      <Text onPress={() => actual.router.push('/purchases/new')}>등록 열기</Text>
    </>;
  }
  const view = renderRouter({ _layout: () => <actual.Stack screenOptions={{ animation: 'none', headerShown: false }} />, index: Origin, 'purchases/new': NewPurchaseScreen });
  fireEvent.press(view.getByText('선택일 1'));
  fireEvent.press(view.getByText('등록 열기'));
  await pickSupplier(view as unknown as View, '가상 거래처');
  fireEvent.press(view.getByText('금액별'));
  fireEvent.changeText(view.getByLabelText('식자재 금액'), '3700');
  await act(async () => fireEvent.press(view.getByLabelText('매입 저장')));
  expect(await view.findByText('선택일 9', {}, LEAVE)).toBeTruthy();
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

it('증빙이 있으면 매입을 한 번 저장하고 사진을 다 올린 뒤 돌아간다', async () => {
  let finish!: () => void;
  mockUploadEvidence.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  mockWrite.mockResolvedValue({ purchaseId: 'saved-purchase', refreshFailed: false });
  const view = await filledPurchase(); await stageReceipt(view);
  expect(view.getByText('1')).toBeTruthy();
  expect(mockReserveEvidence).not.toHaveBeenCalled();
  await save(view);
  await waitFor(() => expect(mockUploadEvidence).toHaveBeenCalledTimes(1));
  expect(view.getByText('사진 올리는 중 1/1')).toBeTruthy();
  expect(mockReserveEvidence).toHaveBeenCalledWith({ kind: 'purchase', id: 'saved-purchase', storeId: 'store' }, expect.objectContaining({ id: 'draft-id' }));
  expect(router.back).not.toHaveBeenCalled();
  await act(async () => finish());
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('저장 실패 뒤에도 고른 사진은 남고 업로드하지 않는다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected', 'bad input'));
  const view = await filledPurchase(); await stageReceipt(view);
  await save(view);
  expect(view.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();
  expect(mockReserveEvidence).not.toHaveBeenCalled();
});

it('결과를 모를 때는 사진을 올리지 않고 자동으로 다시 저장하지 않는다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown', 'response lost'));
  const view = await filledPurchase(); await stageReceipt(view);
  await save(view);
  expect(view.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();
  expect(mockUploadEvidence).not.toHaveBeenCalled();
  expect(mockReserveEvidence).not.toHaveBeenCalled();
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('사진만 못 올리면 [다시 올리기]로 사진만 다시 올린다', async () => {
  mockWrite.mockResolvedValue({ purchaseId: 'saved-purchase', refreshFailed: false });
  mockUploadEvidence.mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
  const view = await filledPurchase(); await stageReceipt(view);
  await save(view);
  await waitFor(() => expect(alertSpy.mock.calls.some(([title]) => title === '매입은 저장했어요')).toBe(true));
  expect(alertSpy.mock.calls.find(([title]) => title === '매입은 저장했어요')?.[1]).toBe('사진 1장을 올리지 못했어요. 지금 나가면 이 사진은 다시 골라야 해요.');
  expect(router.back).not.toHaveBeenCalled();
  await act(async () => { pressAlert('매입은 저장했어요', '다시 올리기'); });
  await waitFor(() => expect(mockUploadEvidence).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('사진 목록을 못 불러와 업로드를 시작하지 못해도 잠기지 않고 [다시 올리기]를 묻는다', async () => {
  const evidence = jest.requireMock('../../lib/services/evidence') as { listEvidence: jest.Mock };
  evidence.listEvidence.mockRejectedValueOnce(Error('offline'));
  mockWrite.mockResolvedValue({ purchaseId: 'saved-purchase', refreshFailed: false });
  const view = await filledPurchase(); await stageReceipt(view);
  await save(view);
  await waitFor(() => expect(alertSpy.mock.calls.some(([title]) => title === '매입은 저장했어요')).toBe(true));
  expect(mockUploadEvidence).not.toHaveBeenCalled();
  await act(async () => { pressAlert('매입은 저장했어요', '다시 올리기'); });
  await waitFor(() => expect(mockUploadEvidence).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), LEAVE);
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('매장을 바꾸면 초안을 바로 비우고 늦게 온 저장 결과로 사진을 올리지 않는다', async () => {
  let resolve!: (value: unknown) => void; mockWrite.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = await filledPurchase(); await stageReceipt(view);
  fireEvent.press(view.getByLabelText('매입 저장'));
  await act(async () => { mockStoreId = 'other'; view.rerender(<NewPurchaseScreen />); });
  expect(view.queryByLabelText('영수증.jpg 미리보기')).toBeNull(); expect(mockCacheDelete).toHaveBeenCalled();
  await act(async () => { resolve({ purchaseId: 'old-purchase', refreshFailed: false }); });
  expect(mockReserveEvidence).not.toHaveBeenCalled(); expect(mockUploadEvidence).not.toHaveBeenCalled();
});

it('사진을 빼거나 화면을 떠나면 기기 임시 사본을 지운다', async () => {
  const view = await filledPurchase(); await stageReceipt(view);
  fireEvent.press(view.getByLabelText('영수증.jpg 빼기'));
  expect(view.queryByLabelText('영수증.jpg 미리보기')).toBeNull(); expect(mockCacheDelete).toHaveBeenCalledTimes(1);
  await stageReceipt(view); view.unmount(); expect(mockCacheDelete).toHaveBeenCalledTimes(2);
});

it('검색 결과가 없으면 그 이름으로 새 재고 품목 등록을 연다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '가상 현미');
  fireEvent.press(await view.findByText("+ '가상 현미' 새 품목으로 추가"));
  expect(view.getByPlaceholderText('예: 삼겹살').props.value).toBe('가상 현미');
  expect(mockWrite).not.toHaveBeenCalled();
});

it('품목은 왼쪽으로 끝까지 밀면 빠지고, 되돌리기로 다시 살린다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '가상 양파');
  setAmount(view, '가상 양파', '3000');
  expect(view.queryByText('이 품목 빼기')).toBeNull();
  act(() => fireGestureHandler(getByGestureTestId('purchase-row-swipe-initial'), [
    { state: State.BEGAN, x: 300, y: 20 }, { state: State.ACTIVE, translationX: -300, x: 0, y: 20 }, { state: State.END, translationX: -300, velocityX: 0, x: 0, y: 20 },
  ]));
  expect(view.queryByLabelText('가상 양파 금액')).toBeNull();
  expect(view.getByLabelText('합계 0원')).toBeTruthy();
  fireEvent.press(view.getByText('되돌리기'));
  expect(view.getByLabelText('가상 양파 금액').props.value).toBe('3,000');
  expect(view.getByLabelText('합계 3,000원')).toBeTruthy();
});

it('조금만 밀면 빼기 버튼이 열리고, 눌러야 빠진다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '가상 대파');
  act(() => fireGestureHandler(getByGestureTestId('purchase-row-swipe-initial'), [
    { state: State.BEGAN, x: 300, y: 20 }, { state: State.ACTIVE, translationX: -90, x: 210, y: 20 }, { state: State.END, translationX: -90, velocityX: 0, x: 210, y: 20 },
  ]));
  expect(view.getByLabelText('가상 대파 금액')).toBeTruthy();
  fireEvent.press(view.getByLabelText('가상 대파 빼기'));
  expect(view.queryByLabelText('가상 대파 금액')).toBeNull();
  expect(view.getByText("'가상 대파' 품목을 뺐어요")).toBeTruthy();
});

it('이름 없는 빈 줄을 빼면 빈 품목이라고 알려준다', () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.press(view.getByLabelText('1번째 품목 빼기'));
  expect(view.getByText('빈 품목을 뺐어요')).toBeTruthy();
});

it('키보드가 올라오면 하단 바는 홈 막대 여백을 두지 않는다', () => {
  type KeyboardListener = (event?: { endCoordinates: { height: number } }) => void;
  const listeners: Record<string, KeyboardListener> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: KeyboardListener) => {
    listeners[event] = listener;
    return { remove: jest.fn() };
  }) as never);
  const view = render(<NewPurchaseScreen />);
  // 하단 바(SafeAreaView)의 아래쪽 안전영역 여백 사용 여부
  const bottomInset = () => view.getByLabelText('합계 0원').parent?.parent?.props.edges?.bottom;
  expect(bottomInset()).toBe('additive');
  act(() => listeners.keyboardWillShow({ endCoordinates: { height: 336 } }));
  expect(bottomInset()).toBe('off');
  act(() => listeners.keyboardWillHide());
  expect(bottomInset()).toBe('additive');
  // 떠 있는 키보드·하드웨어 키보드 도구막대는 화면 아래를 가리지 않으므로 여백을 유지한다
  act(() => listeners.keyboardWillShow({ endCoordinates: { height: 0 } }));
  expect(bottomInset()).toBe('additive');
});

it('행에서 고른 단위로 새 재고 품목 등록 시트를 연다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('1번째 품목 항목명'), '가상 휴지');
  setQuantity(view, '가상 휴지', '2');
  fireEvent.press(view.getByLabelText('가상 휴지 단위 없음'));
  fireEvent.press(view.getByText('롤'));
  fireEvent.press(await view.findByText("+ '가상 휴지' 새 품목으로 추가"));
  expect(view.getByRole('radio', { name: '롤', checked: true })).toBeTruthy();
});

it('촬영을 취소하면 입력 화면에 머물고 증빙이나 매입을 만들지 않는다', async () => {
  const view = render(<NewPurchaseScreen />);
  fireEvent.press(view.getByLabelText('사진 추가'));
  await act(async () => { fireEvent.press(view.getByText('카메라 촬영')); });
  await waitFor(() => expect(mockCamera).toHaveBeenCalled());
  expect(view.getByText('품목별')).toBeTruthy();
  expect(view.getByLabelText('매입 저장')).toBeTruthy();
  expect(mockUploadEvidence).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
});

it('같은 매장의 권한 버전 갱신은 매입 초안을 보존하고 매장 전환은 비운다', async () => {
  const view = await filledPurchase();
  mockRevision = '2';
  view.rerender(<NewPurchaseScreen />);
  expect(view.getByLabelText('거래처 가상 거래처')).toBeTruthy();
  expect(view.getByLabelText('합계 20,000원')).toBeTruthy();
  mockStoreId = 'other';
  view.rerender(<NewPurchaseScreen />);
  expect(view.getByLabelText('거래처 골라 주세요')).toBeTruthy();
});

