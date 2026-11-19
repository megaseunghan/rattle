import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import FinancialSharingScreen from '../../app/settings/financial-sharing';
import { updateFinancialSharing, FinancialSharingWriteError } from '../../lib/services/stores';
const mockRefresh = jest.fn();
let mockOwner = true;
let mockScope = 'all_staff';
let mockStoreId='s';
let mockAccountId='owner';
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: jest.fn() }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: mockStoreId, name: '검증 매장', owner_id: mockAccountId, financial_share_scope: mockScope }, user: { id: mockOwner ? mockAccountId : 'member' }, access:{can_manage_visibility:true}, devPreviewMode: 'self', refreshStore: mockRefresh }) }));
jest.mock('../../lib/services/stores', () => ({ updateFinancialSharing: jest.fn(), FinancialSharingWriteError: class extends Error { status:string; constructor(mockStatus:string){super(mockStatus);this.status=mockStatus;} } }));
const mockVisibility=jest.fn();
jest.mock('../../lib/services/storeVisibility',()=>({getMyStoreVisibility:(...a:unknown[])=>mockVisibility(...a)}));
jest.mock('../../lib/query/client', () => ({ clearQueryData: jest.fn().mockResolvedValue(undefined) }));
beforeEach(() => { jest.clearAllMocks(); mockOwner = true;mockStoreId='s';mockAccountId='owner';mockVisibility.mockReset(); mockScope = 'all_staff'; mockRefresh.mockResolvedValue(undefined); (updateFinancialSharing as jest.Mock).mockReset().mockResolvedValue(undefined); });
it('현재 적용 범위는 표시하고 바꾸지 않은 설정은 저장하지 않는다', () => {
  const view = render(<FinancialSharingScreen />);
  expect(view.getByText('검증 매장')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  expect(updateFinancialSharing).not.toHaveBeenCalled();
});
it('저장 후 새로고침 실패는 저장 실패로 표시하지 않고 재저장을 막는다', async () => {
  mockRefresh.mockRejectedValue(new Error('refresh failed'));
  const view = render(<FinancialSharingScreen />);
  fireEvent.press(view.getByRole('radio', { name: '공유하지 않기' }));
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  await waitFor(() => expect(view.getByText(/설정은 저장됐어요/)).toBeTruthy());
  expect(updateFinancialSharing).toHaveBeenCalledWith('s', 'none');
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  expect(updateFinancialSharing).toHaveBeenCalledTimes(1);
});
it('저장이 거절되면 선택을 유지하고 다시 시도할 수 있다', async () => {
  (updateFinancialSharing as jest.Mock).mockRejectedValue(new Error('rejected'));
  const view = render(<FinancialSharingScreen />);
  fireEvent.press(view.getByRole('radio', { name: '직원에게만 공유' }));
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  await waitFor(() => expect(view.getByText(/선택한 내용을 유지/)).toBeTruthy());
  expect(view.getByRole('radio', { name: '직원에게만 공유' }).props.accessibilityState.checked).toBe(true);
  expect(view.getByRole('button', { name: '공유 설정 저장' }).props.accessibilityState.disabled).toBe(false);
});
it('소유자가 아니면 변경 폼을 제공하지 않는다', () => {
  mockOwner = false;
  const view = render(<FinancialSharingScreen />);
  expect(view.queryByRole('radio')).toBeNull();
  expect(view.getByText('매장 소유자만 공유 대상을 변경할 수 있어요.')).toBeTruthy();
});

it('저장한 범위가 AuthContext에 반영돼도 완료 안내를 유지한다', async () => {
  mockRefresh.mockImplementation(async () => { mockScope = 'none'; });
  const view = render(<FinancialSharingScreen />);
  fireEvent.press(view.getByRole('radio', { name: '공유하지 않기' }));
  fireEvent.press(view.getByRole('button', { name: '공유 설정 저장' }));
  await waitFor(() => expect(view.getByText('적용 중 · 공유하지 않기')).toBeTruthy());
  expect(view.getByText('공유 설정을 저장했어요.')).toBeTruthy();
});

it.each(['unknown','conflict'] as const)('%s는 현재 저장값 조회 전 재저장을 막고 조회 실패 때도 잠금을 유지한다',async status=>{
 (updateFinancialSharing as jest.Mock).mockRejectedValueOnce(new FinancialSharingWriteError(status));
 mockVisibility.mockResolvedValueOnce({status:'unknown'}).mockResolvedValueOnce({status:'success',data:{financial_share_scope:'regular_only'}});
 const view=render(<FinancialSharingScreen/>);fireEvent.press(view.getByRole('radio',{name:'공유하지 않기'}));fireEvent.press(view.getByRole('button',{name:'공유 설정 저장'}));
 await waitFor(()=>expect(view.getByRole('button',{name:'현재 설정 확인'})).toBeTruthy());
 fireEvent.press(view.getByRole('button',{name:'현재 설정 확인'}));
 await waitFor(()=>expect(view.getByText('현재 설정을 확인하지 못했어요. 다시 불러와주세요.')).toBeTruthy());
 expect(updateFinancialSharing).toHaveBeenCalledTimes(1);
 fireEvent.press(view.getByRole('button',{name:'현재 설정 확인'}));
 await waitFor(()=>expect(view.getByRole('radio',{name:'직원에게만 공유'}).props.accessibilityState.checked).toBe(true));
 fireEvent.press(view.getByRole('button',{name:'공유 설정 저장'}));expect(updateFinancialSharing).toHaveBeenCalledTimes(1);
 (updateFinancialSharing as jest.Mock).mockResolvedValueOnce(undefined);
 fireEvent.press(view.getByRole('radio',{name:'공유하지 않기'}));fireEvent.press(view.getByRole('button',{name:'공유 설정 저장'}));
 await waitFor(()=>expect(updateFinancialSharing).toHaveBeenCalledTimes(2));
});

function deferred<T>() {
 let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};
}
const buttonName='공유 설정 저장';
const chooseNone=(view:ReturnType<typeof render>)=>fireEvent.press(view.getByRole('radio',{name:'공유하지 않기'}));
it.each([['store','success'],['store','failure'],['account','success'],['account','failure']])('REG-01: %s 변경 후 이전 쓰기 %s는 새 범위의 저장 상태와 잠금을 바꾸지 않는다',async(change,outcome)=>{
 const first=deferred<void>(),second=deferred<void>();
 (updateFinancialSharing as jest.Mock).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 const view=render(<FinancialSharingScreen/>);chooseNone(view);fireEvent.press(view.getByRole('button',{name:buttonName}));
 expect(updateFinancialSharing).toHaveBeenCalledTimes(1);
 if(change==='store')mockStoreId='b';else mockAccountId='owner-b';
 view.rerender(<FinancialSharingScreen/>);chooseNone(view);
 expect(view.getByRole('button',{name:buttonName})).not.toBeDisabled();
 const save=view.UNSAFE_getAllByType(require('../../lib/components/ui').Button).find(b=>b.props.label===buttonName)!.props.onPress;
 fireEvent.press(view.getByRole('button',{name:buttonName}));expect(updateFinancialSharing).toHaveBeenCalledTimes(2);
 await act(async()=>{if(outcome==='success')first.resolve();else first.reject(new Error('old scope failure'));});
 expect(view.getByRole('radio',{name:'공유하지 않기'})).toBeDisabled();
 await act(async()=>{await save();});expect(updateFinancialSharing).toHaveBeenCalledTimes(2);
 expect(mockRefresh).not.toHaveBeenCalled();
 await act(async()=>{second.resolve();});
 await waitFor(()=>expect(view.getByText('공유 설정을 저장했어요.')).toBeTruthy());
 expect(view.getByRole('radio',{name:'공유하지 않기'})).not.toBeDisabled();
});
it.each(['success','failure'])('REG-01: 이전 범위의 지연된 현재 설정 조회 %s는 새 매장의 쓰기를 잠그거나 풀지 않는다',async outcome=>{
 const read=deferred<any>(),write=deferred<void>();
 (updateFinancialSharing as jest.Mock).mockRejectedValueOnce(new FinancialSharingWriteError('unknown')).mockReturnValueOnce(write.promise);
 mockVisibility.mockReturnValueOnce(read.promise);
 const view=render(<FinancialSharingScreen/>);chooseNone(view);fireEvent.press(view.getByRole('button',{name:buttonName}));
 await waitFor(()=>expect(view.getByRole('button',{name:'현재 설정 확인'})).toBeTruthy());
 fireEvent.press(view.getByRole('button',{name:'현재 설정 확인'}));
 mockStoreId='b';view.rerender(<FinancialSharingScreen/>);chooseNone(view);
 expect(view.getByRole('button',{name:buttonName})).not.toBeDisabled();
 const save=view.UNSAFE_getAllByType(require('../../lib/components/ui').Button).find(b=>b.props.label===buttonName)!.props.onPress;
 fireEvent.press(view.getByRole('button',{name:buttonName}));
 await act(async()=>{if(outcome==='success')read.resolve({status:'success',data:{financial_share_scope:'regular_only'}});else read.reject(new Error('old read failure'));});
 expect(view.getByRole('radio',{name:'공유하지 않기'}).props.accessibilityState.checked).toBe(true);
 expect(view.getByRole('radio',{name:'공유하지 않기'})).toBeDisabled();
 await act(async()=>{await save();});expect(updateFinancialSharing).toHaveBeenCalledTimes(2);
 await act(async()=>{write.resolve();});await waitFor(()=>expect(view.getByText('공유 설정을 저장했어요.')).toBeTruthy());
});
