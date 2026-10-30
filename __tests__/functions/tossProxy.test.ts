/** @jest-environment node */
import { createTossProxyHandler } from '../../supabase/functions/toss-proxy/handler';

describe('Toss proxy authorization boundary', () => {
  const authorize = jest.fn();
  const fetchUpstream = jest.fn();
  const handle = createTossProxyHandler({ accessKey: 'test-key', accessSecret: 'test-secret', authorize, fetchUpstream });
  const request = (body: unknown, token = 'Bearer test-token') => new Request('https://local/toss-proxy', {
    method: 'POST', headers: token ? { Authorization: token } : {}, body: JSON.stringify(body),
  });
  beforeEach(() => { jest.resetAllMocks(); authorize.mockResolvedValue(200); fetchUpstream.mockResolvedValue(new Response('{"orders":[]}')); });
  it('rejects missing authentication', async () => {
    expect((await handle(request({ path: '/merchants/m1/order/orders' }, ''))).status).toBe(401);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it.each([401, 403])('blocks denied users (%s)', async status => {
    authorize.mockResolvedValue(status);
    expect((await handle(request({ path: '/merchants/other/order/orders' }))).status).toBe(status);
    expect(authorize).toHaveBeenCalledWith('test-token', 'other');
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it.each([
    { path: '/merchants/m1/order/orders', method: 'DELETE' },
    { path: '/merchants/m1/order/orders', body: {} },
    { path: '/merchants/m1/../m2/order/orders' },
    { path: '/merchants/m1%2f..%2fm2/order/orders' },
    { path: '/merchants/m1/settings' },
    { path: '//evil.example/merchants/m1/order/orders' },
    { path: '/merchants/m1/catalog/items?merchantId=other' },
    { path: '/merchants/m1/catalog/items?page=1&page=2' }, null,
  ])('rejects unsupported request %j', async body => {
    expect((await handle(request(body))).status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it.each(['/merchants/m1/order/orders?page=1&size=100', '/merchants/m1/order/orders/o1', '/merchants/m1/catalog/items?page=1'])('permits authorized read %s', async path => {
    expect((await handle(request({ path }))).status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({ method: 'GET', redirect: 'error' }));
  });
  it('fails closed on authorization lookup errors', async () => {
    authorize.mockRejectedValue(new Error('DB unavailable'));
    expect((await handle(request({ path: '/merchants/m1/catalog/items' }))).status).toBe(502);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
