jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }) }));
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { setExpenseCategorySession } from '../../lib/utils/expenseCategorySession';
import { ExpensesPanel } from '../../lib/components/ExpensesPanel';
const mockAdd=jest.fn(),mockUpdate=jest.fn(),mockCopy=jest.fn(),mockRefetch=jest.fn().mockResolvedValue(undefined);
let mockUser='u';
let mockExpenses:any[]=[];
let mockCarried:any[]=[];
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({user:{id:mockUser},store:{id:'s'},currentRole:'admin',devPreviewMode:'self'})}));
jest.mock('../../lib/hooks/useExpenses',()=>({useExpenses:()=>({expenses:mockExpenses,carriedFixedExpenses:mockCarried,loading:false,error:null,refetch:mockRefetch,add:mockAdd,update:mockUpdate,remove:jest.fn(),copyCarriedFixedExpenses:mockCopy})}));
const mockRecurringSave=jest.fn();
let mockRecurringData:any={rules:[],occurrences:[],adoptedSourceIds:[]};
jest.mock('expo-crypto',()=>({randomUUID:()=> 'fixed-rule'}));
jest.mock('../../lib/hooks/useRecurringFixedExpenses',()=>({useRecurringFixedExpenses:()=>({identity:mockUser+':s',data:mockRecurringData,loading:false,error:null,refetch:mockRefetch,save:mockRecurringSave})}));
jest.mock('../../lib/icons/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../../lib/components/GlassCard',()=>({GlassCard:({children}:any)=>children}));
jest.mock('../../lib/components/ui/SheetModal',()=>({SheetModal:({visible,children}:any)=>visible?children:null}));
beforeEach(()=>{jest.clearAllMocks();mockRecurringData={rules:[],occurrences:[],adoptedSourceIds:[]};mockRefetch.mockResolvedValue(undefined);mockUser='u';setExpenseCategorySession(null);setExpenseCategorySession('u');mockExpenses=[];mockCarried=[];jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
async function ready(){await waitFor(()=>expect(screen.queryAllByText('불러오는 중').length).toBe(0));}
function expand(category:string){fireEvent.press(screen.getByLabelText(category+' 펼치기'));}
test('new entry requires actual valid date; no month-first default',async()=>{
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();expand('공과금');fireEvent.press(screen.getByLabelText('공과금 항목 추가'));
 fireEvent.changeText(screen.getByPlaceholderText('예: 임대료, 인스타그램 광고'),'전기');fireEvent.changeText(screen.getByPlaceholderText('0'),'20');
 fireEvent.press(screen.getByLabelText('비용 저장'));expect(mockAdd).not.toHaveBeenCalled();expect(screen.getByText('발생일을 YYYY-MM-DD 형식으로 입력해주세요.')).toBeTruthy();
 fireEvent.changeText(screen.getByLabelText('비용 발생일'),'2026-11-05');fireEvent.press(screen.getByLabelText('비용 저장'));
 await waitFor(()=>expect(mockAdd).toHaveBeenCalledWith({category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-05'}));
});
test('legacy remains undated until explicitly assigned by user',async()=>{
 mockExpenses=[{id:'e',category:'공과금',name:'전기',amount:20,occurred_on:null}];render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 expand('공과금');fireEvent.press(screen.getByText('전기'));expect(screen.getByLabelText('비용 발생일').props.value).toBe('');fireEvent.press(screen.getByLabelText('비용 저장'));
 await waitFor(()=>expect(mockUpdate).toHaveBeenCalledWith('e',{name:'전기',amount:20}));
});
test('same-store account switch closes editor',async()=>{
 const {rerender}=render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();expand('공과금');fireEvent.press(screen.getByLabelText('공과금 항목 추가'));
 expect(screen.getByLabelText('비용 발생일')).toBeTruthy();await act(async()=>{mockUser='other';setExpenseCategorySession('other');rerender(<ExpensesPanel selectedMonth="2026-11"/>);});
 expect(screen.queryByLabelText('비용 발생일')).toBeNull();await ready();
});
test('whole copy requires all dates and sends no inferred date',async()=>{
 mockCarried=[{id:'f',category:'고정비',name:'임대료',amount:100,year_month:'2026-10'}];render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 expand('고정비');fireEvent.press(screen.getByText('발생일 확인 후 이번 달로 전체 복사'));fireEvent.press(screen.getByLabelText('비용 저장'));
 expect(mockCopy).not.toHaveBeenCalled();fireEvent.changeText(screen.getByPlaceholderText('YYYY-MM-DD'),'2026-11-03');
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockCopy).toHaveBeenCalledWith([{id:'f',occurred_on:'2026-11-03'}]);
});

test('고정비 항목 추가 안에서 발생일과 할부 종료월을 저장하고 별도 설정 진입은 없다',async()=>{
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 expand('고정비');fireEvent.press(screen.getByLabelText('고정비 항목 추가'));
 expect(screen.queryByLabelText('반복 고정비 설정')).toBeNull();
 fireEvent.changeText(screen.getByLabelText('고정비 항목명'),'장비 할부');
 fireEvent.changeText(screen.getByLabelText('고정비 월 금액'),'250000');
 fireEvent.changeText(screen.getByLabelText('고정비 발생일'),'31');
 fireEvent.changeText(screen.getByLabelText('고정비 적용월'),'2099-01');
 fireEvent.press(screen.getByLabelText('종료월 지정'));fireEvent.changeText(screen.getByLabelText('고정비 종료월'),'2099-12');
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockRecurringSave).toHaveBeenCalledWith(expect.objectContaining({name:'장비 할부',amount:250000,payment_day:31,effective_month:'2099-01',end_month:'2099-12',source_expense_id:null}));
 expect(mockAdd).not.toHaveBeenCalled();
});
test('고정비 발생 항목과 월 합계에 반복 금액을 한 번만 표시한다',async()=>{
 mockRecurringData={rules:[{id:'r',source_expense_id:null,latest_revision:1,latest:{name:'보험',amount:30,payment_day:1,effective_month:'2026-11',end_month:null,active:true}}],occurrences:[{rule_id:'r',name:'보험',amount:30,occurred_on:'2026-11-01',status:'due'}],adoptedSourceIds:[]};
 mockExpenses=[{id:'m',category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-01'}];
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 expect(screen.getByText('50원')).toBeTruthy();
 expand('고정비');expect(screen.getByLabelText('보험 고정비 항목 수정')).toBeTruthy();
});

test('승계 고정비도 기존 항목 수정에서 반복 조건으로 연결한다',async()=>{
 mockCarried=[{id:'old-rent',category:'고정비',name:'기존임대료',amount:100,year_month:'2020-01',occurred_on:'2020-01-28'}];
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 expand('고정비');fireEvent.press(screen.getByText('기존임대료'));
 expect(screen.getByLabelText('고정비 발생일').props.value).toBe('28');
 await act(async()=>{fireEvent.press(screen.getByLabelText('비용 저장'));});
 expect(mockRecurringSave).toHaveBeenCalledWith(expect.objectContaining({source_expense_id:'old-rent',amount:100,payment_day:28}));
 expect(mockAdd).not.toHaveBeenCalled();expect(mockUpdate).not.toHaveBeenCalled();
});
test('당겨 새로고침은 일반 비용과 반복 고정비를 함께 조회한다',async()=>{
 const {RefreshControl}=require('react-native');
 const view=render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();mockRefetch.mockClear();
 await act(async()=>{await view.UNSAFE_getByType(RefreshControl).props.onRefresh();});
 expect(mockRefetch).toHaveBeenCalledTimes(2);
});

test('모든 카테고리는 접힌 채 시작하고 서로 독립적으로 펼친다',async()=>{
 mockExpenses=[{id:'e',category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-01'}];
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 for(const category of ['마케팅','고정비','시설보수','공과금']) expect(screen.getByLabelText(category+' 펼치기').props.accessibilityState.expanded).toBe(false);
 expect(screen.queryByText('전기')).toBeNull();expect(screen.queryByLabelText('공과금 항목 추가')).toBeNull();
 expand('공과금');expand('마케팅');expect(screen.getByText('전기')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('마케팅 접기'));expect(screen.getByLabelText('공과금 접기')).toBeTruthy();
 expect(screen.queryByText('2026-11-01')).toBeNull();
});
test('필터와 월 변경, 화면 재진입 뒤에도 펼침을 유지하고 접힘도 유지한다',async()=>{
 const view=render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();expand('고정비');
 fireEvent.press(screen.getByLabelText('비용 카테고리 공과금'));expect(screen.queryByLabelText('고정비 접기')).toBeNull();
 fireEvent.press(screen.getByLabelText('비용 카테고리 전체'));expect(screen.getByLabelText('고정비 접기')).toBeTruthy();
 view.rerender(<ExpensesPanel selectedMonth="2026-12"/>);await ready();expect(screen.getByLabelText('고정비 접기')).toBeTruthy();
 view.unmount();render(<ExpensesPanel selectedMonth="2026-12"/>);await ready();expect(screen.getByLabelText('고정비 접기')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('고정비 접기'));expect(screen.getByLabelText('고정비 펼치기')).toBeTruthy();
});
test('날짜와 삭제는 항목 수정에서 확인하고 삭제 전 확인을 거친다',async()=>{
 mockExpenses=[{id:'e',category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-01'}];
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();expand('공과금');
 expect(screen.queryByLabelText('전기 삭제')).toBeNull();fireEvent.press(screen.getByText('전기'));
 expect(screen.getByLabelText('비용 발생일').props.value).toBe('2026-11-01');fireEvent.press(screen.getByLabelText('전기 삭제'));
 expect(Alert.alert).toHaveBeenCalledWith('삭제','이 항목을 삭제할까요?',expect.any(Array));
});

test('카테고리 접근성 값에 월 합계와 항목 수를 제공한다',async()=>{
 mockExpenses=[{id:'e',category:'공과금',name:'전기',amount:2500,occurred_on:'2026-11-01'}];
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();
 expect(screen.getByLabelText('공과금 펼치기').props.accessibilityValue.text).toBe('2,500원, 1개 항목');
});
test('미래 및 중단 규칙은 이번 달 발생이 없으면 월 금액처럼 표시하지 않는다',async()=>{
 mockRecurringData={rules:[
 {id:'future',source_expense_id:null,latest_revision:1,latest:{name:'미래보험',amount:321000,payment_day:1,effective_month:'2099-01',end_month:null,active:true}},
 {id:'inactive',source_expense_id:null,latest_revision:1,latest:{name:'중단보험',amount:123000,payment_day:1,effective_month:'2026-01',end_month:null,active:false}},
 ],occurrences:[],adoptedSourceIds:[]};
 render(<ExpensesPanel selectedMonth="2026-11"/>);await ready();expand('고정비');
 expect(screen.getAllByText('이번 달 발생 없음')).toHaveLength(2);
 expect(screen.queryByText('321,000원')).toBeNull();expect(screen.queryByText('123,000원')).toBeNull();
 expect(screen.getByLabelText('고정비 접기').props.accessibilityValue.text).toBe('0원, 2개 항목');
});
