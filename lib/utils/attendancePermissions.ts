import type { EmploymentType } from '../../types';

export interface AttendanceReviewAccess {
  store: { id: string; ownerId: string; isActive: boolean };
  actor: {
    userId: string | null;
    storeId: string;
    role: 'owner' | 'manager' | 'employee' | 'part_timer' | 'admin' | 'member' | null;
    /** getMyStoreAccess의 can_manage_store. 조회 실패/미완료는 false. */
    canManageStore?: boolean;
    membershipApproved: boolean;
    employmentType: EmploymentType | null;
    isActiveEmployee: boolean;
  };
  target: {
    userId: string | null;
    storeId: string;
    employmentType: EmploymentType;
    /** 이전 호출부 호환용이며 새 권한 판정에는 사용하지 않는다. */
    isApprovedAdmin: boolean | null;
  };
}
/** 승인·반려·직접 기록의 버튼 표시용이다. 실제 권한은 RPC가 현재 상태로 다시 검사한다. */
export function canReviewAttendanceEmployee({ store, actor, target }: AttendanceReviewAccess): boolean {
  if (!store.isActive || actor.canManageStore !== true || !actor.userId || actor.storeId !== store.id || target.storeId !== store.id) return false;
  // 역할 미리보기 라벨이 아닌 실제 매장 owner_id와 계정으로 판별한다.
  if (actor.userId === store.ownerId) return true;
  return actor.role === 'manager' && actor.membershipApproved && actor.isActiveEmployee
    && target.userId !== actor.userId;
}
