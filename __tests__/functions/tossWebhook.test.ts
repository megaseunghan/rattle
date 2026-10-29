/** @jest-environment node */
import { createTossWebhookHandler } from '../../supabase/functions/toss-webhook/handler';
const deps = { verify: jest.fn(), process: jest.fn(), report: jest.fn() };
const handle = createTossWebhookHandler(deps);
const event = { id: 'e1', type: 'app.installation.created.v1', merchantId: 'm1' };
const request = (body: unknown = event) => new Request('https://local/toss-webhook', { method: 'POST',
  headers: { 'x-toss-signature': 'fixture', 'x-toss-timestamp': String(Date.now()), 'x-toss-webhook-id': 'e1' }, body: JSON.stringify(body) });
beforeEach(() => { jest.resetAllMocks(); deps.verify.mockResolvedValue(true); deps.process.mockResolvedValue({ duplicated: false }); });
it('서명 검증 실패 시 DB를 호출하지 않는다', async () => {
  deps.verify.mockResolvedValue(false);
  expect((await handle(request())).status).toBe(401);
  expect(deps.process).not.toHaveBeenCalled();
});
it.each([null, [], { ...event, id: '' }, { ...event, merchantId: null }, { ...event, id: 3 }])('잘못된 이벤트는 저장하지 않는다: %j', async body => {
  expect((await handle(request(body))).status).toBe(400);
  expect(deps.process).not.toHaveBeenCalled();
});
it('트랜잭션 성공 이후에만 수신 완료를 응답한다', async () => {
  expect((await handle(request())).status).toBe(200);
  expect(deps.process).toHaveBeenCalledWith('e1', event.type, 'm1', event);
});
it('큐 저장 실패 등 DB 오류는 재전송 가능한 실패로 응답한다', async () => {
  deps.process.mockRejectedValue(new Error('sensitive database details'));
  const response = await handle(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('sensitive database details');
  expect(deps.report).toHaveBeenCalledWith('toss_webhook_failed');
});
it('이미 완료된 중복 이벤트는 성공으로 응답한다', async () => {
  deps.process.mockResolvedValue({ duplicated: true });
  expect(await (await handle(request())).json()).toEqual({ received: true, duplicated: true });
});
it('오래된 서명을 재사용한 요청은 거절한다', async () => {
  const req = request();
  req.headers.set('x-toss-timestamp', String(Date.now() - 10 * 60 * 1000));
  expect((await handle(req)).status).toBe(401);
  expect(deps.process).not.toHaveBeenCalled();
});
it('헤더와 본문의 이벤트 식별자가 다르면 거절한다', async () => {
  const req = request();
  req.headers.set('x-toss-webhook-id', 'different');
  expect((await handle(req)).status).toBe(400);
  expect(deps.process).not.toHaveBeenCalled();
});
