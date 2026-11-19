import { canReviewAttendanceEmployee, AttendanceReviewAccess } from '../../lib/utils/attendancePermissions';
const context: AttendanceReviewAccess = {
  store: { id: 's', ownerId: 'owner', isActive: true },
  actor: { userId: 'manager', storeId: 's', role: 'manager', membershipApproved: true, employmentType: 'part_time', isActiveEmployee: true, canManageStore: true },
  target: { userId: 'staff', storeId: 's', employmentType: 'regular', isApprovedAdmin: false },
};
it.each(['regular', 'part_time'] as const)('점장의 고용형태 %s와 무관하게 타인 기록을 처리한다', employmentType => {
  expect(canReviewAttendanceEmployee({ ...context, actor: { ...context.actor, employmentType } })).toBe(true);
});
it('점장은 사장과 미연결 직원 기록도 처리한다', () => {
  for (const userId of ['owner', null]) expect(canReviewAttendanceEmployee({ ...context, target: { ...context.target, userId } })).toBe(true);
});
it('점장 본인 기록은 처리하지 않는다', () => {
  expect(canReviewAttendanceEmployee({ ...context, target: { ...context.target, userId: 'manager' } })).toBe(false);
});
it('사장은 본인 포함 전부 처리한다', () => {
  expect(canReviewAttendanceEmployee({ ...context, actor: { ...context.actor, userId: 'owner', role: 'owner' }, target: { ...context.target, userId: 'owner' } })).toBe(true);
});
it.each(['admin','member','employee','part_timer',null] as const)('기존 admin·직원·PT %s는 처리할 수 없다', role => {
  expect(canReviewAttendanceEmployee({ ...context, actor: { ...context.actor, role } })).toBe(false);
});
it.each([{ canManageStore: false },{ canManageStore: undefined },{ membershipApproved: false },{ isActiveEmployee: false },{ userId: null },{ storeId: 'other' }])('닫힌 권한 %j는 처리하지 않는다', actor => {
  expect(canReviewAttendanceEmployee({ ...context, actor: { ...context.actor, ...actor } })).toBe(false);
});
it('타매장 대상·삭제 매장은 처리하지 않는다', () => {
  expect(canReviewAttendanceEmployee({ ...context, target: { ...context.target, storeId: 'other' } })).toBe(false);
  expect(canReviewAttendanceEmployee({ ...context, store: { ...context.store, isActive: false } })).toBe(false);
});
it('사장도 권한 조회 실패 상태에서는 버튼을 열지 않는다', () => {
  expect(canReviewAttendanceEmployee({ ...context, actor: { ...context.actor, userId: 'owner', role: 'owner', canManageStore: false } })).toBe(false);
});
