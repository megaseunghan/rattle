import { Employee } from '../../types';

/**
 * 로그인 계정 기준 "나"에 해당하는 직원 레코드를 찾는다.
 * 관리자가 테스트 미리보기(devPreviewEmployeeId)를 켜둔 상태면 실제 계정 대신 선택된 직원을 반환한다 —
 * 모든 화면이 이 함수 하나로 미리보기를 일관되게 반영하도록 한다.
 */
export function resolveSelfEmployee(
  employees: Employee[],
  userId: string | undefined,
  previewEmployeeId: string | null,
): Employee | undefined {
  if (previewEmployeeId) return employees.find(e => e.id === previewEmployeeId);
  return employees.find(e => e.user_id === userId);
}
