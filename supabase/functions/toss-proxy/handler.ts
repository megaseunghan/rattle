const BASE_URL = 'https://open-api.tossplace.com/api-public/openapi/v1';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
interface Dependencies {
  accessKey: string;
  accessSecret: string;
  authorize: (token: string, merchantId: string) => Promise<200 | 401 | 403>;
  fetchUpstream: typeof fetch;
}
export function createTossProxyHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await req.json(); }
    catch { return json({ error: '유효하지 않은 요청 본문입니다.' }, 400); }
    if (!body || typeof body.path !== 'string' || (body.method ?? 'GET') !== 'GET' || body.body != null) {
      return json({ error: '허용된 GET 조회만 요청할 수 있습니다.' }, 400);
    }
    // 인코딩된 경로·상대 경로·다른 엔드포인트를 차단한다.
    const match = body.path.match(/^\/merchants\/([A-Za-z0-9_-]+)\/(order\/orders(?:\/[A-Za-z0-9_-]+)?|catalog\/items)(\?[^#\s]*)?$/);
    if (!match) return json({ error: '허용되지 않은 경로입니다.' }, 400);
    const url = new URL(`${BASE_URL}${body.path}`);
    const allowedQuery = match[2] === 'order/orders' ? ['from', 'to', 'page', 'size']
      : match[2] === 'catalog/items' ? ['page', 'size'] : [];
    let invalidQuery = false;
    url.searchParams.forEach((_value, key) => {
      if (!allowedQuery.includes(key) || url.searchParams.getAll(key).length !== 1) {
        invalidQuery = true;
      }
    });
    if (invalidQuery) return json({ error: '허용되지 않은 조회 파라미터입니다.' }, 400);
    try {
      const status = await deps.authorize(token, match[1]);
      if (status !== 200) return json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, status);
      if (!deps.accessKey || !deps.accessSecret) return json({ error: '서버 설정 오류' }, 500);
      const response = await deps.fetchUpstream(url.toString(), {
        method: 'GET', redirect: 'error',
        headers: { 'x-access-key': deps.accessKey, 'x-secret-key': deps.accessSecret, 'Content-Type': 'application/json' },
      });
      if (response.status === 204) return new Response(null, { status: 204, headers: CORS });
      let data;
      try { data = await response.json(); }
      catch { return json({ error: 'Toss Place API 응답 형식 오류' }, 502); }
      return json(data, response.status);
    } catch {
      return json({ error: 'Toss Place API 요청 처리 실패' }, 502);
    }
  };
}
