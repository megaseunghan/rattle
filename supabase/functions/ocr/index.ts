import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROMPT = `이 납품서/영수증 이미지에서 품목 정보를 추출하세요.
반드시 다음 JSON 형식으로만 응답하세요:
{"items":[{"name":"품목명","quantity":숫자,"unit":"단위","unit_price":숫자}]}
- unit은 개/병/캔/팩/봉/박스/kg/g/L/ml/장/묶음 중 하나
- unit_price를 모르면 0
- 다른 설명 없이 JSON만 출력`;

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

    const apiKey = Deno.env.get('GEMINI_FLASH_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_FLASH_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: image_base64 } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { response_mime_type: 'application/json' },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API 오류: ${geminiRes.status} ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"items":[]}';

    let items: unknown[] = [];
    try {
      const parsed = JSON.parse(rawText);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      items = [];
    }

    return new Response(JSON.stringify({ items }), {
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
