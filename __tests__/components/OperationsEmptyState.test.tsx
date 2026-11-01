import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CleaningScreen from '../../app/cleaning';
import RequestScreen from '../../app/mypage/requests';
import { PosScreen } from '../../app/pos';
let mockCleaning:any, mockRequests:any, mockSales:any;
const mockRead=jest.fn(), mockReview=jest.fn();
jest.mock('expo-router',()=>({router:{push:jest.fn(),back:jest.fn()},useFocusEffect:jest.fn(),useLocalSearchParams:()=>({})}));
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({store:{id:'s'},user:{id:'u'},currentRole:'admin'})}));
jest.mock('../../lib/hooks/useEmployees',()=>({useEmployees:()=>({employees:[],refetch:mockRead})}));
jest.mock('../../lib/hooks/useCleaningChecklist',()=>({useCleaningChecklist:()=>mockCleaning}));
jest.mock('../../lib/hooks/useRequestApprovals',()=>({useRequestApprovals:()=>mockRequests}));
jest.mock('../../lib/hooks/useManualSales',()=>({useManualSales:()=>mockSales}));
jest.mock('../../lib/hooks/useTossSync',()=>({useTossSync:()=>({loadTodaySales:mockRead,autoSyncRecent:mockRead})}));
jest.mock('../../lib/hooks/usePosAnalytics',()=>({usePosAnalytics:()=>({summaries:[],fetchSummariesByRange:mockRead})}));
jest.mock('../../lib/services/stores',()=>({getStoreDetails:async()=>({toss_merchant_id:null})}));
jest.mock('../../lib/components/GlassBackdrop',()=>({GlassBackdrop:()=>null}));
jest.mock('../../lib/icons/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../../lib/components/ui',()=>{const {Text}=require('react-native');return {Badge:({label}:any)=><Text>{label}</Text>,AppBar:({title}:any)=><Text>{title}</Text>,EmptyState:({title}:any)=><Text>{title}</Text>};});
beforeEach(()=>{
 jest.clearAllMocks();mockRead.mockResolvedValue(undefined);
 mockCleaning={items:[],logs:[],loading:false,error:null,itemsReady:true,checkingId:null,refetch:mockRead};
 mockRequests={scheduleRequests:[],loading:false,ready:true,error:null,actionError:null,totalPending:0,reviewingId:null,refetch:mockRead,reviewSchedule:mockReview};
 mockSales={sales:[],loading:false,ready:true,total:0,error:null,actionError:null,removingId:null,refetch:mockRead};
});
it('체크리스트 조회 오류를 항목 미등록으로 표시하지 않는다',()=>{
 mockCleaning={...mockCleaning,error:'조회 실패',itemsReady:false}; render(<CleaningScreen/>);
 expect(screen.getByText('조회 실패')).toBeTruthy();expect(screen.queryByText('등록된 체크리스트가 없어요')).toBeNull();
 fireEvent.press(screen.getByText('다시 시도'));expect(mockRead).toHaveBeenCalledTimes(1);
});
it('체크리스트를 정상 조회한 빈 상태만 미등록으로 표시한다',()=>{
 render(<CleaningScreen/>);expect(screen.getByText('등록된 체크리스트가 없어요')).toBeTruthy();
});
it('요청함 조회 실패는 요청 없음으로 표시하지 않는다',()=>{
 mockRequests={...mockRequests,error:'요청 조회 실패',ready:false,totalPending:null};render(<RequestScreen/>);
 expect(screen.getByText('요청 조회 실패')).toBeTruthy();expect(screen.queryByText('대기 중인 요청이 없어요')).toBeNull();
});
it('승인 결과 불명 상태에서는 요청을 유지하고 승인 버튼을 잠근다',()=>{
 mockRequests={...mockRequests,actionError:'처리 확인 필요',totalPending:1,scheduleRequests:[{id:'r',employee_name:'QA',days:[]}]};render(<RequestScreen/>);
 expect(screen.getByText('QA')).toBeTruthy();expect(screen.getByRole('button',{name:'스케줄 변경 요청 승인',disabled:true})).toBeTruthy();
});
it('수기 매출 조회 실패는 매출 없음으로 표시하지 않는다',async()=>{
 mockSales={...mockSales,error:'매출 조회 실패',ready:false,total:null};render(<PosScreen/>);
 await waitFor(()=>expect(screen.getByText('매출 조회 실패')).toBeTruthy());expect(screen.queryByText('이번 달 등록된 매출이 없어요')).toBeNull();
});
it('수기 매출 재조회 실패 때 이전 내역과 오류를 함께 표시하고 삭제를 잠근다',async()=>{
 mockSales={...mockSales,error:'매출 조회 실패',ready:false,total:null,sales:[{id:'sale',date:'2026-10-01',cash_amount:100,card_amount:0}]};render(<PosScreen/>);
 await waitFor(()=>expect(screen.getByText('매출 조회 실패')).toBeTruthy());expect(screen.getByText('100원')).toBeTruthy();
 expect(screen.getByRole('button',{name:'2026-10-01 수기 매출 삭제',disabled:true})).toBeTruthy();
});
