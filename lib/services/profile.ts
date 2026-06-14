import { supabase } from '../supabase';

/**
 * 개인 프로필(실명·연락처) 수정.
 * 전역 정체성은 auth user_metadata(full_name/phone)에 저장하고,
 * 멤버 목록·급여 표시 정합을 위해 본인 store_members 행도 동기화(best-effort).
 */
export async function updateUserProfile(params: {
  name: string;
  phone: string | null;
}): Promise<void> {
  const { name, phone } = params;

  const { data, error } = await supabase.auth.updateUser({
    data: { full_name: name, phone },
  });
  if (error) throw error;

  const userId = data.user?.id;
  if (userId) {
    // 본인 멤버 행 동기화 (실패해도 프로필 저장 자체는 성공으로 간주)
    await supabase
      .from('store_members')
      .update({ applicant_name: name, phone })
      .eq('user_id', userId);
  }
}

/** 비밀번호 변경 */
export async function updateUserPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
