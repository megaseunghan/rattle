import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) }));
afterEach(() => jest.restoreAllMocks());
import type { ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import NewPurchaseScreen from '../../app/purchases/new';
import { PurchaseWriteError } from '../../lib/services/purchases';
const mockQuickCreate = jest.fn();
let mockMode='self';
let mockRevision = '1';
const mockWrite = jest.fn(), mockPick = jest.fn(), mockReserveEvidence = jest.fn(), mockUploadEvidence = jest.fn(), mockCacheDelete = jest.fn();
let mockStoreId = 'store';
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: async () => ({ canceled: true, assets: [] }),
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri:'file:///cache/original.heic', fileName:null, fileSize:100, mimeType:'image/heic' }] }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'draft-id' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: jest.fn().mockImplementation(() => ({ delete: mockCacheDelete })) }));
jest.mock('../../lib/hooks/useStorePermissions', () => ({ useStorePermissions: () => ({ canManageStock: true }) }));
jest.mock('../../lib/services/evidence', () => ({ listEvidence: jest.fn().mockResolvedValue([]), reserveEvidence: (...a: unknown[]) => mockReserveEvidence(...a), signEvidence: jest.fn(), discardEvidence: jest.fn(), discardPendingEvidence: jest.fn() }));
jest.mock('../../lib/media/evidenceUpload', () => ({ uploadEvidence: (...a: unknown[]) => mockUploadEvidence(...a) }));
const mockIngredient = { id: 'rice', name: '쌀', category: '식자재', unit: 'kg', last_price: 0 };
const mockIngredients = [mockIngredient];
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: () => ({ date: '2026-10-01' }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: mockStoreId, name: '검증 매장' }, currentRole: 'admin', canReadFinancials: true, canManageStore: true, storeRole: 'owner', permissionRevision: mockRevision, devPreviewMode: mockMode }) }));
jest.mock('../../lib/hooks/usePurchases', () => ({ usePurchases: () => ({ purchases: [], addWithItems: mockWrite, refetch: jest.fn() }) }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: mockIngredients, create: jest.fn(), refetch: jest.fn(), loading: false }) }));
jest.mock('../../lib/hooks/usePurchaseCategories', () => ({ usePurchaseCategories: () => ({ categories: ['식자재','비품','소모품'], loading: false }) }));
jest.mock('../../lib/hooks/usePurchaseTypes', () => ({ usePurchaseTypes: () => ({ types: ['수기'], loading: false }) }));
jest.mock('../../lib/hooks/useCategories', () => ({ useCategories: () => ({ categories: ['식자재'] }) }));
jest.mock('../../lib/services/ingredients',()=>({createIngredient:(...a:unknown[])=>mockQuickCreate(...a)}));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
// Exercise the picker controls without mounting native sheet animations or parsing icon SVGs.
jest.mock('../../lib/components/ui/SheetModal', () => ({
  SheetModal: ({ visible, children }: { visible: boolean; children: ReactNode }) => visible ? children : null,
}));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/CategoryManageModal', () => ({ CategoryManageModal: () => null }));
jest.mock('../../lib/services/purchases', () => ({ getPurchaseSuppliers: jest.fn().mockResolvedValue(['지난달 거래처']), PurchaseWriteError: class extends Error {
  outcome: 'rejected' | 'unknown';
  constructor(outcome: 'rejected' | 'unknown', original: unknown) { super(String(original)); this.outcome = outcome; }
} }));
beforeEach(() => {
 jest.clearAllMocks(); jest.mocked(router.canGoBack).mockReturnValue(true); mockMode='self'; mockQuickCreate.mockReset(); mockStoreId = 'store'; mockWrite.mockReset();
 mockPick.mockResolvedValue({ canceled: false, assets: [{uri:'file:///cache/picked.jpg',name:'영수증.jpg',mimeType:'image/jpeg',size:100}] });
 mockReserveEvidence.mockResolvedValue({id:'draft-id',status:'pending',mime_type:'image/jpeg'});
 mockUploadEvidence.mockResolvedValue(undefined);
});
function manualForm() {
  const view = render(<NewPurchaseScreen />);
  return view;
}
async function filledPurchase() {
  const view = manualForm();
  fireEvent.changeText(view.getByLabelText('거래처명'), '가상 거래처');
  fireEvent.changeText(view.getByLabelText('1번째 항목명'), '쌀');
  fireEvent.press(await view.findByText('쌀 · kg'));
  fireEvent.changeText(view.getByLabelText('1번째 수량'), '2');
  fireEvent.changeText(view.getByLabelText('1번째 금액'), '20000');
  return view;
}
it('시작 방법을 고르고 한 화면에서 거래처·분류·품목을 저장한다', async () => {
  const view = render(<NewPurchaseScreen />);
  expect(view.getByText('사진 보관함')).toBeTruthy();
  expect(view.getByText('카메라로 찍기')).toBeTruthy();
  fireEvent.press(view.getByText('거래처 목록'));
  fireEvent.press(await view.findByText('지난달 거래처'));
  fireEvent.press(view.getByText('소모품'));
  fireEvent.changeText(view.getByLabelText('1번째 금액'), '1000');
  fireEvent.press(view.getByText('매입 저장'));
  expect(mockWrite).not.toHaveBeenCalled();
  fireEvent.changeText(view.getByLabelText('1번째 항목명'), '가상 장갑');
  fireEvent.changeText(view.getByLabelText('1번째 수량'), '3');
  expect(view.getByText('단가 333원')).toBeTruthy();
  fireEvent.press(view.getByText('품목 추가'));
  fireEvent.changeText(view.getByLabelText('2번째 항목명'), '가상 봉투');
  fireEvent.changeText(view.getByLabelText('2번째 금액'), '250');
  expect(view.getByText('1,250원')).toBeTruthy();
  mockWrite.mockResolvedValue({ purchaseId: 'saved' });
  await act(async () => fireEvent.press(view.getByText('매입 저장')));
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ supplier: '지난달 거래처', mode: 'items', rows: [
    expect.objectContaining({ category: '소모품', quantity: 3, amount: 1000 }), expect.objectContaining({ category: '식자재', quantity: 1, amount: 250 })] }));
});

