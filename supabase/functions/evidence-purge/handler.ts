type Authentication = { verify(token: string): Promise<boolean> } | { token: string };
type Dependencies = Authentication & {
  claim(): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
}

export async function verifyPurgeSignature(token: string, secret: string | undefined, now = Date.now()) {
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token);
  if (!match || !secret) return false;
  const age = Math.floor(now / 1000) - Number(match[1]);
  if (age < -5 || age > 60) return false;
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const signature = Uint8Array.from(match[2].match(/../g)!, pair => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, signature, bytes.encode('evidence-purge:' + match[1]));
}

export function createEvidencePurgeHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    try {
      const token = req.headers.get('x-evidence-purge-token');
      if (!token || !('verify' in deps ? await deps.verify(token) : token === deps.token)) {
        return new Response(null, { status: 401 });
      }
      const paths = await deps.claim();
      if (paths.length) await deps.remove(paths);
      return new Response(null, { status: 204 });
    } catch { return new Response(null, { status: 503 }); }
  };
}
