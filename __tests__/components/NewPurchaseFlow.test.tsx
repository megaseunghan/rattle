import type { ReactNode } from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import NewPurchaseScreen from '../../app/purchases/new';
import { PurchaseWriteError } from '../../lib/services/purchases';
const mockQuickCreate = jest.fn();
const mockRecognize = jest.fn();
jest.mock('../../modules/rattle-text-recognition', () => ({ recognizeText: (...args: unknown[]) => mockRecognize(...args) }));
let mockMode='self';
const mockWrite = jest.fn(), mockPick = jest.fn(), mockReserveEvidence = jest.fn(), mockUploadEvidence = jest.fn(), mockCacheDelete = jest.fn();
let mockStoreId = 'store';
jest.mock('expo-image-picker', () => ({
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
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ date: '2026-10-01' }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: mockStoreId, name: '검증 매장' }, currentRole: 'admin', canReadFinancials: true, canManageStore: true, storeRole: 'owner', devPreviewMode: mockMode }) }));
jest.mock('../../lib/hooks/usePurchases', () => ({ usePurchases: () => ({ purchases: [], addWithItems: mockWrite, refetch: jest.fn() }) }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: mockIngredients, create: jest.fn(), refetch: jest.fn(), loading: false }) }));
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
jest.mock('../../lib/services/purchases', () => ({ PurchaseWriteError: class extends Error {
  outcome: 'rejected' | 'unknown';
  constructor(outcome: 'rejected' | 'unknown', original: unknown) { super(String(original)); this.outcome = outcome; }
} }));
beforeEach(() => {
 mockRecognize.mockReset().mockRejectedValue({ code: 'ERR_OCR_UNAVAILABLE' });
 jest.clearAllMocks(); mockMode='self'; mockQuickCreate.mockReset(); mockStoreId = 'store'; mockWrite.mockReset();
 mockPick.mockResolvedValue({ canceled: false, assets: [{uri:'file:///cache/picked.jpg',name:'영수증.jpg',mimeType:'image/jpeg',size:100}] });
 mockReserveEvidence.mockResolvedValue({id:'draft-id',status:'pending',mime_type:'image/jpeg'});
 mockUploadEvidence.mockResolvedValue(undefined);
});
it('기본정보·품목·검토를 나누고 단계 뒤로가도 값을 보존하며 최종 확인에서만 저장한다', async () => {
  mockWrite.mockResolvedValue({ refreshFailed: false });
  const screen = render(<NewPurchaseScreen />);
  fireEvent.press(screen.getByText('품목 입력으로'));
  expect(screen.getByText('거래처명을 입력해주세요.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('거래처명'), '검증 거래처');
  fireEvent.press(screen.getByText('품목 입력으로'));
  fireEvent.press(screen.getByText('+ 추가'));
  fireEvent.press(screen.getByText('쌀'));
  fireEvent.press(screen.getByText('1개 추가'));
  fireEvent.changeText(screen.getByLabelText('쌀 수량'), '2');
  fireEvent.press(screen.getByText('입력 내용 검토'));
  expect(screen.getByText('단가를 입력해주세요. 무상이면 0원을 입력해주세요.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('쌀 단가'), '10000');
  fireEvent.press(screen.getByText('입력 내용 검토'));
  expect(mockWrite).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('기본 정보 수정'));
  expect(screen.getByLabelText('거래처명').props.value).toBe('검증 거래처');
  fireEvent.press(screen.getByText('검토로 돌아가기'));
  expect(screen.getByText('등록할 내용을 확인해주세요')).toBeTruthy();
  fireEvent.press(screen.getByText('품목 수정'));
  expect(screen.getByLabelText('쌀 수량').props.value).toBe('2');
  fireEvent.press(screen.getByText('검토로 돌아가기'));
  await act(async () => { fireEvent.press(screen.getByLabelText('매입 최종 등록')); });
  expect(screen.getByText('매입이 등록됐어요')).toBeTruthy();
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ supplier: '검증 거래처', items: [expect.objectContaining({ quantity: 2, unit_price: 10000 })] }));
});

