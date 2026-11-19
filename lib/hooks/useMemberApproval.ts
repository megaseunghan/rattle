import { usePreviewWriteGuard } from './usePreviewWriteGuard';
import { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { approveJoinOnboarding, getJoinOnboarding, getMemberApprovalCandidates } from '../services/storeMembers';
import { mapMemberApprovalError, MemberApprovalServiceError } from '../services/memberApprovalErrors';
import type { JoinOnboardingReview, JoinOnboardingProfile, MemberApprovalCandidate, MemberApprovalChoice, StoreMember } from '../../types';

export function useMemberApproval() {
  const { assertCanWrite } = usePreviewWriteGuard();
  const { user, store, canManageStore, permissionRevision } = useAuth();
  const scope = `${user?.id}:${store?.id}:${permissionRevision}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [selection, setSelection] = useState<{
    scope: string; member: StoreMember; candidates: MemberApprovalCandidate[]; profile: JoinOnboardingProfile | null;
  } | null>(null);

  async function prepare(member: StoreMember) {
    if (!canManageStore || member.store_id !== store?.id) return null;
    const [candidates, profile] = await Promise.all([getMemberApprovalCandidates(member.id), getJoinOnboarding(member.id)]);
    if (scopeRef.current !== scope) return null;
    setSelection({ scope, member, candidates, profile });
    return null;
  }

  async function confirm(choice: MemberApprovalChoice, review?: JoinOnboardingReview) {
    assertCanWrite();
    if (!canManageStore || !selection || selection.scope !== scope) return null;
    const input = review ?? selection.profile;
    if (!input) return null;
    if ('preserve_existing_wage' in input) {
      if (choice.kind !== 'rehire') throw new MemberApprovalServiceError('JOIN_WAGE_PRESERVE_INVALID');
      const candidate = selection.candidates.find(row => row.id === choice.employeeId);
      const linkedElsewhere = selection.candidates.some(row => row.is_applicant_account) && !candidate?.is_applicant_account;
      if (!candidate || candidate.is_active || candidate.has_other_account || linkedElsewhere || candidate.wage_condition_valid !== true
        || !candidate.existing_wage || !candidate.wage_history_id || candidate.wage_history_id !== input.wage_history_id) {
        throw new MemberApprovalServiceError('JOIN_WAGE_CONDITION_CHANGED');
      }
    }
    let result;
    try { result = await approveJoinOnboarding(selection.member.id, selection.profile?.revision ?? 0, choice, input); }
    catch (error) { throw mapMemberApprovalError(error); }
    if (scopeRef.current === scope) setSelection(null);
    return result;
  }

  return { selection: selection?.scope === scope ? selection : null, prepare, confirm, dismiss: () => setSelection(null) };
}
