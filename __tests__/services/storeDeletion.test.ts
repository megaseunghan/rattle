/** @jest-environment node */
import { deleteOwnedStore, listMyDeletedStores, restoreDeletedStore } from '../../lib/services/stores';
import { formatRestoreDeadline } from '../../lib/utils/storeDeletion';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('deleteOwnedStore', () => {
  it('지정한 매장만 서버 삭제 함수에 전달하고 즉시 삭제 결과를 돌려준다', async () => {
    rpc.mockResolvedValue({ data: { mode: 'deleted', purge_after: null }, error: null });
    await expect(deleteOwnedStore('store-id')).resolves.toEqual({ mode: 'deleted', purgeAfter: null });
    expect(rpc).toHaveBeenCalledWith('delete_owned_store', { p_store_id: 'store-id' });
  });

  it('기록이 있는 매장은 파기 예정 시각을 돌려준다', async () => {
    rpc.mockResolvedValue({ data: { mode: 'scheduled', purge_after: '2026-11-21T06:00:00Z' }, error: null });
    await expect(deleteOwnedStore('store-id')).resolves.toEqual({ mode: 'scheduled', purgeAfter: '2026-11-21T06:00:00Z' });
  });

  it('POS가 연결돼 있으면 해제 안내를 보여준다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'STORE_DELETE_POS_CONNECTED' } });
    await expect(deleteOwnedStore('store-id')).rejects.toThrow('POS 연결을 해제한 뒤 삭제해주세요.');
  });

  it('알 수 없는 응답은 성공으로 처리하지 않는다', async () => {
    rpc.mockResolvedValue({ data: { mode: 'scheduled' }, error: null });
    await expect(deleteOwnedStore('store-id')).rejects.toThrow('unexpected result');
  });
});

describe('restoreDeletedStore', () => {
  it('복구 함수를 호출한다', async () => {
    rpc.mockResolvedValue({ error: null });
    await expect(restoreDeletedStore('store-id')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('restore_deleted_store', { p_store_id: 'store-id' });
  });

  it('기한이 지나면 복구 불가를 안내한다', async () => {
    rpc.mockResolvedValue({ error: { message: 'STORE_RESTORE_EXPIRED' } });
    await expect(restoreDeletedStore('store-id')).rejects.toThrow('복구 기간 7일이 지나 복구할 수 없어요.');
  });
});

describe('listMyDeletedStores', () => {
  it('서버 필드를 화면용 이름으로 바꾼다', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', name: '매장', deleted_at: 'd', purge_after: 'p' }], error: null });
    await expect(listMyDeletedStores()).resolves.toEqual([{ id: 'a', name: '매장', deletedAt: 'd', purgeAfter: 'p' }]);
    expect(rpc).toHaveBeenCalledWith('list_my_deleted_stores');
  });

  it('조회 실패를 숨기지 않는다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listMyDeletedStores()).rejects.toThrow('boom');
  });
});

describe('formatRestoreDeadline', () => {
  it('기기 시간대와 관계없이 한국 시각으로 표시한다', () => {
    expect(formatRestoreDeadline('2026-11-21T06:00:00Z')).toBe('11월 21일 오후 3시');
    expect(formatRestoreDeadline('2026-11-20T15:30:00Z')).toBe('11월 21일 오전 12시');
  });

  it('잘못된 값은 대체 문구를 쓴다', () => {
    expect(formatRestoreDeadline('nope')).toBe('7일 뒤');
  });
});
