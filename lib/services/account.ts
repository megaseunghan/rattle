import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';
import { requestAppleCredential } from './socialAuth';

export async function deleteAccount(): Promise<void> {
  const { data: account, error: accountError } = await supabase.auth.getUser();
  if (accountError || !account.user) throw new UserFacingError('다시 로그인한 뒤 탈퇴해주세요.');
  const apple = account.user.identities?.find(identity => identity.provider === 'apple');
  let appleAuthorizationCode: string | undefined;
  if (apple) {
    const { credential } = await requestAppleCredential();
    if (!credential.authorizationCode || credential.user !== (apple.identity_data?.sub ?? apple.id)) {
      throw new UserFacingError('가입할 때 사용한 Apple 계정으로 인증해주세요.');
    }
    appleAuthorizationCode = credential.authorizationCode;
  }
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { appleAuthorizationCode } });
  if (error) {
    if (error.context instanceof Response) {
      const body = await error.context.clone().json().catch(() => null);
      if (body?.code === 'ACCOUNT_OWNS_STORES') {
        throw new UserFacingError('매장 정보에서 빈 매장을 삭제하거나, 멤버 관리에서 소유권을 이전한 뒤 탈퇴해주세요.');
      }
      if (body?.code === 'APPLE_REAUTH_REQUIRED' || body?.code === 'APPLE_ACCOUNT_MISMATCH') {
        throw new UserFacingError('가입할 때 사용한 Apple 계정으로 다시 인증해주세요.');
      }
      if (body?.code === 'APPLE_UNLINK_FAILED') {
        throw new UserFacingError('Apple 연결을 해제하지 못했어요. 잠시 후 다시 시도해주세요.');
      }
    }
    throw new UserFacingError('탈퇴하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (data?.success !== true) throw new UserFacingError('탈퇴 결과를 확인하지 못했어요. 다시 로그인해 확인해주세요.');
}
