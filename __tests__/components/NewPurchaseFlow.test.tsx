import { FlatList } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import NewPurchaseScreen from '../../app/purchases/new';
import { PurchaseWriteError } from '../../lib/services/purchases';
const mockQuickCreate = jest.fn();
let mockMode='self';
const mockWrite = jest.fn(), mockPick = jest.fn(), mockReserveEvidence = jest.fn(), mockUploadEvidence = jest.fn(), mockCacheDelete = jest.fn();
let mockStoreId = 'store';
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
jest.mock('../../lib/components/CategoryManageModal', () => ({ CategoryManageModal: () => null }));
jest.mock('../../lib/services/purchases', () => ({ PurchaseWriteError: class extends Error {
  outcome: 'rejected' | 'unknown';
  constructor(outcome: 'rejected' | 'unknown', original: unknown) { super(String(original)); this.outcome = outcome; }
} }));
beforeEach(() => {
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
  fireEvent.press(screen.getByLabelText('매입 최종 등록'));
  await waitFor(() => expect(screen.getByText('매입이 등록됐어요')).toBeTruthy());
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
 await act(async()=>{fireEvent.press(screen.getByLabelText('등록 전 증빙 선택'));});
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();
}
it('registration drafts stay local then automatically upload exactly once for saved purchase ID', async()=>{
 mockWrite.mockResolvedValue({purchaseId:'saved-purchase',refreshFailed:false});
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockUploadEvidence).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(mockUploadEvidence).toHaveBeenCalledTimes(1));
 expect(mockReserveEvidence).toHaveBeenCalledWith({kind:'purchase',id:'saved-purchase',storeId:'store'},expect.objectContaining({id:'draft-id'}));
 expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('save rejection preserves staged previews and only retries the business write explicitly',async()=>{
 mockWrite.mockRejectedValueOnce(new PurchaseWriteError('rejected','bad input'));
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(screen.getByText('다시 등록')).toBeTruthy());
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();expect(mockReserveEvidence).not.toHaveBeenCalled();
});
it('unknown save result keeps drafts without reservation or automatic retry',async()=>{
 mockWrite.mockRejectedValueOnce(new PurchaseWriteError('unknown','response lost'));
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(screen.getByText('등록 결과를 확인해주세요')).toBeTruthy());
 expect(screen.getByLabelText('영수증.jpg 미리보기')).toBeTruthy();expect(mockUploadEvidence).not.toHaveBeenCalled();
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('failed evidence retry never repeats purchase registration',async()=>{
 mockWrite.mockResolvedValue({purchaseId:'saved-purchase',refreshFailed:false});
 mockUploadEvidence.mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await waitFor(()=>expect(screen.getByText('이 파일 다시 업로드')).toBeTruthy());
 await act(async()=>{fireEvent.press(screen.getByText('이 파일 다시 업로드'));});
 await waitFor(()=>expect(mockUploadEvidence).toHaveBeenCalledTimes(2));expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('store change immediately drops draft and ignores an old in-flight save result',async()=>{
 let resolve!: (value: unknown)=>void;mockWrite.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('매입 최종 등록'));
 await act(async()=>{mockStoreId='other';screen.rerender(<NewPurchaseScreen />);});
 expect(screen.queryByLabelText('영수증.jpg 미리보기')).toBeNull();expect(mockCacheDelete).toHaveBeenCalled();
 await act(async()=>{resolve({purchaseId:'old-purchase',refreshFailed:false});});
 expect(mockReserveEvidence).not.toHaveBeenCalled();expect(mockUploadEvidence).not.toHaveBeenCalled();
});
it('leaving removes owned cached drafts and individual removal removes preview',async()=>{
 const screen=await reviewFilledPurchase();await stageReceipt(screen);
 fireEvent.press(screen.getByLabelText('영수증.jpg 선택 삭제'));
 expect(screen.queryByLabelText('영수증.jpg 미리보기')).toBeNull();expect(mockCacheDelete).toHaveBeenCalledTimes(1);
 await stageReceipt(screen);screen.unmount();expect(mockCacheDelete).toHaveBeenCalledTimes(2);
});
