jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('../../lib/components/EvidencePanel', () => ({ EvidencePanel: () => null }));
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import PurchaseDetail from '../../app/purchases/[id]';
const mockHeader = jest.fn(), mockItems = jest.fn(), mockSave = jest.fn(), mockAmounts = jest.fn(), mockDelete = jest.fn();
let mockId = 'p';
let mockMode = 'self';
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: () => ({ id: mockId }) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 's', name: 'QA 매장' }, devPreviewMode: mockMode, user: { id: 'u' } }) }));
jest.mock('../../lib/services/purchases', () => ({
  getPurchaseById: (...a: unknown[]) => mockHeader(...a), getPurchaseItems: (...a: unknown[]) => mockItems(...a),
  updatePurchaseItems: (...a: unknown[]) => mockSave(...a), updatePurchaseAmounts: (...a: unknown[]) => mockAmounts(...a),
  deletePurchase: (...a: unknown[]) => mockDelete(...a),
}));
jest.mock('../../lib/services/purchaseCategories', () => ({ purchaseCategoryTaxonomy: { getCategories: async () => ['식자재', '소모품'] } }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
const purchase = { id: 'p', store_id: 's', edit_version: 1, supplier: 'QA 거래처', category: '식자재', type: '수기', date: '2026-11-20', amount: 100, hasAmountLines: false };
const item = { id: 'i', purchase_id: 'p', name: '우유', quantity: 1, unit: '개', unit_price: 100, subtotal: 100, category: '식자재', ingredient_id: null };
let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); mockId = 'p'; mockMode = 'self';
  mockHeader.mockReset().mockResolvedValue(purchase); mockItems.mockReset().mockResolvedValue([item]);
  mockSave.mockReset().mockResolvedValue(undefined); mockAmounts.mockReset().mockResolvedValue({ refreshFailed: false }); mockDelete.mockReset().mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
function pressAlert(title: string, button: string) {
  const call = [...alertSpy.mock.calls].reverse().find(([t]) => t === title);
  expect(call).toBeTruthy();
  const action = (call![2] as { text: string; onPress?: () => void }[]).find(b => b.text === button);
  act(() => { action!.onPress?.(); });
}
async function editQuantity(value: string) {
  fireEvent.press(await screen.findByLabelText(/^우유 수량 /));
  fireEvent.changeText(screen.getByLabelText('우유 수량'), value);
}
const saveChanges = () => act(async () => { fireEvent.press(screen.getByText('변경 저장')); });

it('첫 조회 실패 후 같은 화면에서 읽기만 재시도해 상세를 복원한다', async () => {
  mockHeader.mockRejectedValueOnce(new Error('offline')); render(<PurchaseDetail />);
  await waitFor(() => expect(screen.getByText('다시 시도')).toBeTruthy()); fireEvent.press(screen.getByText('다시 시도'));
  await waitFor(() => expect(screen.getByText('QA 거래처')).toBeTruthy()); expect(screen.queryByText('다시 시도')).toBeNull(); expect(mockSave).not.toHaveBeenCalled();
});

it('바꾸기 전에는 저장 버튼이 없고, 바꾸면 [취소 | 변경 저장]과 처음 금액 대비 차이를 보여준다', async () => {
  render(<PurchaseDetail />);
  expect(await screen.findByText('11월 20일 (금) 매입 · 수기')).toBeTruthy();
  expect(screen.queryByText('변경 저장')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('우유 금액'), '130');
  expect(screen.getByText('처음 100원에서 +30원')).toBeTruthy();
  expect(screen.getByLabelText('합계 130원')).toBeTruthy();
  fireEvent.press(screen.getByText('취소'));
  expect(screen.queryByText('변경 저장')).toBeNull();
  expect(screen.queryByText(/처음 100원에서/)).toBeNull();
});

it('수량만 고치면 금액은 그대로 두고 단가만 다시 계산해 저장한다', async () => {
  mockItems.mockResolvedValue([{ ...item, quantity: 3, unit_price: 10000 / 3, subtotal: 10000 }]);
  mockHeader.mockResolvedValue({ ...purchase, amount: 10000 });
  render(<PurchaseDetail />);
  await editQuantity('2');
  expect(screen.getByText('단가 5,000원')).toBeTruthy();
  await saveChanges();
  expect(mockSave).toHaveBeenCalledWith('p', [{ itemId: 'i', quantity: 2, amount: null }], 1);
  await waitFor(() => expect(screen.getByText('변경한 내용을 저장했어요.')).toBeTruthy());
  expect(router.back).not.toHaveBeenCalled();
});

it('저장 후 다시 불러오기에 실패하면 저장했다고 알리고 다시 불러오기만 한다', async () => {
  render(<PurchaseDetail />);
  await editQuantity('2');
  mockHeader.mockRejectedValueOnce(new Error('offline'));
  await saveChanges();
  await waitFor(() => expect(screen.getByText('최신 내용을 불러오지 못했어요.')).toBeTruthy());
  expect(mockSave).toHaveBeenCalledTimes(1);
  mockItems.mockResolvedValueOnce([{ ...item, quantity: 2, unit_price: 50 }]);
  await act(async () => { fireEvent.press(screen.getByText('다시 불러오기')); });
  await waitFor(() => expect(screen.queryByText('최신 내용을 불러오지 못했어요.')).toBeNull());
  expect(screen.getByLabelText('우유 수량 2개')).toBeTruthy();
  expect(mockSave).toHaveBeenCalledTimes(1);
});

it('저장 실패는 고친 값을 그대로 두고 [다시 저장]으로 다시 보낸다', async () => {
  mockSave.mockRejectedValueOnce(new Error('rejected'));
  render(<PurchaseDetail />);
  await editQuantity('2');
  await saveChanges();
  expect(alertSpy).toHaveBeenCalledWith('저장하지 못했어요', '고친 내용은 그대로 있어요. 다시 저장해 주세요.', expect.any(Array));
  expect(screen.getByLabelText('우유 수량 2개')).toBeTruthy();
  await act(async () => { pressAlert('저장하지 못했어요', '다시 저장'); });
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
});

it('다른 내역의 늦은 조회는 현재 상세를 덮지 않는다', async () => {
  let resolve!: (v: unknown) => void; mockHeader.mockReturnValueOnce(new Promise(done => { resolve = done; })); const view = render(<PurchaseDetail />);
  mockId = 'new'; mockHeader.mockResolvedValueOnce({ ...purchase, id: 'new', supplier: '새 거래처' }); view.rerender(<PurchaseDetail />);
  await waitFor(() => expect(screen.getByText('새 거래처')).toBeTruthy()); await act(async () => { resolve(purchase); }); expect(screen.queryByText('QA 거래처')).toBeNull();
});

it('미리보기에서 품목 수량을 바꿔도 실제 매입을 수정하지 않는다', async () => {
  mockMode = 'regular'; render(<PurchaseDetail />);
  await editQuantity('2');
  await saveChanges();
  expect(mockSave).not.toHaveBeenCalled();
});

it('금액별 매입은 카테고리별 금액을 바로 고쳐 같은 매입에 저장한다', async () => {
  const receipt = { ...purchase, hasAmountLines: true, category_amounts: { 식자재: 100 } };
  mockHeader.mockResolvedValue(receipt); mockItems.mockResolvedValue([]);
  render(<PurchaseDetail />);
  fireEvent.changeText(await screen.findByLabelText('식자재 금액'), '');
  fireEvent.changeText(await screen.findByLabelText('소모품 금액'), '299');
  await saveChanges();
  expect(mockAmounts).toHaveBeenCalledWith(receipt, [{ category: '식자재', amount: 0 }, { category: '소모품', amount: 299 }]);
  expect(mockSave).not.toHaveBeenCalled();
});

it('금액별 상세는 등록 화면과 같은 카테고리 순서로 보여주고 옛 카테고리는 뒤에 둔다', async () => {
  mockHeader.mockResolvedValue({ ...purchase, hasAmountLines: true, category_amounts: { 옛분류: 10, 소모품: 200, 식자재: 100 } });
  mockItems.mockResolvedValue([]);
  render(<PurchaseDetail />);
  await screen.findByLabelText('옛분류 금액');
  const order = screen.UNSAFE_queryAllByType(TextInput).map(input => input.props.accessibilityLabel);
  expect(order).toEqual(['식자재 금액', '소모품 금액', '옛분류 금액']);
});

it('금액만 있는 옛 기록은 고칠 칸을 보여주지 않는다', async () => {
  mockItems.mockResolvedValue([]);
  render(<PurchaseDetail />);
  await screen.findByText('금액만 입력된 매입이에요');
  expect(screen.UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
});

it('먼저 고쳐졌으면 손대지 않은 칸은 최신값으로 바꾸고 고친 칸은 지금 저장된 금액과 함께 남긴다', async () => {
  const first = { ...purchase, hasAmountLines: true, category_amounts: { 식자재: 100, 소모품: 200 } };
  const latest = { ...first, edit_version: 2, category_amounts: { 식자재: 150, 소모품: 210 } };
  mockHeader.mockResolvedValueOnce(first).mockResolvedValue(latest);
  mockItems.mockResolvedValue([]);
  mockAmounts.mockRejectedValueOnce(new Error('PURCHASE_CHANGED'));
  render(<PurchaseDetail />);
  fireEvent.changeText(await screen.findByLabelText('소모품 금액'), '220');
  await saveChanges();
  expect(alertSpy).toHaveBeenCalledWith('다른 곳에서 먼저 고쳤어요', expect.any(String), [{ text: '확인' }]);
  await waitFor(() => expect(screen.getByLabelText('식자재 금액').props.value).toBe('150'));
  expect(screen.getByLabelText('소모품 금액').props.value).toBe('220');
  expect(screen.getByText('210')).toBeTruthy();
  await saveChanges();
  expect(mockAmounts).toHaveBeenLastCalledWith(latest, [{ category: '식자재', amount: 150 }, { category: '소모품', amount: 220 }]);
});

it('품목 충돌 뒤 고친 수량은 남기고 다른 사람이 바꾼 금액과 버전을 따른다', async () => {
  mockHeader.mockResolvedValueOnce(purchase).mockResolvedValue({ ...purchase, edit_version: 2, amount: 120 });
  mockItems.mockResolvedValueOnce([item]).mockResolvedValue([{ ...item, subtotal: 120 }]);
  mockSave.mockRejectedValueOnce(new Error('PURCHASE_CHANGED'));
  render(<PurchaseDetail />);
  await editQuantity('2');
  await saveChanges();
  await waitFor(() => expect(screen.getByLabelText('우유 금액').props.value).toBe('120'));
  expect(screen.getByLabelText('우유 수량 2개')).toBeTruthy();
  expect(screen.getByText(/지금 저장된 금액/)).toBeTruthy();
  await saveChanges();
  expect(mockSave).toHaveBeenLastCalledWith('p', [{ itemId: 'i', quantity: 2, amount: null }], 2);
});

it('매입일·거래처를 누르면 고칠 수 없다고 알려준다', async () => {
  render(<PurchaseDetail />);
  fireEvent.press(await screen.findByLabelText('거래처 QA 거래처, 고칠 수 없어요'));
  expect(screen.getByText('매입일·거래처는 고칠 수 없어요. ⋯ 에서 삭제한 뒤 다시 등록해 주세요.')).toBeTruthy();
});

it('⋯ 에서 확인을 거쳐 매입을 삭제하고 목록으로 돌아간다', async () => {
  render(<PurchaseDetail />);
  fireEvent.press(await screen.findByLabelText('더보기'));
  fireEvent.press(screen.getByText('매입 삭제'));
  expect(alertSpy).toHaveBeenCalledWith('이 매입을 삭제할까요?', '증빙 사진도 함께 지워지고 되돌릴 수 없어요. 재고에 반영한 수량도 빠져요.', expect.any(Array));
  expect(mockDelete).not.toHaveBeenCalled();
  await act(async () => { pressAlert('이 매입을 삭제할까요?', '삭제'); });
  expect(mockDelete).toHaveBeenCalledWith('p');
  expect(screen.getByText('매입을 삭제했어요. 목록으로 돌아가요.')).toBeTruthy();
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), { timeout: 2000 });
});

it('미리보기에서는 매입을 삭제하지 않는다', async () => {
  mockMode = 'regular';
  render(<PurchaseDetail />);
  fireEvent.press(await screen.findByLabelText('더보기'));
  fireEvent.press(screen.getByText('매입 삭제'));
  await act(async () => { pressAlert('이 매입을 삭제할까요?', '삭제'); });
  expect(mockDelete).not.toHaveBeenCalled();
  expect(alertSpy).toHaveBeenCalledWith('삭제하지 못했어요', expect.any(String));
});
