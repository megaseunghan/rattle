interface Dependencies {
  token?: string;
  claim(): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
}

export function createEvidencePurgeHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    if (!deps.token || req.headers.get('x-evidence-purge-token') !== deps.token) return new Response(null, { status: 401 });
    try {
      const paths = await deps.claim();
      if (paths.length) await deps.remove(paths);
      return new Response(null, { status: 204 });
    } catch { return new Response(null, { status: 503 }); }
  };
}
