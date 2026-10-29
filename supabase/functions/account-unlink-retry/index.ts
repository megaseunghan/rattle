import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processAccountUnlinks } from '../_shared/accountUnlinks.ts';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });
serve(async req => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  // 개발자가 수동 호출하는 서비스 전용 처리 도구. 일반 사용자 JWT는 허용하지 않는다.
  if (!serviceKey || req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return new Response(null, { status: 401 });
  try {
    await processAccountUnlinks(admin, Deno.env.get('KAKAO_ADMIN_KEY') ?? '');
    return Response.json({ success: true });
  } catch {
    console.error(JSON.stringify({ event: 'account_unlink_retry_failed' }));
    return Response.json({ code: 'RETRY_PENDING' }, { status: 503 });
  }
});
