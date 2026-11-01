import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ManualSaleNewScreen from '../../app/pos/new';
const mockRead=jest.fn(), mockSave=jest.fn(), mockBypass=jest.fn();
let mockStore={id:'store'};
let mockDateChange: (_: unknown,date: Date) => void;
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({store:mockStore})}));
jest.mock('../../lib/services/manualSales',()=>({getManualSaleByDate:(...args:unknown[])=>mockRead(...args),saveManualSale:(...args:unknown[])=>mockSave(...args)}));
jest.mock('expo-router',()=>({router:{back:jest.fn()}}));
jest.mock('../../lib/hooks/useConfirmLeave',()=>({useConfirmLeave:()=>mockBypass}));
jest.mock('../../lib/icons/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('@react-native-community/datetimepicker',()=>({__esModule:true,default:(props:any)=>{mockDateChange=props.onChange;return null;}}));
jest.mock('../../lib/components/ui',()=>{
 const {Text,Pressable}=require('react-native');
 return {AppBar:({title}:any)=><Text>{title}</Text>,Button:({label,onPress,disabled}:any)=><Pressable onPress={onPress} disabled={disabled}><Text>{label}</Text></Pressable>};
});
jest.mock('../../lib/components/ErrorMessage',()=>{
 const {Text,Pressable}=require('react-native');
 return {ErrorMessage:({message,onRetry}:any)=><Pressable onPress={onRetry}><Text>{message}</Text></Pressable>};
});
const old={id:'row',store_id:'store',date:'2026-11-01',cash_amount:100,card_amount:200,discount_amount:30,memo:'기존 메모',created_by:'author',created_at:'today'};
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {resolve,promise};}
const latestAlert=()=> (Alert.alert as jest.Mock).mock.calls.at(-1);
async function loadExisting(){render(<ManualSaleNewScreen/>);await waitFor(()=>expect(screen.getByLabelText('현금 매출, 원').props.value).toBe('100'));}
beforeEach(()=>{
 jest.clearAllMocks();mockStore={id:'store'};
 mockRead.mockReset().mockResolvedValue(old);mockSave.mockReset().mockResolvedValue({...old,card_amount:250});
 jest.spyOn(Alert,'alert').mockImplementation(()=>{});
});
afterEach(()=>jest.restoreAllMocks());
it('기존 일 합계를 채우고 카드만 바꿔도 현금·할인·메모를 유지하며 확인 후 저장한다',async()=>{
 await loadExisting();expect(screen.getByText('매출 수정')).toBeTruthy();
 fireEvent.changeText(screen.getByLabelText('카드 매출, 원'),'250');
 fireEvent.press(screen.getByText('변경 내용 확인'));
 expect(mockSave).not.toHaveBeenCalled();
 const [title,message,buttons]=latestAlert();expect(title).toBe('매출 변경 확인');expect(message).toContain('200원 → 250원');expect(message).toContain('기존 메모');
 await act(async()=>{await buttons.find((b:any)=>b.text==='저장').onPress();});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({cashAmount:100,cardAmount:250,discountAmount:30,memo:'기존 메모',expected:old}));
});
it('날짜 조회가 실패하면 입력과 저장을 막는다',async()=>{
 mockRead.mockRejectedValue(new Error('read failed'));render(<ManualSaleNewScreen/>);
 await waitFor(()=>expect(screen.getByText('저장된 매출을 불러오지 못했어요.')).toBeTruthy());
  expect(screen.getByLabelText('현금 매출, 원').props.editable).toBe(false);
 fireEvent.press(screen.getByText('등록 내용 확인'));expect(mockSave).not.toHaveBeenCalled();
});
it('빠른 날짜 변경에서 이전 날짜의 늦은 응답을 버린다',async()=>{
 const first=deferred<any>();mockRead.mockReturnValueOnce(first.promise).mockResolvedValueOnce({...old,cash_amount:555});render(<ManualSaleNewScreen/>);
 fireEvent.press(screen.getByRole('button',{name:/매출 날짜/}));
 act(()=>mockDateChange({},new Date(2026,9,20)));
 await waitFor(()=>expect(screen.getByLabelText('현금 매출, 원').props.value).toBe('555'));
 await act(async()=>{first.resolve(old);});
 expect(screen.getByLabelText('현금 매출, 원').props.value).toBe('555');
});
it('작성 중 날짜 변경은 취소하면 기존 입력을 유지한다',async()=>{
 await loadExisting();fireEvent.changeText(screen.getByLabelText('카드 매출, 원'),'999');
 fireEvent.press(screen.getByRole('button',{name:/매출 날짜/}));act(()=>mockDateChange({},new Date(2026,9,20)));
 expect(latestAlert()[0]).toBe('작성 내용을 버릴까요?');
 act(()=>latestAlert()[2].find((b:any)=>b.text==='계속 작성').onPress());
 expect(screen.getByLabelText('카드 매출, 원').props.value).toBe('999');expect(mockRead).toHaveBeenCalledTimes(1);
});
it('저장 확인 연타에도 쓰기는 한 번만 한다',async()=>{
 await loadExisting();fireEvent.changeText(screen.getByLabelText('카드 매출, 원'),'250');
 fireEvent.press(screen.getByText('변경 내용 확인'));fireEvent.press(screen.getByText('변경 내용 확인'));
 expect((Alert.alert as jest.Mock).mock.calls.filter(c=>c[0]==='매출 변경 확인')).toHaveLength(1);
});
it('서버 충돌 시 작성값을 지우지 않는다',async()=>{
 mockSave.mockRejectedValue(new Error('conflict'));await loadExisting();
 fireEvent.changeText(screen.getByLabelText('카드 매출, 원'),'250');fireEvent.press(screen.getByText('변경 내용 확인'));
 const buttons=latestAlert()[2];await act(async()=>{await buttons.find((b:any)=>b.text==='저장').onPress();});
 expect(screen.getByLabelText('카드 매출, 원').props.value).toBe('250');
});

it('같은 저장 확인 콜백이 중복 실행돼도 한 번만 쓴다',async()=>{
 await loadExisting();fireEvent.changeText(screen.getByLabelText('카드 매출, 원'),'250');
 fireEvent.press(screen.getByText('변경 내용 확인'));
 const save=latestAlert()[2].find((b:any)=>b.text==='저장').onPress;
 await act(async()=>{await Promise.all([save(),save()]);});
 expect(mockSave).toHaveBeenCalledTimes(1);
});
