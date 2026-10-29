import { clearPosSyncCoordinator, coordinatePosSync } from '../../lib/services/posSyncCoordinator';
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
