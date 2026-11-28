/* design-system: DESIGN.md 「직원 정보 수정(S05)」 — 인건비 탭에서 여는 직원 정보. 저장·급여 변경·계좌 보기를 서비스에 잇는다. */
import type { Employee } from '../../../types';
import { revealAccountNumber } from '../../services/accountNumbers';
import { changeEmployeeWage } from '../../services/employees';
import { UserFacingError } from '../../utils/error';
import { EmployeeInfoModal, type EmployeeStoreDefaults } from './EmployeeInfoModal';
import type { EmployeePatch } from './employeeInfoValues';

export interface EmployeeInfoContainerProps {
  employee: Employee;
  store: (EmployeeStoreDefaults & { id: string }) | null | undefined;
  canDeactivate: boolean;
  update: (id: string, patch: EmployeePatch) => Promise<Employee>;
  deactivate: (id: string) => Promise<void>;
  /** 급여 변경 뒤 목록·급여 이력을 다시 받는다. 실패해도 변경은 끝난 것으로 본다. */
  refresh: () => Promise<unknown>;
  onClose: () => void;
}

export function EmployeeInfoContainer({ employee, store, canDeactivate, update, deactivate, refresh, onClose }: EmployeeInfoContainerProps) {
  const part = employee.employment_type === 'part_time';
  return <EmployeeInfoModal employee={employee} store={store} onClose={onClose}
    onSave={patch => update(employee.id, patch)}
    onChangeWage={async ({ amount, effectiveDate }) => {
      if (!store) throw new UserFacingError('매장 정보를 다시 확인해 주세요.');
      await changeEmployeeWage({ storeId: store.id, employeeId: employee.id, effectiveDate,
        baseSalary: part ? 0 : amount, hourlyWage: part ? amount : null, nonTaxable: Number(employee.non_taxable) || 0 });
      try { await refresh(); } catch { /* 변경은 저장됐다. 목록은 다음 조회 때 맞춰진다. */ }
    }}
    onReveal={() => revealAccountNumber('employee', employee.id)}
    onDeactivate={canDeactivate ? () => deactivate(employee.id) : undefined} />;
}
