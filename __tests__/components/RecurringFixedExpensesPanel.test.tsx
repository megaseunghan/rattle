jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }) }));
import React from 'react';
import type { FixedExpenseEditorHandle } from '../../lib/components/RecurringFixedExpensesPanel';
let mockEditor = React.createRef<FixedExpenseEditorHandle>();
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RecurringFixedExpensesPanel } from '../../lib/components/RecurringFixedExpensesPanel';
import { koreaExpenseMonth, nextExpenseMonth } from '../../lib/utils/recurringExpense';
const mockSave=jest.fn(),mockRefetch=jest.fn().mockResolvedValue(undefined),mockChanged=jest.fn().mockResolvedValue(undefined);
let mockIdentity='u:s:admin:self:2026-11';
let mockData:any;
let mockRole='admin';
jest.mock('expo-crypto',()=>({randomUUID:()=> 'stable-rule-id'}));
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({store:{id:'s'},currentRole:mockRole})}));
jest.mock('../../lib/hooks/useRecurringFixedExpenses',()=>({useRecurringFixedExpenses:()=>({identity:mockIdentity,data:mockData,loading:false,error:null,refetch:mockRefetch,save:mockSave})}));
jest.mock('../../lib/components/ui/SheetModal',()=>({SheetModal:({visible,children}:any)=>visible?children:null}));
const legacy:any={id:'legacy',name:'임대료',amount:100,category:'고정비',year_month:'2020-01',occurred_on:null};
const props=()=>({ref:mockEditor,recurring:{identity:mockIdentity,data:mockData,loading:false,error:null,refetch:mockRefetch,save:mockSave},yearMonth:koreaExpenseMonth(),legacyExpenses:[legacy],onChanged:mockChanged});
beforeEach(()=>{mockEditor=React.createRef<FixedExpenseEditorHandle>();jest.clearAllMocks();mockSave.mockResolvedValue('stable-rule-id');mockIdentity='u:s:admin:self:month';mockRole='admin';mockData={rules:[],occurrences:[],adoptedSourceIds:[]};});
function fill(){fireEvent.changeText(screen.getByLabelText('고정비 항목명'),'임대료');fireEvent.changeText(screen.getByLabelText('고정비 월 금액'),'100');fireEvent.changeText(screen.getByLabelText('고정비 발생일'),'31');}
test('creates explicit monthly schedule and shows confirmed month-end policy',async()=>{
 render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());fill();
 expect(screen.getByText(/해당 날짜가 없는 달은 그달 말일/)).toBeTruthy();
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({rule_id:'stable-rule-id',store_id:'s',name:'임대료',amount:100,payment_day:31,effective_month:koreaExpenseMonth(),active:true,source_expense_id:null}));expect(mockChanged).toHaveBeenCalledTimes(1);
});
test('adopts original legacy without filling in its unknown date',async()=>{
 render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());
 act(()=>mockEditor.current?.openSource(legacy));expect(screen.getByLabelText('고정비 발생일').props.value).toBe('');
 fireEvent.changeText(screen.getByLabelText('고정비 발생일'),'28');await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({source_expense_id:'legacy',payment_day:28}));expect(legacy.occurred_on).toBeNull();
});
test('editing preserves existing end month and uses next-month effective revision',async()=>{
 mockData.rules=[{id:'r',source_expense_id:null,latest_revision:3,latest:{effective_month:koreaExpenseMonth(),name:'임대료',amount:100,payment_day:31,active:true,end_month:'2099-12'},current:null}];
 render(<RecurringFixedExpensesPanel {...props()}/>);fireEvent.press(screen.getByLabelText('임대료 고정비 항목 수정'));expect(screen.getByLabelText('고정비 종료월').props.value).toBe('2099-12');
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({rule_id:'r',expected_revision:3,effective_month:nextExpenseMonth(koreaExpenseMonth()),end_month:'2099-12'}));
});
test('uncertain failure retains same rule ID and draft for retry',async()=>{
 mockSave.mockRejectedValueOnce(new Error('lost response'));render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());fill();
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});expect(screen.getByLabelText('고정비 항목명').props.value).toBe('임대료');
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});expect(mockSave.mock.calls.map(call=>call[0].rule_id)).toEqual(['stable-rule-id','stable-rule-id']);
});
test('account/month switch closes draft and blocks late completion UI effects',async()=>{
 let resolve!:(value:string)=>void;mockSave.mockReturnValue(new Promise<string>(r=>{resolve=r;}));
 const {rerender}=render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());fill();act(()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 mockIdentity='other:s:admin:self:month';rerender(<RecurringFixedExpensesPanel {...props()}/>);expect(screen.queryByLabelText('고정비 항목명')).toBeNull();
 await act(async()=>{resolve('stable-rule-id');});expect(mockChanged).not.toHaveBeenCalled();
});
test('future item is scheduled, never marked payment complete',()=>{
 mockData.rules=[{id:'r',source_expense_id:null,latest_revision:1,latest:{name:'임대료',amount:100,payment_day:31,effective_month:'2099-12',end_month:null,active:true}}];mockData.occurrences=[{id:'recurring:r:2099-12',rule_id:'r',name:'임대료',amount:100,occurred_on:'2099-12-31',status:'scheduled'}];render(<RecurringFixedExpensesPanel {...props()}/>);
 expect(screen.getByText('2099-12-31 · 예정')).toBeTruthy();expect(screen.queryByText('결제 완료')).toBeNull();
});
test('non-admin does not receive settings UI',()=>{mockRole='member';render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());expect(screen.queryByLabelText('고정비 항목명')).toBeNull();});

