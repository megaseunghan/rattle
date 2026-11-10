import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AppState, StyleSheet } from 'react-native';
import CleaningEditScreen from '../../app/cleaning/edit';
const mockAdd = jest.fn(), mockEdit = jest.fn(), mockRemove = jest.fn(), mockReorder = jest.fn(), mockRefetch = jest.fn();
let mockAppStateChange: (state:string)=>void;
let mockStore = 's', mockScope = 'user', mockDragBegin: () => void, mockDragEnd: (args: any) => void;
const items = [
 { id: 'one', store_id: 's', segment: 'open', title: '홀 정돈', weekday: null, sort_order: 0 },
 { id: 'two', store_id: 's', segment: 'open', title: '기기 확인', weekday: null, sort_order: 1 },
];
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useFocusEffect: () => {} }));
jest.mock('../../lib/query', () => ({ useQueryScope: () => mockScope }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: mockStore } }) }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/hooks/useCleaningChecklist', () => ({ useCleaningChecklist: () => ({ items, itemsReady: true, error: null, refetch: mockRefetch, addItem: mockAdd, editItem: mockEdit, removeItem: mockRemove, reorder: mockReorder }) }));
jest.mock('react-native-draggable-flatlist', () => {
 const React = require('react'), { View } = require('react-native');
 return { __esModule: true, ScaleDecorator: ({ children }: any) => children,
 default: React.forwardRef(({ data, renderItem, ListHeaderComponent, ListFooterComponent, onDragBegin, onDragEnd }: any, ref: any) => {
  mockDragBegin=onDragBegin;mockDragEnd=onDragEnd;
  React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn(), scrollToOffset: jest.fn() }));
  return <View>{ListHeaderComponent}<View testID="rows">{data.map((item: any) => <React.Fragment key={item.id}>{renderItem({ item, drag: jest.fn(), isActive: false })}</React.Fragment>)}</View>{ListFooterComponent}</View>;
 }) };
});
beforeEach(() => {
 jest.clearAllMocks();mockStore='s';mockScope='user';
 mockAdd.mockImplementation(async (segment, title, weekday) => ({ id: 'added', store_id: mockStore, segment, title, weekday, sort_order: 2 }));
 mockEdit.mockResolvedValue(undefined);mockRemove.mockResolvedValue(undefined);mockReorder.mockResolvedValue(undefined);
 jest.spyOn(Alert, 'alert').mockImplementation(() => {});
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event, handler:any)=>{mockAppStateChange=handler;return {remove:jest.fn()}});
});
afterEach(() => jest.restoreAllMocks());
const openAdd=()=>fireEvent.press(screen.getByLabelText('항목 추가 열기'));
it('항목명을 눌러 같은 행에서 수정하고 저장/취소하며 팝업은 열지 않는다', async () => {
 render(<CleaningEditScreen />);
 const before=StyleSheet.flatten(screen.getByTestId('cleaning-edit-row-one').props.style);
 fireEvent.press(screen.getByLabelText('홀 정돈 수정'));
 expect(StyleSheet.flatten(screen.getByTestId('cleaning-edit-row-one').props.style).minHeight).toBe(before.minHeight);
 fireEvent.changeText(screen.getByLabelText('항목명'), '홀 정리');
 await act(async () => fireEvent.press(screen.getByLabelText('항목명 저장')));
 expect(mockEdit).toHaveBeenCalledWith('one','홀 정리');expect(screen.getByText('홀 정리')).toBeTruthy();expect(Alert.alert).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('홀 정리 수정'));fireEvent.changeText(screen.getByLabelText('항목명'),'미저장');fireEvent.press(screen.getByLabelText('항목명 수정 취소'));
 expect(screen.getByText('홀 정리')).toBeTruthy();
});
it('추가는 펼친 영역에서 처리하고 저장 후 다음 입력을 위해 열린 채 유지한다', async () => {
 render(<CleaningEditScreen />);expect(screen.queryByLabelText('새 항목')).toBeNull();openAdd();
 fireEvent.changeText(screen.getByLabelText('새 항목'),'새 업무');
 await act(async()=>fireEvent.press(screen.getByLabelText('항목 추가')));
 expect(mockAdd).toHaveBeenCalledWith('open','새 업무',null);expect(screen.getByLabelText('새 항목').props.value).toBe('');expect(screen.getByText('새 업무')).toBeTruthy();
 expect(Alert.alert).not.toHaveBeenCalled();
});
it('추가 작성값과 요일은 구간별로 보존한다',()=>{
 render(<CleaningEditScreen />);openAdd();fireEvent.changeText(screen.getByLabelText('새 항목'),'오픈 초안');
 fireEvent.press(screen.getByLabelText('요일별'));fireEvent.changeText(screen.getByLabelText('새 항목'),'요일 초안');fireEvent.press(screen.getByLabelText('수요일'));
 fireEvent.press(screen.getByLabelText('오픈'));expect(screen.getByLabelText('새 항목').props.value).toBe('오픈 초안');
 fireEvent.press(screen.getByLabelText('요일별'));expect(screen.getByLabelText('새 항목').props.value).toBe('요일 초안');expect(screen.getByLabelText('수요일').props.accessibilityState.checked).toBe(true);
});
it('요일별 추가는 선택한 요일을 전달한다',async()=>{
 render(<CleaningEditScreen />);fireEvent.press(screen.getByLabelText('요일별'));openAdd();fireEvent.press(screen.getByLabelText('금요일'));fireEvent.changeText(screen.getByLabelText('새 항목'),'주간 청소');
 await act(async()=>fireEvent.press(screen.getByLabelText('항목 추가')));expect(mockAdd).toHaveBeenCalledWith('weekday','주간 청소',5);
});
it('추가 중 연속 저장/탭 전환을 막고 실패하면 입력을 유지한다',async()=>{
 let reject!: (e:Error)=>void;mockAdd.mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no}));
 render(<CleaningEditScreen />);openAdd();fireEvent.changeText(screen.getByLabelText('새 항목'),'유지할 입력');fireEvent.press(screen.getByLabelText('항목 추가'));fireEvent.press(screen.getByLabelText('항목 추가'));fireEvent.press(screen.getByLabelText('마감'));
 expect(mockAdd).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('오픈').props.accessibilityState.selected).toBe(true);
 await act(async()=>reject(new Error('저장 실패')));expect(screen.getByLabelText('새 항목').props.value).toBe('유지할 입력');expect(screen.getByText('항목을 추가하지 못했어요. 입력은 유지했어요.')).toBeTruthy();
});
it('수정 실패에는 초안을 유지하고 다른 행 메뉴가 초안을 지우지 않는다',async()=>{
 mockEdit.mockRejectedValueOnce(new Error('수정 실패'));render(<CleaningEditScreen />);fireEvent.press(screen.getByLabelText('홀 정돈 수정'));fireEvent.changeText(screen.getByLabelText('항목명'),'수정 초안');fireEvent.press(screen.getByLabelText('기기 확인 더보기'));
 expect(screen.getByLabelText('항목명').props.value).toBe('수정 초안');await act(async()=>fireEvent.press(screen.getByLabelText('항목명 저장')));expect(screen.getByLabelText('항목명').props.value).toBe('수정 초안');expect(screen.getByText('수정하지 못했어요. 입력은 유지했어요.')).toBeTruthy();
});
it('더보기 삭제는 확인 후 실행하고 매장 전환 후 이전 확인은 무효다',async()=>{
 const v=render(<CleaningEditScreen />);fireEvent.press(screen.getByLabelText('홀 정돈 더보기'));fireEvent.press(screen.getByLabelText('홀 정돈 삭제'));
 expect(mockRemove).not.toHaveBeenCalled();const confirm=(Alert.alert as jest.Mock).mock.calls[0][2][1].onPress;
 mockStore='other';v.rerender(<CleaningEditScreen />);await act(confirm);expect(mockRemove).not.toHaveBeenCalled();
});
it('순서 저장 실패에는 이전 순서로 복원한다',async()=>{
 mockReorder.mockRejectedValueOnce(new Error('순서 저장 실패'));render(<CleaningEditScreen />);fireEvent.press(screen.getByLabelText('홀 정돈 더보기'));
 await act(async()=>fireEvent.press(screen.getByLabelText('홀 정돈 아래로')));
 const labels=screen.getByTestId('rows').findAllByType(require('react-native').Text).map((x:any)=>x.props.children).filter((x:unknown)=>typeof x==='string');
 expect(labels.indexOf('홀 정돈')).toBeLessThan(labels.indexOf('기기 확인'));expect(screen.getByText('순서를 저장하지 못했어요. 이전 순서로 돌렸어요.')).toBeTruthy();
});
it('네이티브 드래그 중에는 탭을 잠그되 손잡이 자체를 비활성화하지 않는다',async()=>{
 render(<CleaningEditScreen />);act(()=>mockDragBegin());expect(screen.getByLabelText('마감').props.accessibilityState.disabled).toBe(true);expect(screen.getByLabelText('홀 정돈 순서 이동').props.accessibilityState.disabled).toBe(false);
 await act(async()=>mockDragEnd({data:[items[1],items[0]]}));expect(mockReorder).toHaveBeenCalledWith([items[1],items[0]]);
});
it('매장 전환 후 이전 추가 응답은 새 매장의 입력을 지우지 않는다',async()=>{
 let resolve!: (x:any)=>void;mockAdd.mockImplementationOnce(()=>new Promise(yes=>{resolve=yes}));
 const v=render(<CleaningEditScreen />);openAdd();fireEvent.changeText(screen.getByLabelText('새 항목'),'이전 초안');fireEvent.press(screen.getByLabelText('항목 추가'));
 mockStore='other';v.rerender(<CleaningEditScreen />);openAdd();fireEvent.changeText(screen.getByLabelText('새 항목'),'현재 초안');
 await act(async()=>resolve({...items[0],id:'old-added',title:'이전 초안'}));expect(screen.getByLabelText('새 항목').props.value).toBe('현재 초안');expect(screen.queryByText('이전 초안')).toBeNull();
});

