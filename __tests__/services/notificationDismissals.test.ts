jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), auth: { getUser: jest.fn() } } }));
import { supabase } from '../../lib/supabase';
import { dismissNotification, getNotifications, getUnreadCount } from '../../lib/services/notifications';
const responses: any[] = [];
const chains: any[] = [];
const notice = { id: 'n1', store_id: 's', category: 'stock', is_read: false, message: '재고 확인' };
beforeEach(() => {
 jest.clearAllMocks(); responses.length = 0; chains.length = 0;
 (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
 (supabase.from as jest.Mock).mockImplementation((table: string) => {
  const chain: any = { table };
  for (const method of ['select', 'eq', 'neq', 'order', 'upsert']) chain[method] = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn(() => Promise.resolve(responses.shift()));
  chain.then = (resolve: any, reject: any) => Promise.resolve(responses.shift()).then(resolve, reject);
  chains.push(chain); return chain;
 });
});
it('본인 삭제 관계가 있는 알림만 제외하고 다른 알림과 읽음 상태를 유지한다', async () => {
 responses.push({ data: [{ ...notice, notification_dismissals: [{ notification_id: 'n1' }] }, { ...notice, id: 'n2', notification_dismissals: [] }], error: null });
 expect(await getNotifications('s', undefined, false)).toEqual([{ ...notice, id: 'n2' }]);
 expect(chains[0].select).toHaveBeenCalledWith('*, notification_dismissals(notification_id)');
 expect(chains[0].eq).toHaveBeenCalledWith('store_id', 's');
 expect(chains[0].neq).toHaveBeenCalledWith('category', 'sales');
});
it('정확히 새 관계가 없는 서버만 기존 목록으로 호환 조회한다', async () => {
 responses.push({ data: null, error: { code: 'PGRST200', message: "Could not find a relationship between 'notifications' and 'notification_dismissals'" } }, { data: [notice], error: null });
 expect(await getNotifications('s', 'stock', false)).toEqual([notice]);
 expect(chains[1].select).toHaveBeenCalledWith('*');
 expect(chains[1].eq).toHaveBeenCalledWith('category', 'stock');
 expect(chains[1].neq).toHaveBeenCalledWith('category', 'sales');
});
it.each([
 { code: '42501', message: 'permission denied notification_dismissals' },
 { code: 'PGRST200', message: 'missing unrelated relation' },
 { code: '42P01', message: 'relation notifications does not exist' },
 { message: 'network failed' },
])('다른 조회 실패는 호환 우회하지 않는다: %j', async error => {
 responses.push({ data: null, error });
 await expect(getNotifications('s')).rejects.toThrow(error.message);
 expect(supabase.from).toHaveBeenCalledTimes(1);
});
it('삭제는 본인 표식만 추가하고 서버 확인 후 완료한다', async () => {
 responses.push({ error: null }, { data: { notification_id: 'n1' }, error: null });
 await dismissNotification('s', 'u1', 'n1');
 expect(chains[0].table).toBe('notification_dismissals');
 expect(chains[0].upsert).toHaveBeenCalledWith({ store_id: 's', user_id: 'u1', notification_id: 'n1' }, { onConflict: 'user_id,notification_id', ignoreDuplicates: true });
 expect(chains[1].eq).toHaveBeenCalledWith('user_id', 'u1');
 expect(chains[1].eq).toHaveBeenCalledWith('store_id', 's');
 expect(chains[1].eq).toHaveBeenCalledWith('notification_id', 'n1');
});
it('계정이 바뀌면 삭제 요청을 보내지 않는다', async () => {
 await expect(dismissNotification('s', 'other', 'n1')).rejects.toThrow('계정이 변경');
 expect(supabase.from).not.toHaveBeenCalled();
});
it('새 SQL 미적용 삭제는 서버 업데이트 필요를 명시한다', async () => {
 responses.push({ error: { code: 'PGRST205', message: "Could not find the table 'public.notification_dismissals'" } });
 await expect(dismissNotification('s', 'u1', 'n1')).rejects.toThrow('알림 삭제를 위한 서버 업데이트가 필요해요.');
});
it('응답 유실·권한 거절·확인 불가를 성공으로 바꾸지 않는다', async () => {
 responses.push({ error: null }, { data: null, error: null });
 await expect(dismissNotification('s', 'u1', 'n1')).rejects.toThrow('삭제 결과');
 responses.push({ error: { code: '42501', message: 'permission denied' } });
 await expect(dismissNotification('s', 'u1', 'n1')).rejects.toThrow('permission denied');
});
it('읽지 않은 개수에서도 개인 삭제 알림을 제외한다', async () => {
 responses.push({ data: [{ ...notice, notification_dismissals: [{ notification_id: 'n1' }] }, { ...notice, id: 'n2', notification_dismissals: [] }], error: null });
 expect(await getUnreadCount('s')).toBe(1);
});