it('등록 거절 후 같은 폼에서 입력을 보존하고 다시 저장한다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected', 'validation')).mockResolvedValueOnce({ refreshFailed: false });
  const screen = await filledPurchase();
  fireEvent.press(screen.getByLabelText('매입 저장'));
  await waitFor(() => expect(screen.getByText('다시 등록')).toBeTruthy());
  expect(screen.getByLabelText('1번째 금액').props.value).toBe('20000');
  fireEvent.press(screen.getByLabelText('매입 저장'));
  await waitFor(() => expect(screen.getByText('매입이 등록됐어요')).toBeTruthy());
  expect(mockWrite).toHaveBeenCalledTimes(2);
});

it('응답 유실 뒤에는 재등록을 차단하고 등록 내역 확인으로 안내한다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown', 'response lost'));
  const screen = await filledPurchase();
  fireEvent.press(screen.getByLabelText('매입 저장'));
  await waitFor(() => expect(screen.getByText('등록 결과를 확인해주세요')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('매입 저장'));
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(screen.getByText('등록 내역 확인')).toBeTruthy();
});

it('저장 후 재조회 실패는 등록 완료로 구분해 중복 등록하지 않는다', async () => {
  mockWrite.mockResolvedValue({ refreshFailed: true });
  const screen = await filledPurchase();
  fireEvent.press(screen.getByLabelText('매입 저장'));
  await waitFor(() => expect(screen.getByText('등록은 완료됐어요. 목록에서 합계를 다시 불러와 주세요.')).toBeTruthy());
  expect(screen.queryByLabelText('매입 저장')).toBeNull();
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

async function stageReceipt(screen: ReturnType<typeof render>) {
 await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();
}
it('금액별은 입력한 분류만 저장하고 품목별 초안은 전환 중 보존한다', async () => {
  const view = manualForm();
  fireEvent.changeText(view.getByLabelText('1번째 항목명'), '쌀');
  fireEvent.press(view.getByText('금액별'));
  fireEvent.changeText(view.getByLabelText('거래처명'), '가상 상점');
  fireEvent.changeText(view.getByLabelText('식자재 금액'), '0');
  fireEvent.changeText(view.getByLabelText('비품 금액'), '-1');
  fireEvent.press(view.getByText('매입 저장'));
  expect(mockWrite).not.toHaveBeenCalled();
  fireEvent.changeText(view.getByLabelText('비품 금액'), '1200');
  fireEvent.press(view.getByText('품목별'));
  expect(view.getByLabelText('1번째 항목명').props.value).toBe('쌀');
  fireEvent.press(view.getByText('금액별'));
  expect(view.getByText('1,200원')).toBeTruthy();
  mockWrite.mockResolvedValue({ purchaseId: 'saved' });
  await act(async () => fireEvent.press(view.getByText('매입 저장')));
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ mode: 'amounts', rows: [{ category: '비품', amount: 1200 }] }));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('purchase-entry-mode:user', 'amounts');
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});
it.each(['items', 'amounts'])('%s 방식에서 사진은 증빙으로만 보관하고 인식 관련 문구를 표시하지 않는다', async mode => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(mode);
  const view = manualForm();
  expect(await view.findByLabelText(mode === 'amounts' ? '비품 금액' : '1번째 항목명')).toBeTruthy();
  expect(view.queryByText(/준비 중|OCR|자동 입력|인식/)).toBeNull();
  await stageReceipt(view);
  expect(view.queryByText(/준비 중|OCR|자동 입력|인식|휴대폰에서 읽고|다시 읽기|합계 후보/)).toBeNull();
  expect(view.queryByLabelText(/준비 중|OCR|자동 입력|인식/)).toBeNull();
  expect(view.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();
});

