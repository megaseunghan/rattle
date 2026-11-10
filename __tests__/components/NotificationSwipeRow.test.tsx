import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
let mockReduced = true;
Object.assign(Reanimated, { useEvent: () => undefined, useReducedMotion: () => mockReduced });
import { AppState } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { NotificationSwipeRow } from '../../lib/components/NotificationSwipeRow';
const item:any={id:'n1',category:'stock',message:'재고 확인',is_read:false,created_at:new Date().toISOString()};
const props=()=>({item,disabled:false,onPress:jest.fn(),onDeleteRequest:jest.fn(()=>true),onGesture:jest.fn()});
function swipe(x:number,end:State=State.END,velocityX=0){act(()=>fireGestureHandler(getByGestureTestId('notification-swipe-n1'),[{state:State.BEGAN,x:120,y:30},{state:State.ACTIVE,translationX:x,x:40,y:30},{state:end,translationX:x,velocityX,x:30,y:30}]));}
beforeEach(()=>{mockReduced=true;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});});
afterEach(()=>jest.restoreAllMocks());
it.each([[-240,State.END,1],[-90,State.END,0],[-240,State.CANCELLED,0]])('스와이프 %s 종료%s 삭제%s회, 읽음과 구분',(x,end,count)=>{
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);fireEvent(v.getByTestId('notification-row-n1'),'layout',{nativeEvent:{layout:{width:343,height:87}}});
 swipe(x,end);expect(p.onDeleteRequest).toHaveBeenCalledTimes(count);expect(p.onGesture).toHaveBeenLastCalledWith('n1',false);fireEvent.press(v.getByLabelText(/읽지 않음/));expect(p.onPress).not.toHaveBeenCalled();
});
it('부분 스와이프는 별도 버튼을 열고 누르면 한 번 삭제한다',()=>{
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);swipe(-90);const button=v.getByTestId('notification-delete-n1');expect(button.props.accessibilityState.disabled).toBe(false);fireEvent.press(button);fireEvent.press(button);expect(p.onDeleteRequest).toHaveBeenCalledTimes(1);
});
it('오른쪽으로 밀면 삭제 버튼을 닫는다',()=>{
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);swipe(-90);swipe(90);expect(v.getByTestId('notification-delete-n1',{includeHiddenElements:true}).props.accessibilityState.disabled).toBe(true);expect(p.onDeleteRequest).not.toHaveBeenCalled();
});
it('길게 누르기는 삭제 대신 버튼만 노출한다',()=>{
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);fireEvent(v.getByLabelText(/읽지 않음/),'longPress');act(()=>fireGestureHandler(getByGestureTestId('notification-swipe-n1'),[{state:State.BEGAN},{state:State.FAILED}]));expect(p.onDeleteRequest).not.toHaveBeenCalled();expect(v.getByTestId('notification-delete-n1').props.accessibilityState.disabled).toBe(false);
});
it('접근성 삭제는 직접 삭제하고 실패하면 재시도할 수 있다',async()=>{
 const p={...props(),onDeleteRequest:jest.fn(async()=>false)},v=render(<NotificationSwipeRow {...p}/>);const row=v.getByLabelText(/읽지 않음/);
 await act(async()=>fireEvent(row,'accessibilityAction',{nativeEvent:{actionName:'delete'}}));await act(async()=>fireEvent(row,'accessibilityAction',{nativeEvent:{actionName:'delete'}}));expect(p.onDeleteRequest).toHaveBeenCalledTimes(2);expect(p.onPress).not.toHaveBeenCalled();
});
it('기본 탭은 읽음 동작을 유지한다',()=>{const p=props(),v=render(<NotificationSwipeRow {...p}/>);fireEvent.press(v.getByLabelText(/읽지 않음/));expect(p.onPress).toHaveBeenCalledTimes(1);});

it.each([[-100,-1200,1],[-50,-2000,0],[-240,400,0],[-100,0,0]])('놓는 거리%s와 속도%s는 삭제%s회', (distance,velocity,count)=>{
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);fireEvent(v.getByTestId('notification-row-n1'),'layout',{nativeEvent:{layout:{width:343,height:87}}});swipe(distance,State.END,velocity);expect(p.onDeleteRequest).toHaveBeenCalledTimes(count);
});
it('삭제 저장 대기 중 반복 삭제와 읽음을 차단한다',async()=>{
 let finish!: (value:boolean)=>void;const p={...props(),onDeleteRequest:jest.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}))};const v=render(<NotificationSwipeRow {...p}/>);const row=v.getByLabelText(/읽지 않음/);
 await act(async()=>fireEvent(row,'accessibilityAction',{nativeEvent:{actionName:'delete'}}));
 fireEvent(row,'accessibilityAction',{nativeEvent:{actionName:'delete'}});fireEvent.press(row);expect(p.onDeleteRequest).toHaveBeenCalledTimes(1);expect(p.onPress).not.toHaveBeenCalled();
 await act(async()=>finish(false));fireEvent.press(v.getByLabelText(/읽지 않음/));expect(p.onPress).toHaveBeenCalledTimes(1);
});
it('삭제 예외도 행을 복구하고 재시도를 허용한다',async()=>{
 const p={...props(),onDeleteRequest:jest.fn(async()=>{throw new Error('network')})};const v=render(<NotificationSwipeRow {...p}/>);
 await act(async()=>fireEvent(v.getByLabelText(/읽지 않음/),'accessibilityAction',{nativeEvent:{actionName:'delete'}}));
 fireEvent.press(v.getByLabelText(/읽지 않음/));expect(p.onPress).toHaveBeenCalledTimes(1);
});

it('퇴장 후 높이를 접은 뒤 저장을 요청해 목록 제거가 튀지 않는다',async()=>{
 mockReduced=false;let exitDone!: (finished:boolean)=>void,collapseDone!: (finished:boolean)=>void;
 jest.spyOn(Reanimated,'withSpring').mockImplementation(((value:number,_config:any,done:any)=>{exitDone=done;return value;}) as any);
 jest.spyOn(Reanimated,'withTiming').mockImplementation(((value:number,_config:any,done:any)=>{if(done)collapseDone=done;return value;}) as any);
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);fireEvent(v.getByLabelText(/읽지 않음/),'accessibilityAction',{nativeEvent:{actionName:'delete'}});
 expect(p.onDeleteRequest).not.toHaveBeenCalled();act(()=>exitDone(true));expect(p.onDeleteRequest).not.toHaveBeenCalled();
 await act(async()=>collapseDone(true));expect(p.onDeleteRequest).toHaveBeenCalledTimes(1);
});

it('퇴장 도중 백그라운드로 가면 뒤늦은 애니메이션 콜백이 삭제하지 않는다',()=>{
 mockReduced=false;let exitDone!: (finished:boolean)=>void,onState!: (state:any)=>void;
 jest.spyOn(AppState,'addEventListener').mockImplementation(((_event:any,callback:any)=>{onState=callback;return {remove:jest.fn()};}) as any);
 jest.spyOn(Reanimated,'withSpring').mockImplementation(((value:number,_config:any,done:any)=>{exitDone=done;return value;}) as any);
 const p=props(),v=render(<NotificationSwipeRow {...p}/>);fireEvent(v.getByLabelText(/읽지 않음/),'accessibilityAction',{nativeEvent:{actionName:'delete'}});
 act(()=>onState('background'));act(()=>exitDone(true));expect(p.onDeleteRequest).not.toHaveBeenCalled();expect(p.onGesture).toHaveBeenLastCalledWith('n1',false);
});
