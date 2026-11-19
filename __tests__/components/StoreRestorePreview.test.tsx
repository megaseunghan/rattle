import { Alert } from 'react-native';
let mockMode='self';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SelectStore from '../../app/(auth)/select-store';
const mockRestore=jest.fn(),mockPush=jest.fn(),mockRefresh=jest.fn().mockResolvedValue(undefined);
const mockStores: unknown[]=[];
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,replace:jest.fn()}),useFocusEffect:(cb:any)=>require('react').useEffect(cb,[cb])}));
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'u'},store:null,stores:mockStores,storesLoaded:true,devPreviewMode:mockMode,switchStore:jest.fn(),refreshStore:mockRefresh,signOut:jest.fn()})}));
jest.mock('../../lib/services/stores',()=>({listMyDeletedStores:async()=>[{id:'deleted',name:'가상 매장',deleted_at:'2026-11-17T00:00:00Z',purge_after:'2026-11-24T00:00:00Z'}],restoreDeletedStore:(...a:unknown[])=>mockRestore(...a)}));
jest.mock('../../lib/components/StoreSetupWizard',()=>({StoreSetupWizard:()=>null}));
it('매장 복구 확인창을 연 뒤 미리보기로 바꾸면 이전 확인으로도 복구하지 않는다',async()=>{
 jest.spyOn(Alert,'alert').mockImplementation(()=>{});const view=render(<SelectStore/>);
 await waitFor(()=>expect(screen.getByText('복구')).toBeTruthy());fireEvent.press(screen.getByText('복구'));
 const buttons=(Alert.alert as jest.Mock).mock.calls.at(-1)[2];mockMode='regular';view.rerender(<SelectStore/>);
 await act(async()=>{await buttons.find((b:any)=>b.text==='복구').onPress();});
 expect(mockRestore).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();jest.restoreAllMocks();
});