async function reviewFilledPurchase() {
  const screen = render(<NewPurchaseScreen />);
  fireEvent.changeText(screen.getByLabelText('거래처명'), '검증 거래처');
  fireEvent.press(screen.getByText('품목 입력으로'));
  fireEvent.press(screen.getByText('+ 추가'));
  fireEvent.press(screen.getByText('쌀'));
  fireEvent.press(screen.getByText('1개 추가'));
  fireEvent.changeText(screen.getByLabelText('쌀 수량'), '2');
  fireEvent.changeText(screen.getByLabelText('쌀 단가'), '10000');
  fireEvent.press(screen.getByText('입력 내용 검토'));
  return screen;
}

it('등록 거절 후 입력을 보존하고 최종 검토에서 다시 등록한다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected', 'validation')).mockResolvedValueOnce({ refreshFailed: false });
  const screen = await reviewFilledPurchase();
  fireEvent.press(screen.getByLabelText('매입 최종 등록'));
  await waitFor(() => expect(screen.getByText('다시 등록')).toBeTruthy());
  expect(screen.getByText('쌀 · 2kg × 10,000원 = 20,000원')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('매입 최종 등록'));
  await waitFor(() => expect(screen.getByText('매입이 등록됐어요')).toBeTruthy());
  expect(mockWrite).toHaveBeenCalledTimes(2);
});

it('응답 유실 뒤에는 재등록을 차단하고 등록 내역 확인으로 안내한다', async () => {
  mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown', 'response lost'));
  const screen = await reviewFilledPurchase();
  fireEvent.press(screen.getByLabelText('매입 최종 등록'));
  await waitFor(() => expect(screen.getByText('등록 결과를 확인해주세요')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('매입 최종 등록'));
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(screen.getByText('등록 내역 확인')).toBeTruthy();
});

it('저장 후 재조회 실패는 등록 완료로 구분해 중복 등록하지 않는다', async () => {
  mockWrite.mockResolvedValue({ refreshFailed: true });
  const screen = await reviewFilledPurchase();
  fireEvent.press(screen.getByLabelText('매입 최종 등록'));
  await waitFor(() => expect(screen.getByText('등록은 완료됐어요. 목록에서 합계를 다시 불러와 주세요.')).toBeTruthy());
  expect(screen.queryByLabelText('매입 최종 등록')).toBeNull();
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it('같은 품목 data에서 선택·선택 취소와 추가 후 비활성을 반영한다', () => {
  const screen = render(<NewPurchaseScreen />);
  fireEvent.changeText(screen.getByLabelText('거래처명'), '검증 거래처');
  fireEvent.press(screen.getByText('품목 입력으로'));
  fireEvent.press(screen.getByText('+ 추가'));
  fireEvent.press(screen.getByText('쌀'));
  expect(screen.getByText('1개 추가')).toBeTruthy();
  fireEvent.press(screen.getByText('쌀'));
  expect(screen.queryByText('1개 추가')).toBeNull();
  fireEvent.press(screen.getByText('쌀'));
  fireEvent.press(screen.getByText('1개 추가'));
  fireEvent.press(screen.getByText('+ 추가'));
  fireEvent.press(within(screen.UNSAFE_getByType(FlatList)).getByText('쌀'));
  expect(screen.queryByText('1개 추가')).toBeNull();
});

it('미리보기에서 재고에 없는 품목을 빠르게 등록해도 실제 식자재를 만들지 않는다', async () => {
 mockMode='regular';const view=render(<NewPurchaseScreen/>);
 fireEvent.changeText(view.getByLabelText('거래처명'),'가상 거래처');fireEvent.press(view.getByText('품목 입력으로'));
 fireEvent.press(view.getByText('+ 추가'));fireEvent.press(view.getByText('+ 재고에 없는 품목 바로 추가'));
 fireEvent.changeText(view.getByPlaceholderText('예: 삼겹살'),'가상 품목');fireEvent.press(view.getByText('추가'));
 await waitFor(()=>expect(mockQuickCreate).not.toHaveBeenCalled());
});

async function stageReceipt(screen: ReturnType<typeof render>) {
 await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();
}
it('registration drafts stay local then automatically upload exactly once for saved purchase ID', async()=>{
 mockWrite.mockResolvedValue({purchaseId:'saved-purchase',refreshFailed:false});
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByText('입력 내용 검토'));
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockUploadEvidence).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(mockUploadEvidence).toHaveBeenCalledTimes(1));
 expect(mockReserveEvidence).toHaveBeenCalledWith({kind:'purchase',id:'saved-purchase',storeId:'store'},expect.objectContaining({id:'draft-id'}));
 expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('save rejection preserves staged previews and only retries the business write explicitly',async()=>{
 mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected','bad input'));
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByText('입력 내용 검토'));
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(screen.getByText('다시 등록')).toBeTruthy());
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();expect(mockReserveEvidence).not.toHaveBeenCalled();
});
it('unknown save result keeps drafts without reservation or automatic retry',async()=>{
 mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown','response lost'));
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByText('입력 내용 검토'));
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(screen.getByText('등록 결과를 확인해주세요')).toBeTruthy());
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();expect(mockUploadEvidence).not.toHaveBeenCalled();
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('failed evidence retry never repeats purchase registration',async()=>{
 mockWrite.mockResolvedValue({purchaseId:'saved-purchase',refreshFailed:false});
 mockUploadEvidence.mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByText('입력 내용 검토'));
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(screen.getByText('이 파일 다시 업로드')).toBeTruthy());
 await act(async()=>{fireEvent.press(screen.getByText('이 파일 다시 업로드'));});
 await waitFor(()=>expect(mockUploadEvidence).toHaveBeenCalledTimes(2));expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('store change immediately drops draft and ignores an old in-flight save result',async()=>{
 let resolve!: (value: unknown)=>void;mockWrite.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByText('입력 내용 검토'));
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await act(async()=>{mockStoreId='other';screen.rerender(<NewPurchaseScreen />);});
 expect(screen.queryByLabelText('영수증.jpg 미리보기')).toBeNull();expect(mockCacheDelete).toHaveBeenCalled();
 await act(async()=>{resolve({purchaseId:'old-purchase',refreshFailed:false});});
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockUploadEvidence).not.toHaveBeenCalled();
});
it('leaving removes owned cached drafts and individual removal removes preview',async()=>{
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByText('입력 내용 검토'));
 fireEvent.press(screen.getByLabelText('영수증.jpg 선택 삭제'));
 expect(screen.queryByLabelText('영수증.jpg 미리보기')).toBeNull();expect(mockCacheDelete).toHaveBeenCalledTimes(1);
 await stageReceipt(screen);screen.unmount();expect(mockCacheDelete).toHaveBeenCalledTimes(2);
});

