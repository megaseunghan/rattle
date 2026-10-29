import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Auth 삭제와 함께 생성된 항목만 처리한다. 성공 시 외부 ID도 삭제한다. */
export async function processAccountUnlinks(admin: SupabaseClient, kakaoAdminKey: string, userId?: string) {
  const { data, error } = await admin.rpc('claim_account_unlinks', { p_user_id: userId ?? null });
  if (error) throw new Error('unlink_claim_failed');
  let failed = false;
  for (const job of data ?? []) {
    try {
      if (!kakaoAdminKey) throw new Error('unlink_configuration_missing');
      const response = await fetch('https://kapi.kakao.com/v1/user/unlink', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `KakaoAK ${kakaoAdminKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ target_id_type: 'user_id', target_id: job.provider_subject }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        // 카카오 -101은 이미 앱과 연결되지 않은 계정이다. 재처리의 완료 상태로 본다.
        if (response.status !== 400 || body?.code !== -101) throw new Error('unlink_upstream_failed');
      }
      const { error: deleteError } = await admin.from('account_unlink_jobs').delete().eq('id', job.id);
      if (deleteError) throw new Error('unlink_ack_failed');
    } catch {
      failed = true;
      const { error: saveError } = await admin.from('account_unlink_jobs').update({ last_error_code: 'unlink_failed' }).eq('id', job.id);
      if (saveError) console.error(JSON.stringify({ event: 'account_unlink_status_failed' }));
    }
  }
  if (failed) throw new Error('unlink_pending');
}
