import {UserFacingError} from '../utils/error';
export const MEMBER_APPROVAL_MESSAGES = {
 JOIN_HOURLY_WAGE_REQUIRED:'시급을 입력해주세요',
 JOIN_BASE_SALARY_REQUIRED:'월급을 입력해주세요',
 JOIN_WAGE_CONDITION_CHANGED:'급여 조건이 변경됐어요. 후보를 다시 불러온 뒤 확인해주세요',
 JOIN_WAGE_PRESERVE_INVALID:'기존 조건 유지와 새 급여 입력 중 하나를 다시 선택해주세요',
 JOIN_WAGE_HISTORY_REQUIRED:'기존 급여 조건이 없어요. 이번 합류에 적용할 급여를 입력해주세요',
 JOIN_EMPLOYMENT_TYPE_REQUIRED:'근무 형태를 선택해주세요',
 JOIN_EMPLOYEE_REQUIRED:'직원 정보를 다시 불러와주세요',
 EMPLOYEE_FORBIDDEN:'관리 권한과 선택한 매장을 다시 확인해주세요',
 JOIN_PROFILE_INVALID:'근무 조건·입사일·계좌 정보를 다시 확인해주세요',
 INVALID_EMPLOYEE_CONDITIONS:'근무 형태와 급여 조건을 다시 확인해주세요',
} as const;
export type MemberApprovalErrorCode=keyof typeof MEMBER_APPROVAL_MESSAGES;
export class MemberApprovalServiceError extends UserFacingError {
 constructor(public readonly code:MemberApprovalErrorCode) {super(MEMBER_APPROVAL_MESSAGES[code]);this.name='MemberApprovalServiceError';}
}
/** 새로운 공개 계약만 코드로 변환하고 기존 합류 오류 동작은 유지한다. 원문/details/cause를 복사하지 않는다. */
export function mapMemberApprovalError(error:unknown):unknown {
 const value=error as {code?:unknown;message?:unknown}|null;
 for(const token of [value?.code,value?.message]) {
  if(typeof token==='string' && Object.hasOwn(MEMBER_APPROVAL_MESSAGES,token)) return new MemberApprovalServiceError(token as MemberApprovalErrorCode);
 }
 return value?.code==='42501' ? new MemberApprovalServiceError('EMPLOYEE_FORBIDDEN') : error;
}
