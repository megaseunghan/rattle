import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { EvidenceReuploadRequired } from '../../lib/utils/evidenceError';
import { EvidencePanel } from '../../lib/components/EvidencePanel';
const mockList = jest.fn(), mockReserve = jest.fn(), mockUpload = jest.fn(), mockPick = jest.fn(), mockSign = jest.fn(), mockCleanup = jest.fn(), mockDiscard = jest.fn();
const mockCacheDelete = jest.fn();
let mockUser = 'user';
let mockMode = 'self';
let mockAccess = true;
let mockRole = 'owner';
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUser }, store: { id: 'store' }, permissionsReady: true, storeRole: mockRole, canManageStore: ['owner','manager'].includes(mockRole), canReadFinancials: mockAccess, devPreviewMode: mockMode }) }));
jest.mock('../../lib/services/evidence', () => ({ listEvidence: (...a: unknown[]) => mockList(...a), reserveEvidence: (...a: unknown[]) => mockReserve(...a), signEvidence: (...a: unknown[]) => mockSign(...a), discardEvidence: (...a: unknown[]) => mockDiscard(...a), discardPendingEvidence: (...a: unknown[]) => mockCleanup(...a) }));
jest.mock('../../lib/media/evidenceUpload', () => ({ uploadEvidence: (...a: unknown[]) => mockUpload(...a) }));
jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri:'file:///photo.jpg', mimeType:'image/jpeg', fileSize:100 }] }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'selection-id' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { cache: {uri:'file:///cache'} }, File: jest.fn().mockImplementation(() => ({ delete: mockCacheDelete, open: () => ({ readBytes: () => new Uint8Array(), close: jest.fn() }) })) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const target = { kind: 'expense' as const, storeId: 'store', id: 'expense' };
const readyFile = { id:'file',store_id:'store',name:'receipt.jpg',mime_type:'image/jpeg',status:'ready',created_by:'user' };
beforeEach(() => { jest.clearAllMocks(); mockUser='user';mockMode='self';mockAccess=true;mockRole='owner';mockList.mockResolvedValue([]);mockReserve.mockResolvedValue({id:'selection-id',status:'pending'});mockUpload.mockResolvedValue(undefined);mockSign.mockResolvedValue('https://example.test/signed');mockPick.mockResolvedValue({canceled:false,assets:[{uri:'file:///test.jpg',name:'test.jpg',mimeType:'image/jpeg',size:100}]}); });
test('normal self mode renders; collapsed area does no metadata or image requests', async () => {
 render(<EvidencePanel target={target} />);
 expect(screen.getByText('증빙 자료 열기')).toBeTruthy(); expect(mockList).not.toHaveBeenCalled();expect(mockSign).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('증빙 자료 열기'));
 await waitFor(()=>expect(mockList).toHaveBeenCalledWith(target));
});
test('thumbnail signed only after expansion; full image signed only after tap', async () => {
 mockList.mockResolvedValue([readyFile]);render(<EvidencePanel target={target} />);
 fireEvent.press(screen.getByText('증빙 자료 열기'));
 await waitFor(()=>expect(mockSign).toHaveBeenCalledWith(readyFile,true));
 expect(mockSign).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByLabelText('receipt.jpg 열기'));
 await waitFor(()=>expect(mockSign).toHaveBeenCalledWith(readyFile));
});
test('failed file retries the same reservation ID without a business write', async () => {
 mockUpload.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
 render(<EvidencePanel target={target} initiallyExpanded />);
 await waitFor(()=>expect(screen.getByText('파일 선택').parent?.props.accessibilityState?.disabled).not.toBe(true));
 await act(async()=>{ fireEvent.press(screen.getByText('파일 선택')); });
 await waitFor(()=>expect(screen.getByText('이 파일 다시 업로드')).toBeTruthy());
 await act(async()=>{fireEvent.press(screen.getByText('이 파일 다시 업로드'));});
 await waitFor(()=>expect(mockReserve).toHaveBeenCalledTimes(2));
 expect(mockReserve.mock.calls[0][1].id).toBe(mockReserve.mock.calls[1][1].id);
});
test('switching user while picker is open discards old selection before reservation', async () => {
 let resolve!: (value: unknown)=>void;mockPick.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const view=render(<EvidencePanel target={target} initiallyExpanded />);
 await waitFor(()=>expect(screen.getByText('파일 선택')).toBeTruthy());
 await act(async()=>{ fireEvent.press(screen.getByText('파일 선택')); });
 await act(async()=>{mockUser='other';view.rerender(<EvidencePanel target={target} initiallyExpanded />);});
 await act(async()=>{resolve({canceled:false,assets:[{uri:'file:///x.jpg',name:'x.jpg',mimeType:'image/jpeg',size:100}]});});
 expect(mockReserve).not.toHaveBeenCalled();
});
test('no financial access and simulated employee mode do not fetch evidence',()=>{
 mockAccess=false;const view=render(<EvidencePanel target={target} initiallyExpanded />);expect(mockList).not.toHaveBeenCalled();
 mockAccess=true;mockMode='regular';view.rerender(<EvidencePanel target={target} initiallyExpanded />);expect(mockList).not.toHaveBeenCalled();
});

