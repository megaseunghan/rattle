import { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { approveJoinOnboarding, getJoinOnboarding, getMemberApprovalCandidates } from '../services/storeMembers';
import type { JoinOnboardingInput, JoinOnboardingProfile, MemberApprovalCandidate, MemberApprovalChoice, StoreMember } from '../../types';

export function useMemberApproval() {
  const { user, store } = useAuth();
  const scope = `${user?.id}:${store?.id}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [selection, setSelection] = useState<{
    scope: string; member: StoreMember; candidates: MemberApprovalCandidate[]; profile: JoinOnboardingProfile | null;
  } | null>(null);

  async function prepare(member: StoreMember) {
    if (member.store_id !== store?.id) return null;
    const [candidates, profile] = await Promise.all([getMemberApprovalCandidates(member.id), getJoinOnboarding(member.id)]);
    if (scopeRef.current !== scope) return null;
    setSelection({ scope, member, candidates, profile });
    return null;
  }

  async function confirm(choice: MemberApprovalChoice, review?: JoinOnboardingInput) {
    if (!selection || selection.scope !== scope) return null;
    const input = review ?? selection.profile;
    if (!input) return null;
    const result = await approveJoinOnboarding(selection.member.id, selection.profile?.revision ?? 0, choice, input);
    if (scopeRef.current === scope) setSelection(null);
    return result;
  }

  return { selection: selection?.scope === scope ? selection : null, prepare, confirm, dismiss: () => setSelection(null) };
}
