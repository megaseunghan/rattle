import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createDeleteAccountHandler } from './handler.ts';
import { processAccountUnlinks } from '../_shared/accountUnlinks.ts';
import { revokeAppleAuthorization } from '../_shared/appleUnlink.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const clientFor = (header: string) => createClient(url, anonKey, { global: { headers: { Authorization: header } }, auth: { persistSession: false } });
serve(createDeleteAccountHandler({
  authorize: async header => {
    const { data, error } = await clientFor(header).auth.getUser();
    return error ? null : data.user?.id ?? null;
  },
  assertDeletable: async header => {
    const { error } = await clientFor(header).rpc('assert_account_deletable');
    if (error) throw error;
  },
  deleteAuthUser: async userId => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
  revokeApple: async (userId, code) => {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) throw new Error('account_identity_lookup_failed');
    const apple = data.user.identities?.find(identity => identity.provider === 'apple');
    if (!apple) return;
    const subject = apple.identity_data?.sub ?? apple.id;
    if (typeof subject !== 'string' || !subject) throw new Error('apple_identity_missing');
    await revokeAppleAuthorization(subject, code, {
      clientId: Deno.env.get('APPLE_NATIVE_CLIENT_ID') ?? '',
      teamId: Deno.env.get('APPLE_TEAM_ID') ?? '',
      keyId: Deno.env.get('APPLE_KEY_ID') ?? '',
      privateKey: Deno.env.get('APPLE_PRIVATE_KEY') ?? '',
    });
  },
  unlinkPending: userId => processAccountUnlinks(admin, Deno.env.get('KAKAO_ADMIN_KEY') ?? '', userId),
  report: event => console.error(JSON.stringify({ event })),
}));