it('keeps a suggested total empty until chosen and gates saving on reconciliation and review', async () => {
  mockRecognize.mockResolvedValue({ lines: [{ text: '금일합계 19,000', confidence: 1, box: { x: .1, y: .2, w: .5, h: .02 } }] });
  const view = await reviewFilledPurchase();
  await stageReceipt(view);
  expect(mockRecognize).toHaveBeenCalledWith('file:///cache/picked.jpg');
  const input = view.getByLabelText('대조할 영수증 합계');
  expect(input.props.value).toBe('');
  fireEvent.press(view.getByText('이 합계 적용'));
  expect(input.props.value).toBe('19000');
  fireEvent.press(view.getByText('입력 내용 검토'));
  fireEvent.press(view.getByLabelText('매입 최종 등록'));
  expect(mockWrite).not.toHaveBeenCalled();
  fireEvent.changeText(input, '20000');
  fireEvent.press(view.getByLabelText('매입 최종 등록'));
  expect(mockWrite).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('영수증과 입력 내용을 확인했어요'));
  mockWrite.mockResolvedValue({ refreshFailed: false });
  fireEvent.press(view.getByLabelText('매입 최종 등록'));
  await waitFor(() => expect(mockWrite).toHaveBeenCalledTimes(1));
});

it('preserves an edited total when recognition finishes later', async () => {
  let finish!: (result: unknown) => void;
  mockRecognize.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<NewPurchaseScreen />);
  await stageReceipt(view);
  const input = view.getByLabelText('대조할 영수증 합계');
  fireEvent.changeText(input, '123');
  await act(async () => finish({ lines: ['공급가액 20,000', '부가세 2,000', '총합계 22,000'].map((text, i) =>
    ({ text, confidence: 1, box: { x: .1, y: .2 + i * .1, w: .5, h: .02 } })) }));
  expect(view.getByText('영수증 합계 123원 · 품목 합계 0원')).toBeTruthy();
  expect(view.getByLabelText('대조할 영수증 합계').props.value).toBe('123');
});