it('백그라운드로 중단된 드래그와 늦은 종료 콜백은 저장하지 않는다',()=>{
 render(<CleaningEditScreen />);act(()=>mockDragBegin());const end=mockDragEnd;
 act(()=>mockAppStateChange('background'));act(()=>end({data:[items[1],items[0]]}));
 expect(mockReorder).not.toHaveBeenCalled();expect(screen.getByLabelText('마감').props.accessibilityState.disabled).toBe(false);
});
it('언마운트 뒤 도착한 드래그 종료는 저장하지 않는다',()=>{
 const v=render(<CleaningEditScreen />);act(()=>mockDragBegin());const end=mockDragEnd;v.unmount();act(()=>end({data:[items[1],items[0]]}));expect(mockReorder).not.toHaveBeenCalled();
});

it('중단된 이전 드래그 종료는 새 드래그가 시작된 뒤에도 무시한다',async()=>{
 render(<CleaningEditScreen />);act(()=>mockDragBegin());const oldEnd=mockDragEnd;
 act(()=>mockAppStateChange('background'));act(()=>mockAppStateChange('active'));act(()=>mockDragBegin());
 act(()=>oldEnd({data:[items[1],items[0]]}));expect(mockReorder).not.toHaveBeenCalled();
 await act(async()=>mockDragEnd({data:[items[1],items[0]]}));expect(mockReorder).toHaveBeenCalledTimes(1);
});
