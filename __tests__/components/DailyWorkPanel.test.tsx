import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DailyWorkPanel } from '../../lib/components/DailyWorkPanel';
import { Employee, DailyWorkRecord } from '../../types';
const mockSave = jest.fn();
const mockReview = jest.fn();
const mockApply = jest.fn();
const mockRefetch = jest.fn();
let mockRows: DailyWorkRecord[] = [];
let mockLoading = false;
let mockError: string | null = null;
const employee = { id: 'e', store_id: 's', name: '파트', employment_type: 'part_time' } as Employee;
jest.mock('../../lib/services/payroll', () => ({ getMyPayroll: jest.fn().mockResolvedValue(null) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
jest.mock('../../lib/hooks/useDailyWork', () => ({ useDailyWork: () => ({ rows: mockRows, loading: mockLoading, error: mockError, refetch: mockRefetch }) }));
jest.mock('../../lib/services/dailyWork', () => ({
  saveDailyWork: (...args: unknown[]) => mockSave(...args), reviewDailyWork: (...args: unknown[]) => mockReview(...args), applyDailyPayroll: (...args: unknown[]) => mockApply(...args),
  getDailyWorkHistory: jest.fn().mockResolvedValue([]),
  parseDailyMinutes: (value: string) => { if (!/^\d+$/.test(value) || Number(value)>1440) throw new Error('하루 근무시간을 확인해 주세요.'); return Number(value); },
  dailyWorkTotals: (rows: DailyWorkRecord[]) => ({ minutes: rows.filter(r=>r.status==='approved').reduce((n,r)=>n+r.worked_minutes,0), gross: rows.filter(r=>r.status==='approved').reduce((n,r)=>n+r.gross,0), pending: rows.filter(r=>r.status!=='approved').length }),
}));
const row = { id: 'd', store_id: 's', employee_id: 'e', revision: 3, work_date: '2026-10-02', worked_minutes: 480, applied_hourly_wage: 12000, gross: 96000, note: '휴게 제외', status: 'approved', updated_at:'', submitted_by:'u',reviewed_by:null,review_note:null } as DailyWorkRecord;
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-26T12:00:00Z').getTime()); jest.clearAllMocks(); mockRows=[];mockLoading=false;mockError=null;mockRefetch.mockResolvedValue(true);mockSave.mockResolvedValue(row); });
test('self form sends only date minutes note; no editable rate or approval control', async () => {
  render(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin={false} />);
  fireEvent.changeText(screen.getByLabelText('근무일'),'2026-10-02');
  fireEvent.changeText(screen.getByLabelText('실근무 시간 (분)'),'480');
  fireEvent.changeText(screen.getByLabelText('일별 근무 입력 근거'),'휴게 제외');
  fireEvent.press(screen.getByText('관리자에게 제출'));
  await waitFor(()=>expect(mockSave).toHaveBeenCalledWith('e','2026-10-02','480','휴게 제외',undefined));
  expect(screen.queryByText('확인된 일별 기록을 월 급여에 반영')).toBeNull();
  expect(screen.getByText('관리자 확인 대기로 제출했어요.')).toBeTruthy();
});
test('invalid minutes do not write and refetch does not erase draft', async () => {
  const { rerender }=render(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin />);
  fireEvent.changeText(screen.getByLabelText('실근무 시간 (분)'),'1441');
  fireEvent.changeText(screen.getByLabelText('일별 근무 입력 근거'),'남아야 할 입력');
  fireEvent.press(screen.getByText('일별 근무시간 저장'));
  expect(mockSave).not.toHaveBeenCalled();
  mockLoading=true;rerender(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin />);
  mockLoading=false;mockError='재조회 실패';rerender(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin />);
  expect(screen.getByDisplayValue('1441')).toBeTruthy();expect(screen.getByDisplayValue('남아야 할 입력')).toBeTruthy();
});
test('editing a saved day carries its revision and original rate stays visible', async () => {
  mockRows=[row];
  render(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin />);
  fireEvent.press(screen.getByText('2026-10-02 수정'));
  fireEvent.changeText(screen.getByLabelText('실근무 시간 (분)'),'420');
  fireEvent.press(screen.getByText('일별 근무시간 저장'));
  await waitFor(()=>expect(mockSave).toHaveBeenCalledWith('e','2026-10-02','420','휴게 제외',3));
  expect(screen.getByText(/저장 당시 시급 12,000원/)).toBeTruthy();
});
test('preview disables writes, including edit and approve', () => {
  mockRows=[{...row,status:'pending'}];
  render(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin readOnly />);
  fireEvent.press(screen.getByText('일별 근무시간 저장'));
  fireEvent.press(screen.getByText('2026-10-02 확인'));
  expect(mockSave).not.toHaveBeenCalled();expect(mockReview).not.toHaveBeenCalled();expect(mockApply).not.toHaveBeenCalled();
});
test('save success and reload failure stays saved, duplicate tap blocked while pending', async () => {
  let resolve: (value: DailyWorkRecord)=>void = ()=>{};
  mockSave.mockImplementation(()=>new Promise(r=>{resolve=r;}));mockRefetch.mockResolvedValue(false);
  render(<DailyWorkPanel employee={employee} yearMonth="2026-10" isAdmin={false} />);
  fireEvent.changeText(screen.getByLabelText('근무일'),'2026-10-02');
  fireEvent.changeText(screen.getByLabelText('실근무 시간 (분)'),'480');
  fireEvent.changeText(screen.getByLabelText('일별 근무 입력 근거'),'휴게 제외');
  const submit = screen.getByText('관리자에게 제출');
  fireEvent.press(submit);fireEvent.press(submit);
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async()=>resolve(row));
  await waitFor(()=>expect(screen.getByText('저장은 완료됐어요. 목록을 다시 불러와 주세요.')).toBeTruthy());
});

afterEach(() => jest.restoreAllMocks());
