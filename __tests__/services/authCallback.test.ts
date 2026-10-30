import { completeAuthCallback } from '../../lib/services/authCallback';
import { supabase } from '../../lib/supabase';
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { exchangeCodeForSession: jest.fn(), setSession: jest.fn() } } }));
const exchange = supabase.auth.exchangeCodeForSession as jest.Mock;
const session = supabase.auth.setSession as jest.Mock;
beforeEach(() => { jest.clearAllMocks(); exchange.mockResolvedValue({ error: null }); session.mockResolvedValue({ error: null }); });
it('extracts a PKCE code and deduplicates browser/deep-link completion', async () => {
  const url = 'rattle:///?code=once';
  await Promise.all([completeAuthCallback(url, 'rattle:///'), completeAuthCallback(url, 'rattle:///')]);
  expect(exchange).toHaveBeenCalledTimes(1);
  expect(exchange).toHaveBeenCalledWith('once');
});
it('preserves implicit token callbacks', async () => {
  await completeAuthCallback('rattle:///#access_token=test-access&refresh_token=test-refresh', 'rattle:///');
  expect(session).toHaveBeenCalledWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
});
it('ignores unrelated routes and foreign origins', async () => {
  expect(await completeAuthCallback('https://evil.example/?code=x', 'rattle:///')).toBe(false);
  expect(await completeAuthCallback('rattle:///orders?code=x', 'rattle:///')).toBe(false);
  expect(exchange).not.toHaveBeenCalled();
});
it('reports provider denial without attempting a session exchange', async () => {
  await expect(completeAuthCallback('rattle:///?error=access_denied', 'rattle:///')).rejects.toThrow();
  expect(exchange).not.toHaveBeenCalled();
});
it('allows retry after failed exchange', async () => {
  exchange.mockResolvedValueOnce({ error: new Error('network') });
  await expect(completeAuthCallback('rattle:///?code=retry', 'rattle:///')).rejects.toThrow('network');
  await expect(completeAuthCallback('rattle:///?code=retry', 'rattle:///')).resolves.toBe(true);
  expect(exchange).toHaveBeenCalledTimes(2);
});