it.each([true, false])('품목 저장 후 이전 화면이 있으면 복귀하고 직접 진입이면 해당 월의 매입을 연다 (%s)', async hasHistory => {
  jest.mocked(router.canGoBack).mockReturnValue(hasHistory);
  mockWrite.mockResolvedValue({ purchaseId: 'saved', refreshFailed: false });
  const view = await filledPurchase();
  await act(async () => fireEvent.press(view.getByLabelText('매입 저장')));
  expect(router.back).toHaveBeenCalledTimes(hasHistory ? 1 : 0);
  expect(router.replace).toHaveBeenCalledTimes(hasHistory ? 0 : 1);
  if (!hasHistory) expect(router.replace).toHaveBeenCalledWith({
    pathname: '/(tabs)', params: { targetTab: 'purchases', month: '2026-10', homeScope: 'store' },
  });
});
it.each(['items', 'amounts'] as const)('%s 저장은 실제 스택을 한 단계만 닫고 이전 화면의 선택을 보존한다', async mode => {
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
  expect(view.getByText('선택일 9')).toBeTruthy();
  fireEvent.press(view.getByText('등록 열기'));
  fireEvent.changeText(await view.findByLabelText('거래처명'), '가상 거래처');
  if (mode === 'items') {
    fireEvent.changeText(view.getByLabelText('1번째 항목명'), '쌀');
    fireEvent.changeText(view.getByLabelText('1번째 금액'), '3700');
  } else {
    fireEvent.press(view.getByText('금액별'));
    fireEvent.changeText(view.getByLabelText('식자재 금액'), '3700');
  }
  await act(async () => fireEvent.press(view.getByLabelText('매입 저장')));
  expect(await view.findByText('선택일 9')).toBeTruthy();
  expect(view.queryByLabelText('매입 저장')).toBeNull();
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

it('증빙이 있으면 매입을 한 번 저장하고 업로드가 완료된 뒤 복귀한다', async()=>{
 let finish!: () => void;
 mockUploadEvidence.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
 mockWrite.mockResolvedValue({purchaseId:'saved-purchase',refreshFailed:false});
 const screen=await filledPurchase();await stageReceipt(screen);
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockUploadEvidence).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('매입 저장'));
 await waitFor(()=>expect(mockUploadEvidence).toHaveBeenCalledTimes(1));
 expect(mockReserveEvidence).toHaveBeenCalledWith({kind:'purchase',id:'saved-purchase',storeId:'store'},expect.objectContaining({id:'draft-id'}));
 expect(router.back).not.toHaveBeenCalled();
 await act(async () => finish());
 await waitFor(()=>expect(router.back).toHaveBeenCalledTimes(1));
 expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('save rejection preserves staged previews and only retries the business write explicitly',async()=>{
 mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected','bad input'));
 const screen=await filledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 저장'));
 await waitFor(()=>expect(screen.getByText('다시 등록')).toBeTruthy());
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();expect(mockReserveEvidence).not.toHaveBeenCalled();
});
it('unknown save result keeps drafts without reservation or automatic retry',async()=>{
 mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown','response lost'));
 const screen=await filledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 저장'));
 await waitFor(()=>expect(screen.getByText('등록 결과를 확인해주세요')).toBeTruthy());
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();expect(mockUploadEvidence).not.toHaveBeenCalled();
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('failed evidence retry never repeats purchase registration',async()=>{
 mockWrite.mockResolvedValue({purchaseId:'saved-purchase',refreshFailed:false});
 mockUploadEvidence.mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
 const screen=await filledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 저장'));
 await waitFor(()=>expect(screen.getByText('이 파일 다시 업로드')).toBeTruthy());
 expect(router.back).not.toHaveBeenCalled();
 await act(async()=>{fireEvent.press(screen.getByText('이 파일 다시 업로드'));});
 await waitFor(()=>expect(router.back).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(mockUploadEvidence).toHaveBeenCalledTimes(2));expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('store change immediately drops draft and ignores an old in-flight save result',async()=>{
 let resolve!: (value: unknown)=>void;mockWrite.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const screen=await filledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 저장'));
 await act(async()=>{mockStoreId='other';screen.rerender(<NewPurchaseScreen />);});
 expect(screen.queryByLabelText('영수증.jpg 미리보기')).toBeNull();expect(mockCacheDelete).toHaveBeenCalled();
 await act(async()=>{resolve({purchaseId:'old-purchase',refreshFailed:false});});
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockUploadEvidence).not.toHaveBeenCalled();
});
it('leaving removes owned cached drafts and individual removal removes preview',async()=>{
 const screen=await filledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('영수증.jpg 선택 삭제'));
 expect(screen.queryByLabelText('영수증.jpg 미리보기')).toBeNull();expect(mockCacheDelete).toHaveBeenCalledTimes(1);
 await stageReceipt(screen);screen.unmount();expect(mockCacheDelete).toHaveBeenCalledTimes(2);
});

it('PDF 증빙을 첨부 대기 목록에 보관한다', async () => {
 mockPick.mockResolvedValue({ canceled: false, assets: [{uri:'file:///cache/test.pdf',name:'test.pdf',mimeType:'application/pdf',size:100}] });
 const view = manualForm();
 await act(async () => { fireEvent.press(view.getByText('파일 선택')); });
 expect(view.getByLabelText('test.pdf 미리보기')).toBeTruthy();
 expect(mockUploadEvidence).not.toHaveBeenCalled();
});

it('입력한 항목명으로 검색하고 결과가 없으면 그 이름으로 새 재고 품목 등록을 연다', async () => {
  const view = manualForm();
  fireEvent.changeText(view.getByLabelText('1번째 항목명'), '가상 현미');
  fireEvent.press(await view.findByText('새 품목으로 추가'));
  expect(view.getByPlaceholderText('예: 삼겹살').props.value).toBe('가상 현미');
  expect(mockWrite).not.toHaveBeenCalled();
});

it('촬영을 취소하면 입력 화면에 머물고 증빙이나 매입을 만들지 않는다', async () => {
  const view = render(<NewPurchaseScreen />);
  await act(async () => fireEvent.press(view.getByText('카메라로 찍기')));
  expect(view.getByText('품목별')).toBeTruthy();
  expect(view.getByText('매입 저장')).toBeTruthy();
  expect(mockUploadEvidence).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
});

it('같은 매장의 권한 버전 갱신은 매입 초안을 보존하고 매장 전환은 비운다', async () => {
  const view = await filledPurchase();
  mockRevision = '2';
  view.rerender(<NewPurchaseScreen />);
  expect(view.getByLabelText('거래처명').props.value).toBe('가상 거래처');
  expect(view.getByText('20,000원')).toBeTruthy();
  mockStoreId = 'other';
  view.rerender(<NewPurchaseScreen />);
  expect(view.getByLabelText('거래처명').props.value).toBe('');
});
