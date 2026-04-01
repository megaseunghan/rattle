import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOSS_BASE_URL = 'https://api.tossplace.com/api-public/openapi/v1';
const ACCESS_KEY = Deno.env.get('TOSS_ACCESS_KEY') ?? '';
const ACCESS_SECRET = Deno.env.get('TOSS_ACCESS_SECRET') ?? '';

serve(async (req) => {
  // 인증 검증
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { path } = await req.json();
  if (!path) {
    return new Response(JSON.stringify({ error: 'path is required' }), { status: 400 });
  }

  const tossRes = await fetch(`${TOSS_BASE_URL}${path}`, {
    headers: {
      'x-access-key': ACCESS_KEY,
      'x-secret-key': ACCESS_SECRET,
      'Content-Type': 'application/json',
    },
  });

  const body = await tossRes.json();
  return new Response(JSON.stringify(body), {
    status: tossRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
