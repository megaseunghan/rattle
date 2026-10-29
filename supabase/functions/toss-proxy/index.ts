import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createTossProxyHandler } from './handler.ts';

serve(createTossProxyHandler({
  accessKey: Deno.env.get('TOSS_ACCESS_KEY') ?? '',
  accessSecret: Deno.env.get('TOSS_ACCESS_SECRET') ?? '',
  async authorize(token, merchantId) {
    // 사용자 JWT로 조회해 RLS도 적용한다. 서비스 역할 키는 사용하지 않는다.
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return 401;
    const stores = await client.from('stores').select('id, owner_id').eq('toss_merchant_id', merchantId);
    if (stores.error) throw new Error('Store lookup failed');
    for (const store of stores.data ?? []) {
      if (store.owner_id === user.id) return 200;
      const access = await client.rpc('can_read_store_financials', { p_store_id: store.id });
      if (access.error || access.data !== true) continue;
      const membership = await client.from('store_members').select('id')
        .eq('store_id', store.id).eq('user_id', user.id).eq('status', 'approved').limit(1);
      if (membership.error) throw new Error('Membership lookup failed');
      if (membership.data?.length) return 200;
    }
    return 403;
  },
  fetchUpstream: fetch,
}));
