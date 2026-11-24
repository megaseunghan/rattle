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

/**
 * "나"의 직원 ID만 바로 정한다(홈 출퇴근 조회를 직원 목록·시급보다 먼저 시작하기 위함).
 * 평소에는 권한 응답(`get_my_store_access`)의 본인 활성 직원 ID를 쓴다.
 * 관리자 미리보기 중에는 목록에 실제로 있는 직원만 쓴다(연결 안 된 미리보기 표시값으로 조회하지 않는다).
 */
export function resolveSelfEmployeeId(
  accessEmployeeId: string | null | undefined,
  previewEmployeeId: string | null,
  employees: Employee[],
): string | undefined {
  if (previewEmployeeId) return employees.find(e => e.id === previewEmployeeId)?.id;
  return accessEmployeeId ?? undefined;
}