it('prefills an independently checked total and clears it when its photo is removed', async () => {
  mockRecognize.mockResolvedValue({ lines: ['공급가액 20,000', '부가세 2,000', '총합계 22,000'].map((text, i) =>
    ({ text, confidence: 1, box: { x: .1, y: .2 + i * .1, w: .5, h: .02 } })) });
  const view = render(<NewPurchaseScreen />);
  await stageReceipt(view);
  expect(view.getByLabelText('대조할 영수증 합계').props.value).toBe('22000');
  fireEvent.press(view.getByLabelText('영수증.jpg 선택 삭제'));
  expect(view.queryByLabelText('대조할 영수증 합계')).toBeNull();
});

it('requests the payment screen for a photo with no payment total', async () => {
  mockRecognize.mockResolvedValue({ lines: [{ text: '가상 주문 내역', confidence: 1, box: { x: .1, y: .2, w: .5, h: .02 } }] });
  const view = render(<NewPurchaseScreen />);
  await stageReceipt(view);
  expect(view.getByText('결제 화면을 함께 올려주세요.')).toBeTruthy();
  expect(view.getByLabelText('대조할 영수증 합계').props.value).toBe('');
});

it.each([false, true])('requires explicit delivery confirmation for a whole-order amount (checked=%s)', async checked => {
  const cell = (text: string, x: number, y: number) => ({ text, box: { x, y, w: .15, h: .02 }, confidence: .9 });
  mockRecognize.mockResolvedValue({ lines: [
    cell('배송 4건 중 2', .05, .1),
    ...(checked ? [cell('공급가액 90,000', .05, .2), cell('부가세 9,800', .05, .25)] : []),
    cell('총 결제금액', .05, .3), cell('쿠페이 머니', .4, .3), cell('99,800 원', .72, .3),
  ] });
  const view = render(<NewPurchaseScreen />);
  await stageReceipt(view);
  expect(view.getByText(/이번 배송분인지/)).toBeTruthy();
  expect(view.getByText(checked ? '영수증 합계 99,800원' : '확인이 필요해요 · 합계 후보 99,800원')).toBeTruthy();
  const input = view.getByLabelText('대조할 영수증 합계');
  expect(input.props.value).toBe('');
  fireEvent.press(view.getByText('배송분 금액 확인'));
  fireEvent.press(view.getByText('적용 취소'));
  expect(input.props.value).toBe('');
  fireEvent.press(view.getByText('배송분 금액 확인'));
  fireEvent.press(view.getByText('같아요 · 합계 적용'));
  expect(input.props.value).toBe('99800');
});

it('shows malformed thousands grouping guidance without offering the candidate', async () => {
  mockRecognize.mockResolvedValue({ lines: [{ text: '결제금액 3,40,120', confidence: .9, box: { x: .1, y: .3, w: .6, h: .02 } }] });
  const view = render(<NewPurchaseScreen />);
  await stageReceipt(view);
  expect(view.getByText('금액의 천 단위 구분이 불분명해요. 원문을 확인해주세요.')).toBeTruthy();
  expect(view.queryByText('이 합계 적용')).toBeNull();
});

