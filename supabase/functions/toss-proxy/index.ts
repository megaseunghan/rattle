import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TOSS_BASE_URL = 'https://open-api.tossplace.com/api-public/openapi/v1';
const ACCESS_KEY = Deno.env.get('TOSS_ACCESS_KEY') ?? '';
const ACCESS_SECRET = Deno.env.get('TOSS_ACCESS_SECRET') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS 프리플라이트 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let path: string;
  let method: string = 'GET';
  let requestBody: any = null;

  try {
    const body = await req.json();
    path = body.path;
    method = body.method ?? 'GET';
    requestBody = body.body ?? null; // Toss API로 전달할 실제 데이터
  } catch {
    return new Response(JSON.stringify({ error: '유효하지 않은 요청 본문입니다.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!path) {
    return new Response(JSON.stringify({ error: 'path 파라미터가 필요합니다.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = `${TOSS_BASE_URL}${path}`;
  console.log(`[TossProxy] ${method} 요청: ${targetUrl}`);

  try {
    const fetchOptions: RequestInit = {
      method: method,
      headers: {
        'x-access-key': ACCESS_KEY,
        'x-secret-key': ACCESS_SECRET,
        'Content-Type': 'application/json',
      },
    };

    if (requestBody && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(requestBody);
    }

    const tossRes = await fetch(targetUrl, fetchOptions);
    console.log(`[TossProxy] 응답 상태: ${tossRes.status}`);

    const text = await tossRes.text();
    let responseData: any;
    
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { 
        error: 'JSON 형식이 아닌 응답입니다.', 
        status: tossRes.status, 
        preview: text.slice(0, 500) 
      };
    }

    if (!tossRes.ok) {
      console.error(`[TossProxy] API 에러 발생: ${JSON.stringify(responseData)}`);
    }

    return new Response(JSON.stringify(responseData), {
      status: tossRes.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error(`[TossProxy] 네트워크 에러: ${String(e)}`);
    return new Response(JSON.stringify({ 
      error: 'Toss Place API 네트워크 오류', 
      detail: String(e) 
    }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
