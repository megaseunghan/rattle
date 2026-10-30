import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processAccountUnlinks } from './accountUnlinks.ts';
function fixture(ackError = false) {
  const calls: string[] = [];
  const db = {
    rpc: async () => ({ data: [{ id: 'job', provider_subject: 'fixture-id' }], error: null }),
    from: () => ({
      delete: () => ({ eq: async () => { calls.push('ack'); return { error: ackError ? { message: 'fixture' } : null }; } }),
      update: () => ({ eq: async () => { calls.push('retain'); return { error: null }; } }),
    }),
  } as unknown as SupabaseClient;
  return { db, calls };
}
async function run(status: number, body: unknown, expected: string[], fail: boolean, ackError = false, key = 'fixture-key') {
  const { db, calls } = fixture(ackError);
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(Response.json(body, { status }));
  let failed = false;
  try { await processAccountUnlinks(db, key); } catch { failed = true; }
  finally { globalThis.fetch = original; }
  if (JSON.stringify(calls) !== JSON.stringify(expected) || failed !== fail) throw new Error('unexpected unlink outcome');
}
Deno.test('외부 성공 이후에만 작업 삭제', () => run(200, { id: 'fixture-id' }, ['ack'], false));
Deno.test('이미 연결 해제된 계정의 재시도 완료', () => run(400, { code: -101 }, ['ack'], false));
Deno.test('외부 인증 실패는 재처리 항목 유지', () => run(401, { code: -401 }, ['retain'], true));
Deno.test('외부 성공 후 DB 삭제 실패도 재처리 항목 유지', () => run(200, {}, ['ack', 'retain'], true, true));
Deno.test('설정이 없으면 재처리 항목 유지', () => run(200, {}, ['retain'], true, false, ''));
