jest.mock('../../lib/supabase', () => ({ supabase: {rpc:jest.fn()} }));
import {supabase} from '../../lib/supabase';
import {getAttendanceWorkFailures} from '../../lib/services/attendanceWorkRecord';
const rpc=supabase.rpc as jest.Mock;
const row={employee_id:'employee',employee_name:'가상 직원',work_date:'2026-11-18',error_code:'DAILY_WORK_RATE_REQUIRED',updated_at:'2026-11-18T01:00:00Z',retry_punch_id:'out'};
const range=jest.fn();
beforeEach(()=>{jest.resetAllMocks();rpc.mockReturnValue({range});});
it('매장·월 범위를 서버에 전달하며 실패 목록과 다음 페이지를 반환한다',async()=>{
 range.mockResolvedValue({data:[row,{...row,employee_id:'next'}],error:null});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11',pageSize:1})).toEqual({status:'success',data:{rows:[row],nextOffset:1}});
 expect(rpc).toHaveBeenCalledWith('get_admin_attendance_work_issues',{p_store_id:'s',p_from:'2026-11-01',p_to:'2026-11-30'});
 expect(range).toHaveBeenCalledWith(0,1);
});
it('성공한 빈 목록만 0건으로 반환한다',async()=>{
 range.mockResolvedValue({data:[],error:null});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-02'})).toEqual({status:'success',data:{rows:[],nextOffset:null}});
 expect(rpc).toHaveBeenCalledWith('get_admin_attendance_work_issues',expect.objectContaining({p_to:'2026-02-28'}));
});
it.each([{code:'42501',message:'ATTENDANCE_ADMIN_REQUIRED'},new Error('private')])('조회 거절/응답 유실은 0건으로 바꾸지 않는다',async error=>{
 range.mockResolvedValue({data:null,error});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11'})).not.toHaveProperty('data');
});
it('잘못된 월·페이지는 서버 요청 전에 차단한다',async()=>{
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-13'})).toMatchObject({status:'preflight_failed'});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11',pageSize:0})).toMatchObject({status:'preflight_failed'});
 expect(rpc).not.toHaveBeenCalled();
});
it('형식 불완전/다른 기간 응답을 조용히 누락하거나 0건으로 바꾸지 않는다',async()=>{
 range.mockResolvedValueOnce({data:[{...row,work_date:'2026-10-31'}],error:null}).mockResolvedValueOnce({data:[{employee_id:'e'}],error:null});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11'})).toMatchObject({status:'unknown'});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11'})).toMatchObject({status:'unknown'});
});

it('1000행 상한에서는 넘는 offset을 차단하고 마지막 페이지를 상한 도달로 표시한다',async()=>{
 range.mockResolvedValue({data:Array.from({length:100},()=>row),error:null});
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11',offset:900,pageSize:200})).toMatchObject({status:'success',data:{nextOffset:null,limitReached:true}});
 expect(range).toHaveBeenCalledWith(900,999);
 expect(await getAttendanceWorkFailures({storeId:'s',yearMonth:'2026-11',offset:1000})).toMatchObject({status:'preflight_failed'});
});
