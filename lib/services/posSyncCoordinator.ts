/** Cross-hook gate: only successful automatic attempts consume the throttle. */
const running = new Map<string, { operation: string; promise: Promise<unknown> }>();
const completed = new Map<string, number>();
let generation = 0;
export function clearPosSyncCoordinator() {
  generation += 1;
  running.clear();
  completed.clear();
}
export async function coordinatePosSync<T>(
  accountStoreKey: string, operation: string, throttleMs: number, task: () => Promise<T>,
): Promise<T | undefined> {
  const key = `${accountStoreKey}:${operation}`;
  const existing = running.get(accountStoreKey);
  if (existing) {
    if (existing.operation === operation) return existing.promise as Promise<T>;
    // Different ranges serialize instead of racing detail replacement. Each range
    // retains its own successful throttle so a today check cannot suppress history.
    try { await existing.promise; } catch { /* The next operation can recover. */ }
    return coordinatePosSync(accountStoreKey, operation, throttleMs, task);
  }
  if (Date.now() - (completed.get(key) ?? 0) < throttleMs) return undefined;
  const epoch = generation;
  const promise = Promise.resolve().then(task);
  running.set(accountStoreKey, { operation, promise });
  try {
    const result = await promise;
    if (epoch === generation) completed.set(key, Date.now());
    return result;
  } finally {
    if (running.get(accountStoreKey)?.promise === promise) running.delete(accountStoreKey);
  }
}
