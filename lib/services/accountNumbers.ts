import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';

/** 계좌번호는 서버에서 암호화해 보관한다. 화면에는 끝 4자리만 보이고, 전체 번호는 필요할 때 이 함수로 받는다. */
export type AccountOwnerKind = 'employee' | 'daily_laborer' | 'join_profile';

export function maskedAccount(last4: string | null | undefined): string | null {
  return last4 ? `•••• ${last4}` : null;
}

/** 권한: 직원 계좌는 사장·점장과 본인, 일용근로자는 사장·점장, 합류 신청은 사장·점장과 신청자 본인. */
export async function revealAccountNumber(kind: AccountOwnerKind, id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('reveal_account_number', { p_kind: kind, p_id: id });
  if (error) {
    if (error.code === '42501') throw new UserFacingError('계좌번호를 볼 수 있는 권한이 없어요.');
    throw new UserFacingError('계좌번호를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
  return typeof data === 'string' && data ? data : null;
}