test('reopening a cached signed URL does not extend its original expiry',async()=>{
 let now=1000;const clock=jest.spyOn(Date,'now').mockImplementation(()=>now);
 try {
  mockList.mockResolvedValue([readyFile]);render(<EvidencePanel target={target} initiallyExpanded />);
  await waitFor(()=>expect(mockSign).toHaveBeenCalledTimes(1));
  await act(async()=>{fireEvent.press(screen.getByLabelText('receipt.jpg 열기'));});
  await waitFor(()=>expect(mockSign).toHaveBeenCalledTimes(2));
  fireEvent(screen.getByTestId('evidence-photo'),'accessibilityEscape');now+=120000;
  await act(async()=>{fireEvent.press(screen.getByLabelText('receipt.jpg 열기'));});
  expect(mockSign).toHaveBeenCalledTimes(2);
  fireEvent(screen.getByTestId('evidence-photo'),'accessibilityEscape');now+=130000;
  await act(async()=>{fireEvent.press(screen.getByLabelText('receipt.jpg 열기'));});
  expect(mockSign).toHaveBeenCalledTimes(3);
 } finally {clock.mockRestore();}
});

test.each([
 [{message:'EVIDENCE_LIMIT'},'증빙은 최대 10개예요.'],
 [{message:'EVIDENCE_NO_OCCURRENCE'},'이 월에는 발생하는 고정비가 없어요.'],
 [{code:'42501'},'증빙을 변경할 권한이 없어요.'],
])('terminal reservation error explains recovery without futile retry',async(error,message)=>{
 const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try {
  mockReserve.mockRejectedValueOnce(error);render(<EvidencePanel target={target} initiallyExpanded />);
  await waitFor(()=>expect(screen.getByText('파일 선택')).toBeTruthy());
  await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
  await waitFor(()=>expect(screen.getByText(new RegExp(message))).toBeTruthy());
  expect(screen.queryByText('이 파일 다시 업로드')).toBeNull();expect(mockUpload).not.toHaveBeenCalled();expect(warn).toHaveBeenCalled();
 }finally{warn.mockRestore();}
});

test.each([
 ['image/heic', 12 * 1024 * 1024, true],
 ['image/heic', 25 * 1024 * 1024, true],
 ['image/jpeg', 25 * 1024 * 1024 + 1, false],
 ['application/pdf', 10 * 1024 * 1024, true],
 ['application/pdf', 12 * 1024 * 1024, false],
 ['', 12 * 1024 * 1024, false],
])('selection applies source limit for %s / %i bytes', async (mimeType, size, accepted) => {
 mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///source', name: 'source', mimeType, size }] });
 render(<EvidencePanel target={target} initiallyExpanded />);
 await waitFor(()=>expect(screen.getByText('파일 선택').parent?.props.accessibilityState?.disabled).not.toBe(true));
 await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 expect(mockReserve).toHaveBeenCalledTimes(accepted ? 1 : 0);
});

test.each([['image/jpeg', true], ['application/pdf', false]])('reselection preserves source cap for %s', async (mime_type, accepted) => {
 mockList.mockResolvedValue([{ ...readyFile, status: 'pending', mime_type }]);
 mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/reselected', name: mime_type === 'application/pdf' ? 'source.pdf' : 'source.jpg', size: 12 * 1024 * 1024 }] });
 render(<EvidencePanel target={target} initiallyExpanded />);
 await waitFor(()=>expect(screen.getByText('업로드 미완료 · 파일 다시 선택')).toBeTruthy());
 fireEvent.press(screen.getByText('업로드 미완료 · 파일 다시 선택'));
 await act(async()=>{fireEvent.press(screen.getByLabelText('기존 첨부 파일 선택'));});
 expect(mockCacheDelete).toHaveBeenCalledTimes(1);
 expect(mockReserve).toHaveBeenCalledTimes(accepted ? 1 : 0);
});

test('계정 교체 후 도착한 재선택 사본을 바로 정리한다', async () => {
 mockList.mockResolvedValue([{ ...readyFile, status: 'pending' }]);
 let finish!: (result: unknown) => void;
 mockPick.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 const view = render(<EvidencePanel target={target} initiallyExpanded />);
 const reselect = await screen.findByText('업로드 미완료 · 파일 다시 선택');
 fireEvent.press(reselect);
 fireEvent.press(screen.getByLabelText('기존 첨부 파일 선택'));
 mockUser = 'other';
 view.rerender(<EvidencePanel target={target} initiallyExpanded />);
 await act(async () => finish({canceled:false,assets:[{uri:'file:///cache/late',name:'late.jpg',size:10}]}));
 expect(mockCacheDelete).toHaveBeenCalledTimes(1);
 expect(mockReserve).not.toHaveBeenCalled();
});

