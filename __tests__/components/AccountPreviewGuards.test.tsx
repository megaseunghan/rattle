import { TouchableOpacity, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Account from '../../app/settings/account';
import Password from '../../app/settings/password';
const mockProfile=jest.fn(),mockPassword=jest.fn();
let mockMode='self';
jest.mock('expo-router',()=>({router:{back:jest.fn()}}));
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'u',user_metadata:{full_name:'가상 이름'},app_metadata:{provider:'email'}},devPreviewMode:mockMode})}));
jest.mock('../../lib/services/profile',()=>({updateUserProfile:(...a:unknown[])=>mockProfile(...a),updateUserPassword:(...a:unknown[])=>mockPassword(...a)}));
beforeEach(()=>{jest.clearAllMocks();mockMode='self';});
it.each(['regular','part_time'])('%s 미리보기의 계정 직접 경로에서 프로필과 암호를 저장하지 않는다',async mode=>{
 mockMode=mode;const profile=render(<Account/>);
 fireEvent.changeText(screen.getByPlaceholderText('실명 (급여·직원 관리에 사용)'),'수정 이름');
 fireEvent.press(screen.getByText('저장'));profile.unmount();
 render(<Password/>);fireEvent.changeText(screen.getByPlaceholderText('6자 이상'),'test-only-password');fireEvent.changeText(screen.getByPlaceholderText('새 비밀번호 재입력'),'test-only-password');
 fireEvent.press(screen.getAllByText('비밀번호 변경').at(-1)!);await act(async()=>{});
 expect(mockProfile).not.toHaveBeenCalled();expect(mockPassword).not.toHaveBeenCalled();
});

it.each(['profile','password'])('본인 화면의 %s 저장 콜백도 미리보기 전환 뒤 쓰지 않는다',async kind=>{
 jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const Component=kind==='profile'?Account:Password;const view=render(<Component/>);
 if(kind==='password'){fireEvent.changeText(screen.getByPlaceholderText('6자 이상'),'test-only-password');fireEvent.changeText(screen.getByPlaceholderText('새 비밀번호 재입력'),'test-only-password');}
 const callback=view.UNSAFE_getAllByType(TouchableOpacity).at(-1)!.props.onPress;
 mockMode='regular';view.rerender(<Component/>);await act(async()=>{await callback();});
 expect(mockProfile).not.toHaveBeenCalled();expect(mockPassword).not.toHaveBeenCalled();jest.restoreAllMocks();
});
it('본인 모드의 프로필 저장은 유지한다',async()=>{
 jest.spyOn(Alert,'alert').mockImplementation(()=>{});mockProfile.mockResolvedValue(undefined);
 render(<Account/>);await act(async()=>{fireEvent.press(screen.getByText('저장'));});
 expect(mockProfile).toHaveBeenCalledWith({name:'가상 이름',phone:null});jest.restoreAllMocks();
});
