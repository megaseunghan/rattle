type Proof = { id: string; store_id: string; mime_type: string };
interface Dependencies {
  readyProof(authorization: string, id: string): Promise<Proof | null>;
  sign(path: string, ttl: number): Promise<string | null>;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Cache-Control': 'no-store',
};

export function createEvidenceSignHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return new Response(null, { status: 405, headers });
    const authorization = req.headers.get('Authorization');
    if (!authorization) return new Response(null, { status: 401, headers });
    let input;
    try { input = await req.json(); } catch { return new Response(null, { status: 400, headers }); }
    if (typeof input?.id !== 'string' || typeof input.thumbnail !== 'boolean') return new Response(null, { status: 400, headers });
    try {
      const file = await deps.readyProof(authorization, input.id);
      if (!file || (input.thumbnail && file.mime_type !== 'image/jpeg')) return new Response(null, { status: 403, headers });
      const filename = input.thumbnail ? 'thumb.jpg' : file.mime_type === 'image/jpeg' ? 'image.jpg' : 'document.pdf';
      const signedUrl = await deps.sign([file.store_id, file.id, filename].join('/'), 300);
      if (signedUrl === null) {
        return Response.json({ code: 'EVIDENCE_CACHE_POLICY_REQUIRES_REUPLOAD' }, { status: 409, headers });
      }
      return new Response(JSON.stringify({ signedUrl }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch { return new Response(null, { status: 503, headers }); }
  };
}