it('stages a PDF without scheduling receipt recognition', async () => {
 mockPick.mockResolvedValue({ canceled: false, assets: [{uri:'file:///cache/test.pdf',name:'test.pdf',mimeType:'application/pdf',size:100}] });
 const view = render(<NewPurchaseScreen />);
 await act(async () => { fireEvent.press(view.getByText('파일 선택')); });
 expect(view.getByLabelText('test.pdf 미리보기')).toBeTruthy();
 expect(mockRecognize).not.toHaveBeenCalled();
 expect(view.queryByLabelText('대조할 영수증 합계')).toBeNull();
});

it('recognizes the original HEIC selected from the album before upload', async () => {
 const view = render(<NewPurchaseScreen />);
 await act(async () => { fireEvent.press(view.getByText('사진 보관함')); });
 expect(mockRecognize).toHaveBeenCalledWith('file:///cache/original.heic');
 expect(mockUploadEvidence).not.toHaveBeenCalled();
 expect(mockPick).not.toHaveBeenCalled();
});

it('사진의 금액만 읽은 행을 바로 보여주고 재고 품목·수량·단가와 최종 확인을 거쳐 저장한다', async () => {
  const row = (values: string[], y: number) => values.map((text, index) =>
    ({ text, confidence: 1, box: { x: index ? .75 : .1, y, w: .15, h: .02 } }));
  mockRecognize.mockResolvedValue({ lines: [...row(['품목명', '금액'], .2), ...row(['가상 백미', '6,000'], .3), ...row(['총합계', '6,000'], .5)] });
  const view = render(<NewPurchaseScreen />);
  await stageReceipt(view);
  expect(view.getByLabelText('가상 백미 금액').props.value).toBe('6000');
  expect(view.getByLabelText('가상 백미 수량').props.value).toBe('');
  fireEvent.press(view.getByLabelText('가상 백미 재고 품목 선택'));
  fireEvent.press(view.getByText('쌀'));
  fireEvent.press(view.getByText('입력 내용 검토'));
  expect(view.getByText('가상 백미의 수량과 단가를 확인해 주세요.')).toBeTruthy();
  fireEvent.changeText(view.getByLabelText('가상 백미 수량'), '2');
  fireEvent.changeText(view.getByLabelText('가상 백미 단가'), '3000');
  fireEvent.changeText(view.getByLabelText('대조할 영수증 합계'), '6000');
  fireEvent.press(view.getByText('입력 내용 검토'));
  fireEvent.changeText(view.getByLabelText('거래처명'), '가상 거래처');
  fireEvent.press(view.getByLabelText('다음 단계'));
  expect(mockWrite).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('영수증과 입력 내용을 확인했어요'));
  mockWrite.mockResolvedValue({ refreshFailed: false });
  await act(async () => fireEvent.press(view.getByLabelText('매입 최종 등록')));
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({
    items: [expect.objectContaining({ ingredient_id: 'rice', quantity: 2, unit_price: 3000 })],
  }));
});

it('읽은 수량과 단가를 채우고 뒤로 갔다 돌아와도 사용자가 수정한 값을 보존한다', async () => {
  const row = (values: string[], y: number) => values.map((text, i) => ({
    text, confidence: 1, box: { x: [.1, .5, .65, .8][i], y, w: .08, h: .02 },
  }));
  mockRecognize.mockResolvedValue({ lines: [
    ...row(['품목명', '수량', '단가', '금액'], .2), ...row(['쌀', '2', '3,000', '6,000'], .3),
  ] });
  const view = render(<NewPurchaseScreen />);
  fireEvent.changeText(view.getByLabelText('거래처명'), '가상 거래처');
  await stageReceipt(view);
  expect(view.getByLabelText('쌀 수량').props.value).toBe('2');
  expect(view.getByLabelText('쌀 단가').props.value).toBe('3000');
  fireEvent.changeText(view.getByLabelText('쌀 수량'), '3');
  fireEvent.press(view.getByLabelText('뒤로'));
  fireEvent.press(view.getByText('품목 입력으로'));
  expect(view.getByLabelText('쌀 수량').props.value).toBe('3');
  fireEvent.press(view.getByText('입력 내용 검토'));
  expect(view.getByText('쌀의 금액과 수량 × 단가가 달라요.')).toBeTruthy();
  expect(mockWrite).not.toHaveBeenCalled();
});