test('editing future start does not silently bring it forward',async()=>{
 mockData.rules=[{id:'r',source_expense_id:null,latest_revision:1,latest:{effective_month:'2099-06',name:'보험',amount:50,payment_day:20,active:true,end_month:'2099-12'},current:null}];
 render(<RecurringFixedExpensesPanel {...props()}/>);fireEvent.press(screen.getByLabelText('보험 고정비 항목 수정'));
 expect(screen.getByLabelText('고정비 적용월').props.value).toBe('2099-06');
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({effective_month:'2099-06',end_month:'2099-12'}));
});

test('종료월 지정은 월 입력을 요구하고 계속 반복은 종료월 없이 저장한다',async()=>{
 render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());fill();
 expect(screen.queryByLabelText('고정비 종료월')).toBeNull();
 fireEvent.press(screen.getByLabelText('종료월 지정'));
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).not.toHaveBeenCalled();expect(screen.getByText('마지막 발생월을 선택해주세요.')).toBeTruthy();
 fireEvent.changeText(screen.getByLabelText('고정비 종료월'),'2099-12');
 fireEvent.press(screen.getByLabelText('계속 반복'));expect(screen.queryByLabelText('고정비 종료월')).toBeNull();
 fireEvent.press(screen.getByLabelText('종료월 지정'));expect(screen.getByLabelText('고정비 종료월').props.value).toBe('2099-12');
 fireEvent.press(screen.getByLabelText('계속 반복'));
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({end_month:null}));
});
test('할부 종료월까지 포함한 기간과 월말 발생일을 요약한다',()=>{
 render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());fill();
 fireEvent.changeText(screen.getByLabelText('고정비 적용월'),'2027-02');
 fireEvent.press(screen.getByLabelText('종료월 지정'));
 fireEvent.changeText(screen.getByLabelText('고정비 종료월'),'2028-01');
 expect(screen.getByText('매월 31일 · 12개월')).toBeTruthy();
 expect(screen.getByText('첫 발생 2027-02-28')).toBeTruthy();
});
test('발생월 달력 선택은 입력만 갱신하고 저장 전 서버를 호출하지 않는다',()=>{
 render(<RecurringFixedExpensesPanel {...props()}/>);act(()=>mockEditor.current?.openNew());
 const year=Number(koreaExpenseMonth().slice(0,4))+1;
 fireEvent.press(screen.getByLabelText('발생월 달력 열기'));fireEvent.press(screen.getByLabelText('다음 연도'));
 fireEvent.press(screen.getByLabelText(`${year}년 1월 선택`));
 expect(screen.getByLabelText('고정비 적용월').props.value).toBe(`${year}-01`);
 expect(mockSave).not.toHaveBeenCalled();
});
test('중단된 기존 항목은 승인하지 않은 재활성화를 하지 않는다',async()=>{
 mockData.rules=[{id:'r',source_expense_id:null,latest_revision:2,latest:{effective_month:koreaExpenseMonth(),name:'보험',amount:100,payment_day:1,active:false,end_month:null},current:null}];
 render(<RecurringFixedExpensesPanel {...props()}/>);fireEvent.press(screen.getByLabelText('보험 고정비 항목 수정'));
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({active:false}));
});
test('현재월 비용을 연결하는 발생월 달력은 원본 다음 달부터 선택한다',()=>{
 const source={...legacy,year_month:koreaExpenseMonth()};
 render(<RecurringFixedExpensesPanel {...props()} legacyExpenses={[source]}/>);act(()=>mockEditor.current?.openSource(source));
 fireEvent.press(screen.getByLabelText('발생월 달력 열기'));
 const next=nextExpenseMonth(koreaExpenseMonth());
 expect(screen.getByLabelText('고정비 적용월').props.value).toBe(next);
 const currentYear=Number(koreaExpenseMonth().slice(0,4)),currentMonth=Number(koreaExpenseMonth().slice(5));
 if(next.startsWith(String(currentYear)))expect(screen.getByLabelText(`${currentYear}년 ${currentMonth}월 선택`).props.accessibilityState.disabled).toBe(true);
});
test('미래 원본에 연결된 기존 규칙 수정도 원본 다음 달보다 앞당기지 않는다',()=>{
 const source={...legacy,year_month:'2099-05'};
 mockData.rules=[{id:'r',source_expense_id:source.id,latest_revision:2,latest:{effective_month:'2099-06',name:'보험',amount:100,payment_day:1,active:true,end_month:null},current:null}];
 render(<RecurringFixedExpensesPanel {...props()} legacyExpenses={[source]}/>);act(()=>mockEditor.current?.openSource(source));
 fireEvent.press(screen.getByLabelText('발생월 달력 열기'));
 expect(screen.getByLabelText('2099년 5월 선택').props.accessibilityState.disabled).toBe(true);
 expect(screen.getByLabelText('2099년 6월 선택').props.accessibilityState.disabled).toBe(false);
});