test('generic MIME PDF extension is normalized before reservation', async () => {
 mockPick.mockResolvedValue({ canceled:false, assets:[{ uri:'file:///receipt',name:'receipt.PDF',mimeType:'application/octet-stream',size:100 }] });
 render(<EvidencePanel target={target} initiallyExpanded />);
 await waitFor(()=>expect(screen.getByText('파일 선택').parent?.props.accessibilityState?.disabled).not.toBe(true));
 await act(async()=>{fireEvent.press(screen.getByText('파일 선택'));});
 expect(mockReserve).toHaveBeenCalledWith(target,expect.objectContaining({mimeType:'application/pdf'}));
});
test('bulk cleanup confirms, refreshes target and skips completed evidence', async () => {
 const pending={...readyFile,id:'pending',status:'pending',created_by:'another'};
 mockList.mockResolvedValue([readyFile,pending]);mockCleanup.mockResolvedValue(undefined);
 const alert=jest.spyOn(Alert,'alert');
 try {
  render(<EvidencePanel target={target} initiallyExpanded />);
  await waitFor(()=>expect(screen.getByText('미완료 첨부 일괄 삭제')).toBeTruthy());
  fireEvent.press(screen.getByText('미완료 첨부 일괄 삭제'));
  expect(mockCleanup).not.toHaveBeenCalled();
  const buttons=alert.mock.calls.at(-1)?.[2];
  await act(async()=>{buttons?.find(b=>b.text==='정리')?.onPress?.();});
  await waitFor(()=>expect(mockCleanup).toHaveBeenCalledWith(pending));
  expect(mockCleanup).toHaveBeenCalledTimes(1);expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(3);
 }finally{alert.mockRestore();}
});
test('partial cleanup failure keeps recovery message and refreshes remaining rows', async () => {
 mockList.mockResolvedValue([{...readyFile,status:'discarding'}]);mockCleanup.mockRejectedValueOnce(Error('offline'));
 const alert=jest.spyOn(Alert,'alert');
 try {
  render(<EvidencePanel target={target} initiallyExpanded />);
  await waitFor(()=>expect(screen.getByText('미완료 첨부 일괄 삭제')).toBeTruthy());
  fireEvent.press(screen.getByText('미완료 첨부 일괄 삭제'));
  await act(async()=>{alert.mock.calls.at(-1)?.[2]?.find(b=>b.text==='정리')?.onPress?.();});
  await waitFor(()=>expect(screen.getByText(/일부 미완료 첨부를 정리하지 못했어요/)).toBeTruthy());
  expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(3);
 }finally{alert.mockRestore();}
});

test('member bulk cleanup only includes own pending attachments', async () => {
 mockRole='employee';
 const own={...readyFile,id:'own',status:'pending'};
 const other={...readyFile,id:'other',status:'pending',created_by:'other'};
 mockList.mockResolvedValue([own,other]);mockCleanup.mockResolvedValue(undefined);
 const alert=jest.spyOn(Alert,'alert');
 try {
  render(<EvidencePanel target={{kind:'purchase',storeId:'store',id:'purchase'}} initiallyExpanded />);
  await waitFor(()=>expect(screen.getByText('미완료 첨부 일괄 삭제')).toBeTruthy());
  fireEvent.press(screen.getByText('미완료 첨부 일괄 삭제'));
  await act(async()=>{alert.mock.calls.at(-1)?.[2]?.find(b=>b.text==='정리')?.onPress?.();});
  await waitFor(()=>expect(mockCleanup).toHaveBeenCalledWith(own));
  expect(mockCleanup).toHaveBeenCalledTimes(1);
 }finally{alert.mockRestore();}
});

