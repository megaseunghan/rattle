jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({}), usePreventRemove: jest.fn() }));
jest.mock('../../lib/components/EvidencePanel', () => ({ EvidencePanel: () => null }));
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import PurchaseDetail from '../../app/purchases/[id]';
const mockHeader=jest.fn(),mockItems=jest.fn(),mockSave=jest.fn(),mockAmounts=jest.fn();
let mockId='p';
let mockMode='self';
jest.mock('expo-router',()=>({router:{back:jest.fn()},useLocalSearchParams:()=>({id:mockId})}));
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({store:{id:'s'},devPreviewMode:mockMode,user:{id:'u'}})}));
jest.mock('../../lib/services/purchases',()=>({getPurchaseById:(...a:unknown[])=>mockHeader(...a),getPurchaseItems:(...a:unknown[])=>mockItems(...a),updatePurchaseItem:(...a:unknown[])=>mockSave(...a),updatePurchaseAmounts:(...a:unknown[])=>mockAmounts(...a)}));
jest.mock('../../lib/components/ui/SheetModal',()=>({SheetModal:({visible,children}:any)=>visible?children:null}));
jest.mock('../../lib/services/purchaseCategories',()=>({purchaseCategoryTaxonomy:{getCategories:async()=>['식자재','소모품']}}));
jest.mock('../../lib/icons/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../../lib/utils/layoutAnimation',()=>({animateListChange:jest.fn()}));
const purchase={id:'p',store_id:'s',supplier:'QA 거래처',category:'식자재',type:'수기',date:'2026-11-01',amount:100};
const item={id:'i',purchase_id:'p',name:'우유',quantity:1,unit:'개',unit_price:100,subtotal:100};
beforeEach(()=>{jest.clearAllMocks();mockId='p';mockMode='self';mockHeader.mockReset().mockResolvedValue(purchase);mockItems.mockReset().mockResolvedValue([item]);mockSave.mockReset().mockResolvedValue({refreshFailed:false});jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
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
 mockHeader.mockResolvedValueOnce(purchase);mockItems.mockResolvedValueOnce([{...item,quantity:2,unit_price:50}]);fireEvent.press(screen.getByText('다시 시도'));
 await waitFor(()=>expect(screen.getAllByText('100원').length).toBeGreaterThan(0));expect(mockSave).toHaveBeenCalledTimes(1);expect(screen.queryByText('다시 시도')).toBeNull();
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

it('미리보기에서 품목 수량을 바꿔도 실제 매입을 수정하지 않는다',async()=>{
 mockMode='regular';render(<PurchaseDetail/>);await waitFor(()=>expect(screen.getByText('우유')).toBeTruthy());
 fireEvent.press(screen.getByRole('button',{name:/우유.*수정/}));fireEvent.changeText(screen.getByLabelText('매입 품목 수량'),'2');
 await act(async()=>{fireEvent.press(screen.getByLabelText('품목 수정 저장'));});
 expect(mockSave).not.toHaveBeenCalled();
});

it('수량만 수정하면 10,000원은 유지하고 예상 단가를 5,000원으로 표시한다', async () => {
 mockItems.mockResolvedValue([{...item,quantity:3,unit_price:10000/3,subtotal:10000}]);
 render(<PurchaseDetail/>);
 fireEvent.press(await screen.findByRole('button',{name:/우유.*수정/}));
 fireEvent.changeText(screen.getByLabelText('매입 품목 수량'),'2');
 expect(screen.getByLabelText('매입 품목 금액').props.value).toBe('10000');
 expect(screen.getByText('단가 5,000원')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('품목 수정 저장'));
 await waitFor(()=>expect(mockSave).toHaveBeenCalledWith('i',2,null));
});

it('금액별 상세에서 새 분류에 금액을 옮겨 같은 영수증에 저장한다', async () => {
 const receipt={...purchase,hasAmountLines:true,category_amounts:{'식자재':100}};
 mockHeader.mockResolvedValue(receipt);mockItems.mockResolvedValue([]);
 render(<PurchaseDetail/>);
 fireEvent.press(await screen.findByRole('button',{name:'금액 수정'}));
 fireEvent.changeText(await screen.findByLabelText('식자재 금액'),'');
 fireEvent.changeText(screen.getByLabelText('소모품 금액'),'299');
 fireEvent.press(screen.getByLabelText('금액 수정 저장'));
 await waitFor(()=>expect(mockAmounts).toHaveBeenCalledWith(receipt,[{category:'식자재',amount:0},{category:'소모품',amount:299}]));
 expect(mockSave).not.toHaveBeenCalled();
});
it('기존 단일금액 기록에는 금액별 수정 버튼을 표시하지 않는다', async () => {
 mockItems.mockResolvedValue([]);
 render(<PurchaseDetail/>);
 await screen.findByText('금액만 입력된 매입이에요');
 expect(screen.queryByRole('button',{name:'금액 수정'})).toBeNull();
});
