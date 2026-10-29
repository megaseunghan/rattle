import { regularEmployeesForAccrual, accruedRegularPayroll, buildRegularWageSnapshot, normalizeWageHistory, regularSnapshotGross, regularSnapshotNonTaxable } from '../../lib/utils/regularWages';
import type { Employee, Payroll, WageHistory } from '../../types';
const employee = { id:'e',store_id:'s',joined_at:'2026-01-01',created_at:'2026-01-01T00:00:00Z',base_salary:3100000,non_taxable:200000,hourly_wage:null } as Employee;
const rate=(date:string,base=3100000,id=date)=>({ id, employee_id:'e',store_id:'s',effective_date:date,base_salary:base,non_taxable:200000,hourly_wage:null,created_at:date+'T00:00:00Z' } as WageHistory);
it('first known rate starts at hire date and later changes retain their dates',()=>{
 const history=[rate('2026-01-15'),rate('2026-02-15',3400000)];
 expect(normalizeWageHistory(employee,history).map(x=>[x.effective_date,x.base_salary])).toEqual([['2026-01-01',3100000],['2026-01-15',3100000],['2026-02-15',3400000]]);
 expect(history).toHaveLength(2);
});
it('no history uses initial employee rate, no days before hire',()=>{
 const e={...employee,joined_at:'2026-01-15'};
 const snapshot=buildRegularWageSnapshot(e,[],'2026-01');
 expect(snapshot.days).toHaveLength(17);
 expect(regularSnapshotGross(snapshot)).toBe(1700000);
});
it('midmonth raise divides calendar days and saved snapshot ignores later wage changes',()=>{
 const snap=buildRegularWageSnapshot(employee,[rate('2026-01-01'),rate('2026-01-16',6200000)],'2026-01');
 expect(regularSnapshotGross(snap)).toBe(4700000);
 expect(regularSnapshotGross(snap,'2026-01-20')).toBe(2500000);
 const payroll={gross:4700000,regular_wage_snapshot:snap} as unknown as Payroll;
 expect(accruedRegularPayroll({...employee,base_salary:9300000},[rate('2026-01-01',9300000)],payroll,'2026-01',new Date('2026-01-20T03:00:00Z'))).toBe(2500000);
 expect(accruedRegularPayroll(employee,[],payroll,'2026-01',new Date('2026-02-01T03:00:00Z'))).toBe(4700000);
});
it('legacy saved gross remains original while current accrual is prorated',()=>{
 const payroll={gross:3100000} as Payroll;
 expect(accruedRegularPayroll(employee,[],payroll,'2026-01',new Date('2026-01-10T03:00:00Z'))).toBe(1000000);
 expect(payroll.gross).toBe(3100000);
 expect(accruedRegularPayroll(employee,[],payroll,'2026-01',new Date('2025-12-31T03:00:00Z'))).toBe(0);
});
it('Korean day boundary and leap-month divisor are stable',()=>{
 const e={...employee,joined_at:'2024-02-01',base_salary:2900000};
 expect(accruedRegularPayroll(e,[],undefined,'2024-02',new Date('2024-02-09T15:00:00Z'))).toBe(1000000);
});
it('latest same-date version is the baseline and invalid amount cannot silently become zero',()=>{
 const history=[rate('2026-01-15',3100000,'a'),{...rate('2026-01-15',3200000,'b'),created_at:'2026-01-15T01:00:00Z'}];
 expect(normalizeWageHistory(employee,history)[0].base_salary).toBe(3200000);
 expect(()=>buildRegularWageSnapshot({...employee,base_salary:NaN},[],'2026-01')).toThrow('INVALID_WAGE_RATE');
});

it('non-taxable allowance follows saved date-specific conditions, not current employee values',()=>{
 const before={...rate('2026-01-01'),non_taxable:310000};
 const after={...rate('2026-01-16'),non_taxable:620000};
 const snapshot=buildRegularWageSnapshot(employee,[before,after],'2026-01');
 expect(regularSnapshotNonTaxable(snapshot)).toBe(470000);
 const joined=buildRegularWageSnapshot({...employee,joined_at:'2026-01-16'},[before],'2026-01');
 expect(regularSnapshotNonTaxable(joined)).toBe(160000);
});

it('detached saved regular slips remain in totals and legacy current month is prorated',()=>{
 const payroll={gross:3100000} as Payroll;
 expect(accruedRegularPayroll(undefined,[],payroll,'2026-01',new Date('2026-01-10T03:00:00Z'))).toBe(1000000);
 expect(accruedRegularPayroll(undefined,[],payroll,'2026-01',new Date('2026-02-01T03:00:00Z'))).toBe(3100000);
 expect(payroll.gross).toBe(3100000);
});

it('a saved hourly month does not accrue again after the employee becomes salaried', () => {
 const changed = { ...employee, employment_type: 'regular' } as Employee;
 const other = { ...employee, id: 'other', employment_type: 'regular' } as Employee;
 const hourly = { employee_id: changed.id, gross: 120000, applied_hourly_wage: 12000 } as Payroll;
 expect(regularEmployeesForAccrual([changed, other], [hourly]).map(row => row.id)).toEqual(['other']);
 expect(regularEmployeesForAccrual([changed], [])).toEqual([changed]);
});
