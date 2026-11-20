import * as purchaseFlag from '../../lib/ocr/purchaseOcrFlag';
afterEach(() => jest.restoreAllMocks());
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PurchaseDetailScreen from '../../app/purchases/[id]';

const mockPreventRemove = jest.fn();
const mockDispatch = jest.fn();
const mockBack = () => {
  const [guarded, intercept] = mockPreventRemove.mock.calls.at(-1)!;
  const action = { type: 'GO_BACK' };
  if (guarded) intercept({ data: { action } });
  else mockDispatch(action);
};
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch }), usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args) }));
const mockSave = jest.fn();
const mockRecognize = jest.fn();
const mockUpload = jest.fn();
jest.mock('../../modules/rattle-text-recognition', () => ({ recognizeText: (...args: unknown[]) => mockRecognize(...args) }));
jest.mock('expo-router', () => ({ router: { back: () => mockBack() }, useLocalSearchParams: () => ({ id: 'purchase' }) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: 'store' },
  permissionsReady: true, storeRole: 'owner', canManageStore: true, canReadFinancials: true, devPreviewMode: 'self' }) }));
jest.mock('../../lib/services/purchases', () => ({
  getPurchaseById: async () => ({ id: 'purchase', store_id: 'store', edit_version: 1, amount: 4000 }),
  getPurchaseItems: async () => [{ id: 'row', name: '가상 사과', quantity: 1, unit: '망', unit_price: 4000, subtotal: 4000 }],
  updatePurchaseItem: (...args: unknown[]) => mockSave(...args),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [
  { uri: 'file:///cache/receipt.jpg', name: 'receipt.jpg', mimeType: 'image/jpeg', size: 100 },
] }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'attachment' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: jest.fn(() => ({ delete: jest.fn() })) }));
jest.mock('../../lib/services/evidence', () => ({ listEvidence: async () => [], reserveEvidence: async () =>
  ({ id: 'attachment', status: 'pending', mime_type: 'image/jpeg' }) }));
jest.mock('../../lib/media/evidenceUpload', () => ({ uploadEvidence: (...args: unknown[]) => mockUpload(...args) }));

test('editing applies only a chosen item, uploads after save and keeps manual corrections', async () => {
  jest.replaceProperty(purchaseFlag, 'PURCHASE_OCR_ENABLED', true as false);
  const row = (cells: string[], y: number) => cells.map((text, index) => ({
    text, confidence: .9, box: { x: [.1, .5, .65, .8][index], y, w: [.2, .06, .08, .1][index], h: .02 },
  }));
  mockRecognize.mockResolvedValue({ lines: [
    ...row(['품목명', '수량', '단가', '금액'], .2), ...row(['가상 사과', '2', '3,000', '6,000'], .3),
    ...row(['총합계', '6,000'], .5),
  ] });
  const view = render(<PurchaseDetailScreen />);
  fireEvent.press(await view.findByLabelText(/가상 사과.*수정/));
  await act(async () => fireEvent.press(view.getByText('파일 선택')));
  expect(view.getByLabelText('매입 품목 금액').props.value).toBe('4000');
  fireEvent.press(view.getByText('가상 사과에 적용 (망)'));
  expect(view.getByLabelText('매입 품목 금액').props.value).toBe('6000');
  fireEvent.changeText(view.getByLabelText('매입 품목 수량'), '3');
  expect(mockUpload).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('품목 수정 저장'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith('row', 3, 6000, 1));
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
});

test('OCR off: 증빙 사진을 인식 없이 보관하고 저장·업로드가 끝날 때까지 입력을 지킨다', async () => {
  mockRecognize.mockClear();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let finishSave!: () => void, finishUpload!: () => void;
  mockSave.mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }));
  mockUpload.mockImplementationOnce(() => new Promise<void>(resolve => { finishUpload = resolve; }));
  mockRecognize.mockResolvedValue({ lines: [] });
  const view = render(<PurchaseDetailScreen />);
  fireEvent.press(await view.findByLabelText(/가상 사과.*수정/));
  await act(async () => fireEvent.press(view.getByText('파일 선택')));
  expect(view.queryByText(/준비 중|OCR|자동 입력|인식|휴대폰에서 읽고|다시 읽기|합계 후보/)).toBeNull();
  expect(view.queryByLabelText(/준비 중|OCR|자동 입력|인식/)).toBeNull();
  expect(view.getByLabelText('매입 품목 금액').props.value).toBe('4000');
  expect(mockRecognize).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('취소'));
  expect(alert).toHaveBeenLastCalledWith('이대로 나갈까요?', expect.stringContaining('선택한 사진'), expect.any(Array));
  expect(view.getByLabelText('receipt.jpg 미리보기')).toBeTruthy();
  fireEvent.press(view.getByLabelText('품목 수정 저장'));
  mockBack();
  expect(alert).toHaveBeenLastCalledWith('처리 중이에요', expect.any(String));
  await act(async () => finishSave());
  await waitFor(() => expect(finishUpload).toBeDefined());
  fireEvent.press(view.getByLabelText('뒤로'));
  expect(alert).toHaveBeenLastCalledWith('이대로 나갈까요?', expect.stringContaining('다시 올릴 수 있어요'), expect.any(Array));
  expect(mockDispatch).not.toHaveBeenCalled();
  await act(async () => finishUpload());
  fireEvent.press(view.getByLabelText('뒤로'));
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  alert.mockRestore();
});
