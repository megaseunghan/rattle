import { scheduleIdleTask } from '../../lib/utils/scheduleIdleTask';
const originalRequest = globalThis.requestIdleCallback;
const originalCancel = globalThis.cancelIdleCallback;
afterEach(() => { globalThis.requestIdleCallback = originalRequest; globalThis.cancelIdleCallback = originalCancel; jest.useRealTimers(); });
it('유휴 작업은 즉시 실행하지 않고 취소한 뒤 늦게 도착해도 실행하지 않는다', () => {
  let queued!: IdleRequestCallback;
  globalThis.requestIdleCallback = jest.fn(callback => { queued = callback; return 7; });
  globalThis.cancelIdleCallback = jest.fn();
  const task = jest.fn();
  const cancel = scheduleIdleTask(task);
  expect(task).not.toHaveBeenCalled();
  cancel();
  queued({ didTimeout: false, timeRemaining: () => 10 });
  expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(7);
  expect(task).not.toHaveBeenCalled();
});
it('유휴 API가 없으면 다음 큐에서 실행하고 fallback도 취소한다', () => {
  jest.useFakeTimers();
  globalThis.requestIdleCallback = undefined as any;
  globalThis.cancelIdleCallback = undefined as any;
  const cancelled = jest.fn(), task = jest.fn();
  scheduleIdleTask(cancelled)();
  scheduleIdleTask(task);
  expect(task).not.toHaveBeenCalled();
  jest.runOnlyPendingTimers();
  expect(cancelled).not.toHaveBeenCalled();
  expect(task).toHaveBeenCalledTimes(1);
});