test('접힌 목록 컨트롤러도 항목 수정과 발생일 상세를 열 수 있다',()=>{
 const rule:any={id:'r',source_expense_id:null,latest_revision:1,latest:{name:'보험',amount:100,payment_day:1,effective_month:'2099-12',end_month:null,active:true}};
 mockData.rules=[rule];mockData.occurrences=[{rule_id:'r',occurred_on:'2099-12-01'}];
 render(<RecurringFixedExpensesPanel {...props()} rowsVisible={false}/>);
 expect(screen.queryByLabelText('보험 고정비 항목 수정')).toBeNull();
 act(()=>mockEditor.current?.openRule(rule));expect(screen.getByLabelText('고정비 항목명').props.value).toBe('보험');
 expect(screen.getByText('선택 월 발생일 2099-12-01')).toBeTruthy();
 expect(screen.getByText('2099-12부터 100원 · 매월 1일')).toBeTruthy();
});

test('늦게 완료된 원본 삭제는 이후 연 다른 수정 초안을 닫지 않는다',()=>{
 let completeDeletion:(()=>void)|undefined;
 const source={...legacy,year_month:koreaExpenseMonth()};
 const onDeleteSource=jest.fn((_id:string,done:()=>void)=>{completeDeletion=done;});
 render(<RecurringFixedExpensesPanel {...props()} legacyExpenses={[source]} onDeleteSource={onDeleteSource}/>);
 act(()=>mockEditor.current?.openSource(source));fireEvent.press(screen.getByLabelText('임대료 삭제'));
 expect(onDeleteSource).toHaveBeenCalledWith('legacy',expect.any(Function));
 const rule:any={id:'different-rule',source_expense_id:null,latest_revision:1,latest:{name:'새보험',amount:20,payment_day:1,effective_month:'2099-12',end_month:null,active:true}};
 act(()=>mockEditor.current?.openRule(rule));act(()=>completeDeletion?.());
 expect(screen.getByLabelText('고정비 항목명').props.value).toBe('새보험');
 act(()=>mockEditor.current?.openSource(source));fireEvent.press(screen.getByLabelText('임대료 삭제'));
 act(()=>mockEditor.current?.openSource(source));
 fireEvent.changeText(screen.getByLabelText('고정비 항목명'),'다시 연 임대료');
 act(()=>completeDeletion?.());
 expect(screen.getByLabelText('고정비 항목명').props.value).toBe('다시 연 임대료');
});
