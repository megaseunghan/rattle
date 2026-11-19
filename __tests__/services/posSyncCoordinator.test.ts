import { clearPosSyncCoordinator, coordinatePosSync, subscribePosSyncCompletion, POS_RECENT_SYNC_INTERVAL_MS, POS_HISTORY_SYNC_INTERVAL_MS } from '../../lib/services/posSyncCoordinator';
describe('POS cross-hook automatic sync gate', () => {
  beforeEach(clearPosSyncCoordinator);
  it('shares an in-flight request and throttles successful repeats', async () => {
    let finish!: () => void;
    const task = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = coordinatePosSync('user:store', 'recent14', 1800000, task);
    const second = coordinatePosSync('user:store', 'recent14', 1800000, task);
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    finish(); await Promise.all([first, second]);
    await coordinatePosSync('user:store', 'recent14', 1800000, task);
    expect(task).toHaveBeenCalledTimes(1);
  });
  it('does not throttle failure and isolates accounts', async () => {
    const fail = jest.fn().mockRejectedValue(new Error('network'));
    await expect(coordinatePosSync('a:store', 'today', 1800000, fail)).rejects.toThrow('network');
    const recover = jest.fn().mockResolvedValue(1);
    await coordinatePosSync('a:store', 'today', 1800000, recover);
    await coordinatePosSync('b:store', 'today', 1800000, recover);
    expect(recover).toHaveBeenCalledTimes(2);
  });
  it('clearing during an old request cannot throttle a new login', async () => {
    let finish!: () => void;
    const old = coordinatePosSync('a:store', 'today', 1800000, () => new Promise<void>(r => { finish = r; }));
    await Promise.resolve(); clearPosSyncCoordinator(); finish(); await old;
    const task = jest.fn().mockResolvedValue(1);
    await coordinatePosSync('a:store', 'today', 1800000, task);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

it('서로 다른 기간은 순서대로 실행하고 완료된 기간의 간격을 따로 유지한다', async () => {
  clearPosSyncCoordinator();
  let finish!: () => void;
  const history = coordinatePosSync('a:store', 'recent30', 21600000, () => new Promise<void>(resolve => { finish = resolve; }));
  const recentTask = jest.fn().mockResolvedValue(undefined);
  const recent = coordinatePosSync('a:store', 'recent2', 1800000, recentTask);
  await Promise.resolve(); expect(recentTask).not.toHaveBeenCalled();
  finish(); await Promise.all([history, recent]);
  expect(recentTask).toHaveBeenCalledTimes(1);
  await coordinatePosSync('a:store', 'recent2', 1800000, recentTask);
  expect(recentTask).toHaveBeenCalledTimes(1);
});

it('최근·과거 간격을 공개하고 같은 계정/매장의 성공 완료만 구독자에게 알린다', async () => {
  clearPosSyncCoordinator();
  expect(POS_RECENT_SYNC_INTERVAL_MS).toBe(30 * 60_000);
  expect(POS_HISTORY_SYNC_INTERVAL_MS).toBe(6 * 60 * 60_000);
  const listener = jest.fn(); const other = jest.fn();
  const unsubscribe = subscribePosSyncCompletion('a:store', listener);
  const stopOther = subscribePosSyncCompletion('other:store', other);
  try {
    await coordinatePosSync('a:store', 'recent2', POS_RECENT_SYNC_INTERVAL_MS, async () => 42);
    expect(listener).toHaveBeenCalledTimes(1); expect(other).not.toHaveBeenCalled();
    await coordinatePosSync('a:store', 'recent2', POS_RECENT_SYNC_INTERVAL_MS, async () => 43);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await coordinatePosSync('a:store', 'today', 0, async () => 44);
    expect(listener).toHaveBeenCalledTimes(1);
  } finally { unsubscribe(); stopOther(); }
});
it('실패와 계정 초기화 전에 시작한 작업은 완료 통지를 보내지 않는다', async () => {
  clearPosSyncCoordinator();
  const listener = jest.fn();
  const unsubscribe = subscribePosSyncCompletion('a:store', listener);
  try {
    await expect(coordinatePosSync('a:store', 'fail', 0, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(listener).not.toHaveBeenCalled();
    let finish!: () => void;
    const pending = coordinatePosSync('a:store', 'slow', 0, () => new Promise<void>(resolve => { finish = resolve; }));
    await Promise.resolve(); clearPosSyncCoordinator(); finish(); await pending;
    expect(listener).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});
