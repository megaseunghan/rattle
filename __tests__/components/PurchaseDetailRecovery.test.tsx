import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import PurchaseDetail from '../../app/purchases/[id]';
const mockHeader=jest.fn(),mockItems=jest.fn(),mockSave=jest.fn();
let mockId='p';
jest.mock('expo-router',()=>({router:{back:jest.fn()},useLocalSearchParams:()=>({id:mockId})}));
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({store:{id:'s'},user:{id:'u'}})}));
jest.mock('../../lib/services/purchases',()=>({getPurchaseById:(...a:unknown[])=>mockHeader(...a),getPurchaseItems:(...a:unknown[])=>mockItems(...a),updatePurchaseItem:(...a:unknown[])=>mockSave(...a)}));
jest.mock('../../lib/components/ui/SheetModal',()=>({SheetModal:({visible,children}:any)=>visible?children:null}));
jest.mock('../../lib/icons/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../../lib/utils/layoutAnimation',()=>({animateListChange:jest.fn()}));
const purchase={id:'p',store_id:'s',supplier:'QA 거래처',category:'식자재',type:'수기',date:'2026-11-01',amount:100};
const item={id:'i',purchase_id:'p',name:'우유',quantity:1,unit:'개',unit_price:100,subtotal:100};
beforeEach(()=>{jest.clearAllMocks();mockId='p';mockHeader.mockReset().mockResolvedValue(purchase);mockItems.mockReset().mockResolvedValue([item]);mockSave.mockReset().mockResolvedValue({refreshFailed:false});jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
it('첫 조회 실패 후 같은 화면에서 읽기만 재시도해 상세를 복원한다',async()=>{
 mockHeader.mockRejectedValueOnce(new Error('offline'));render(<PurchaseDetail/>);
 await waitFor(()=>expect(screen.getByText('다시 시도')).toBeTruthy());fireEvent.press(screen.getByText('다시 시도'));
 await waitFor(()=>expect(screen.getByText('QA 거래처')).toBeTruthy());expect(screen.queryByText('다시 시도')).toBeNull();expect(mockSave).not.toHaveBeenCalled();
});
it('저장 후 조회 실패는 저장 완료로 안내하고 재조회만으로 복구한다',async()=>{
 render(<PurchaseDetail/>);await waitFor(()=>expect(screen.getByText('우유')).toBeTruthy());fireEvent.press(screen.getByRole('button',{name:/우유.*수정/}));
 fireEvent.changeText(screen.getByLabelText('매입 품목 수량'),'2');mockHeader.mockRejectedValueOnce(new Error('offline'));
 fireEvent.press(screen.getByLabelText('품목 수정 저장'));await waitFor(()=>expect(screen.getByText('다시 시도')).toBeTruthy());
 expect(screen.getByText('품목 수정은 저장됐어요. 현재 내역을 다시 불러와 확인해주세요.')).toBeTruthy();
 expect(Alert.alert).toHaveBeenCalledWith('저장 완료 · 새로고침 필요',expect.any(String));expect(mockSave).toHaveBeenCalledTimes(1);
 mockHeader.mockResolvedValueOnce({...purchase,amount:200});mockItems.mockResolvedValueOnce([{...item,quantity:2,subtotal:200}]);fireEvent.press(screen.getByText('다시 시도'));
 await waitFor(()=>expect(screen.getAllByText('200원').length).toBeGreaterThan(0));expect(mockSave).toHaveBeenCalledTimes(1);expect(screen.queryByText('다시 시도')).toBeNull();
});
it('실제 쓰기 실패는 입력을 보존하고 저장 완료로 안내하지 않는다',async()=>{
 mockSave.mockRejectedValueOnce(new Error('rejected'));render(<PurchaseDetail/>);await waitFor(()=>expect(screen.getByText('우유')).toBeTruthy());fireEvent.press(screen.getByRole('button',{name:/우유.*수정/}));
 fireEvent.changeText(screen.getByLabelText('매입 품목 수량'),'2');fireEvent.press(screen.getByLabelText('품목 수정 저장'));
 await waitFor(()=>expect(Alert.alert).toHaveBeenCalledWith('저장 실패',expect.any(String)));expect(screen.getByLabelText('매입 품목 수량').props.value).toBe('2');expect(mockHeader).toHaveBeenCalledTimes(1);
});
it('다른 내역의 늦은 조회는 현재 상세를 덮지 않는다',async()=>{
 let resolve!:(v:any)=>void;mockHeader.mockReturnValueOnce(new Promise(done=>{resolve=done;}));const view=render(<PurchaseDetail/>);
 mockId='new';mockHeader.mockResolvedValueOnce({...purchase,id:'new',supplier:'새 거래처'});view.rerender(<PurchaseDetail/>);
 await waitFor(()=>expect(screen.getByText('새 거래처')).toBeTruthy());await act(async()=>{resolve(purchase);});expect(screen.queryByText('QA 거래처')).toBeNull();
});
