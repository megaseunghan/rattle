import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KAKAO_UNLINK_URL = 'https://kapi.kakao.com/v1/user/unlink';

interface SocialProvider {
  unlink(identityData: Record<string, unknown>): Promise<void>;
}

const SOCIAL_PROVIDERS: Record<string, SocialProvider> = {
  kakao: {
    async unlink(identityData) {
      const kakaoUserId = identityData?.sub;
      const adminKey = Deno.env.get('KAKAO_ADMIN_KEY');
      if (!kakaoUserId || !adminKey) return;

      await fetch(KAKAO_UNLINK_URL, {
        method: 'POST',
        headers: {
          Authorization: `KakaoAK ${adminKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          target_id_type: 'user_id',
          target_id: String(kakaoUserId),
        }).toString(),
      });
    },
  },
  // google: {
  //   async unlink(identityData) { ... },
  // },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 요청 유저 확인 (anon key로)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 소셜 로그인 연결 끊기 (프로바이더별 처리)
    for (const identity of user.identities ?? []) {
      const provider = SOCIAL_PROVIDERS[identity.provider];
      if (!provider) continue;
      await provider.unlink(identity.identity_data ?? {}).catch(() => { /* 실패해도 탈퇴 계속 진행 */ });
    }

    // 데이터 삭제 (RPC)
    const { error: rpcError } = await supabase.rpc('delete_user_data');
    if (rpcError) throw rpcError;

    // Auth 계정 삭제
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : '탈퇴 처리 실패' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
