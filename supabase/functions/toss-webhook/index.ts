import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// Toss Place 웹훅 수신 (서비스코드 연동 방식)
//  - app.installation.created.v1  → 사업자번호로 매장 매칭 → toss_merchant_id 저장
//  - app.installation.deleted.v1  → 해당 매장 연동 해제
//  - 서명 검증(HMAC-SHA256) 실패 시 401 차단
//  - event id 기준 멱등 처리
// ─────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = Deno.env.get('TOSS_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const INSTALL_TYPE = 'app.installation.created.v1';
const UNINSTALL_TYPE = 'app.installation.deleted.v1';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// HMAC-SHA256(secret, `${timestamp}.${rawBody}`) → "v1=<hex>"
async function computeSignature(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v1=${hex}`;
}

// 타이밍 안전 비교
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const onlyDigits = (v: string | null | undefined) => (v ?? '').replace(/[^0-9]/g, '');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });

  const rawBody = await req.text();
  const signature = req.headers.get('x-toss-signature') ?? '';
  const timestamp = req.headers.get('x-toss-timestamp') ?? '';

  // 1) 서명 검증 (실패 시 차단)
  if (!WEBHOOK_SECRET) {
    console.error('[TossWebhook] TOSS_WEBHOOK_SECRET 미설정');
    return json({ error: 'server misconfigured' }, 500);
  }
  if (!signature || !timestamp) {
    return json({ error: 'missing signature headers' }, 401);
  }
  const expected = await computeSignature(WEBHOOK_SECRET, timestamp, rawBody);
  if (!safeEqual(expected, signature)) {
    console.warn('[TossWebhook] 서명 불일치로 차단');
    return json({ error: 'invalid signature' }, 401);
  }

  // 2) 파싱
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const eventId: string = String(event.id ?? '');
  const type: string = event.type ?? '';
  const merchantId: string = String(event.merchantId ?? event.data?.merchant?.id ?? '');
  console.log(`[TossWebhook] type=${type} merchantId=${merchantId} eventId=${eventId}`);

  // 3) 멱등: 이미 처리한 이벤트면 스킵 (2xx로 응답해 재전송 종료)
  if (eventId) {
    const { error: insErr } = await admin
      .from('toss_webhook_events')
      .insert({ event_id: eventId, event_type: type });
    if (insErr) {
      // 중복 키(23505) = 이미 처리됨
      if (insErr.code === '23505') {
        console.log('[TossWebhook] 중복 이벤트 스킵');
        return json({ received: true, duplicated: true });
      }
      console.error('[TossWebhook] 이벤트 기록 실패:', insErr.message);
    }
  }

  try {
    if (type === INSTALL_TYPE) {
      await handleInstall(merchantId, event);
    } else if (type === UNINSTALL_TYPE) {
      await handleUninstall(merchantId);
    } else {
      console.log(`[TossWebhook] 미처리 이벤트 타입: ${type}`);
    }
  } catch (e) {
    console.error('[TossWebhook] 처리 오류:', String(e));
    // 5xx면 토스가 재전송 → 멱등 기록 삭제해 다음 재전송 때 재처리
    if (eventId) await admin.from('toss_webhook_events').delete().eq('event_id', eventId);
    return json({ error: 'processing failed' }, 500);
  }

  return json({ received: true });
});

// 설치: 사업자번호로 매장 매칭 → toss_merchant_id 저장, 못 찾으면 미매칭 큐
async function handleInstall(merchantId: string, event: any) {
  const m = event.data?.merchant ?? {};
  const bizDigits = onlyDigits(m.businessNumber);

  if (bizDigits) {
    // stores.business_number를 정규화해 비교 (RPC로 서버측 정규화)
    const { data: matched, error } = await admin
      .rpc('find_store_by_biznum', { p_biznum: bizDigits });
    if (error) throw new Error(`매장 조회 실패: ${error.message}`);

    if (matched && matched.length > 0) {
      const storeId = matched[0].id;
      const { error: upErr } = await admin
        .from('stores')
        .update({ toss_merchant_id: merchantId })
        .eq('id', storeId);
      if (upErr) throw new Error(`연동 저장 실패: ${upErr.message}`);
      console.log(`[TossWebhook] 매칭 성공: store=${storeId} ← merchant=${merchantId}`);
      // 큐에 남아있던 항목 정리
      await admin.from('toss_pending_installations')
        .update({ status: 'matched', matched_store_id: storeId })
        .eq('toss_merchant_id', merchantId);
      return;
    }
  }

  // 미매칭 → 큐에 보관 (관리자/가맹점이 나중에 매칭)
  console.log(`[TossWebhook] 미매칭 → 큐 보관 merchant=${merchantId}`);
  await admin.from('toss_pending_installations').upsert({
    toss_merchant_id: merchantId,
    business_number: m.businessNumber ?? null,
    merchant_name: m.name ?? m.displayName ?? null,
    owner_name: m.ownerName ?? null,
    phone_number: m.phoneNumber ?? null,
    address: m.address ?? null,
    raw_payload: event,
    status: 'pending',
  }, { onConflict: 'toss_merchant_id' });
}

// 해제: 해당 merchantId로 연동된 매장의 연동 해제
async function handleUninstall(merchantId: string) {
  if (!merchantId) return;
  const { error } = await admin
    .from('stores')
    .update({ toss_merchant_id: null })
    .eq('toss_merchant_id', merchantId);
  if (error) throw new Error(`연동 해제 실패: ${error.message}`);
  await admin.from('toss_pending_installations')
    .update({ status: 'ignored' })
    .eq('toss_merchant_id', merchantId);
  console.log(`[TossWebhook] 연동 해제 완료 merchant=${merchantId}`);
}