const stagedImage = {id:'staged-a',uri:'file:///cache/a.jpg',name:'staged-a.jpg',mimeType:'image/jpeg',size:100};
test('initial staged files reuse sequential queue and queued cancellation skips reservation',async()=>{
 let finish!:()=>void;mockUpload.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 render(<EvidencePanel target={target} initiallyExpanded initialSelections={[stagedImage,{...stagedImage,id:'staged-b',name:'staged-b.jpg'}]} />);
 await waitFor(()=>expect(mockUpload).toHaveBeenCalledTimes(1));
 expect(screen.getByLabelText('staged-a.jpg 미리보기')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('staged-b.jpg 업로드 취소'));
 await act(async()=>{finish();});
 expect(mockReserve).toHaveBeenCalledTimes(1);expect(screen.queryByLabelText('staged-b.jpg 미리보기')).toBeNull();
});
test('cancel during final finish removes ready proof instead of silently keeping it',async()=>{
 let finish!:()=>void;mockUpload.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));mockDiscard.mockResolvedValue(undefined);
 render(<EvidencePanel target={target} initiallyExpanded initialSelections={[stagedImage]} />);
 await waitFor(()=>expect(mockUpload).toHaveBeenCalledTimes(1));
 fireEvent.press(screen.getByLabelText('staged-a.jpg 업로드 취소'));
 await act(async()=>{finish();});
 await waitFor(()=>expect(mockDiscard).toHaveBeenCalledWith(expect.objectContaining({status:'ready'})));
 expect(screen.queryByLabelText('staged-a.jpg 미리보기')).toBeNull();
});
test('active cancellation during native upload cleans reserved pending proof',async()=>{
 let stop!:()=>void;mockCleanup.mockResolvedValue(undefined);
 mockUpload.mockImplementationOnce((_selection,_row,isCurrent)=>new Promise<void>((_resolve,reject)=>{stop=()=>{expect(isCurrent()).toBe(false);reject(Error('EVIDENCE_SCOPE_CHANGED'));};}));
 render(<EvidencePanel target={target} initiallyExpanded initialSelections={[stagedImage]} />);
 await waitFor(()=>expect(mockUpload).toHaveBeenCalledTimes(1));
 fireEvent.press(screen.getByLabelText('staged-a.jpg 업로드 취소'));
 await act(async()=>{stop();});
 await waitFor(()=>expect(mockCleanup).toHaveBeenCalled());
 expect(screen.queryByLabelText('staged-a.jpg 미리보기')).toBeNull();
});

test('cancel recovers when finish committed but response was lost',async()=>{
 let finish!:()=>void;
 mockUpload.mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{finish=()=>reject(Error('response lost'));}));
 mockCleanup.mockRejectedValueOnce({message:'EVIDENCE_ALREADY_READY'});mockDiscard.mockResolvedValue(undefined);
 render(<EvidencePanel target={target} initiallyExpanded initialSelections={[stagedImage]} />);
 await waitFor(()=>expect(mockUpload).toHaveBeenCalledTimes(1));
 fireEvent.press(screen.getByLabelText('staged-a.jpg 업로드 취소'));
 await act(async()=>{finish();});
 await waitFor(()=>expect(mockDiscard).toHaveBeenCalledWith(expect.objectContaining({status:'ready'})));
 expect(screen.queryByLabelText('staged-a.jpg 미리보기')).toBeNull();
});

it.each([
  ['owner', true, true], ['manager', true, true],
  ['employee', true, true], ['part_timer', true, false],
  ['employee', false, false], ['part_timer', false, false],
] as const)('매입 증빙 권한 %s / 열람 %s', async (role, shared, writable) => {
  mockRole = role;
  mockAccess = shared;
  render(<EvidencePanel initiallyExpanded target={{ ...target, kind: 'purchase' }} />);
  if (shared) await waitFor(() => expect(mockList).toHaveBeenCalled());
  else expect(mockList).not.toHaveBeenCalled();
  expect(Boolean(screen.queryByText('파일 선택'))).toBe(writable);
});

test('예전 썸네일은 원본 열기를 제공하고 재첨부는 새 예약으로 진행한다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    mockList.mockResolvedValue([readyFile]);
    mockSign.mockRejectedValue(new EvidenceReuploadRequired());
    render(<EvidencePanel target={target} initiallyExpanded />);
    fireEvent.press(await screen.findByLabelText('receipt.jpg 원본 열기'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('원본을 다시 첨부해주세요', expect.any(String), expect.any(Array)));
    await act(async () => { alert.mock.calls[0][2]?.find(b => b.text === '원본 선택')?.onPress?.(); });
    await waitFor(() => expect(mockReserve).toHaveBeenCalled());
    expect(mockReserve.mock.calls[0][1].id).not.toBe(readyFile.id);
    expect(mockDiscard).not.toHaveBeenCalled();
  } finally { alert.mockRestore(); }
});

test('읽기 전용 PDF의 재첨부는 관리자에게 안내한다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    mockRole = 'employee';
    mockList.mockResolvedValue([{ ...readyFile, name: 'receipt.pdf', mime_type: 'application/pdf' }]);
    mockSign.mockRejectedValueOnce(new EvidenceReuploadRequired());
    render(<EvidencePanel target={target} initiallyExpanded />);
    fireEvent.press(await screen.findByLabelText('receipt.pdf 열기'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('원본을 다시 첨부해주세요', expect.stringContaining('매장 관리자')));
    expect(mockPick).not.toHaveBeenCalled();
  } finally { alert.mockRestore(); }
});
