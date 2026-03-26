import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { image_base64 } = await req.json();

    if (!image_base64) {
      return new Response(JSON.stringify({ error: 'image_base64 is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const clovaUrl = Deno.env.get('CLOVA_OCR_URL');
    const clovaKey = Deno.env.get('CLOVA_OCR_API_KEY');

    if (!clovaUrl || !clovaKey) {
      throw new Error('CLOVA_OCR_URL 또는 CLOVA_OCR_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const body = {
      version: 'V2',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      images: [{ format: 'jpg', name: 'receipt', data: image_base64 }],
    };

    const clovaRes = await fetch(clovaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': clovaKey,
      },
      body: JSON.stringify(body),
    });

    if (!clovaRes.ok) {
      throw new Error(`Clova OCR 오류: ${clovaRes.status}`);
    }

    const clovaData = await clovaRes.json();

    // 텍스트 원본만 추출하여 반환 (파싱은 앱에서 처리)
    const fields = clovaData?.images?.[0]?.fields ?? [];
    const text = fields.map((f: { inferText: string }) => f.inferText).join('\n');

    return new Response(JSON.stringify({ text, fields }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
