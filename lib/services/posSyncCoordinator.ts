// Recent sales keep the existing 30-minute freshness window. The 30-day repair
// sweep runs at most once per six hours in this process; manual sync bypasses it.
export const POS_RECENT_SYNC_INTERVAL_MS = 30 * 60_000;
export const POS_HISTORY_SYNC_INTERVAL_MS = 6 * 60 * 60_000;

/** Cross-hook gate: only successful automatic attempts consume the throttle. */
const running = new Map<string, { operation: string; promise: Promise<unknown> }>();
const completed = new Map<string, number>();
const completionListeners = new Map<string, Set<() => void>>();
let generation = 0;
// The root owns automatic imports, while mounted sales consumers refresh after
// that import. They share the existing QueryClient read and never start a write.
export function subscribePosSyncCompletion(accountStoreKey: string, listener: () => void) {
  const listeners = completionListeners.get(accountStoreKey) ?? new Set<() => void>();
  listeners.add(listener);
  completionListeners.set(accountStoreKey, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) completionListeners.delete(accountStoreKey);
  };
}
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
    if (epoch === generation) {
      completed.set(key, Date.now());
      completionListeners.get(accountStoreKey)?.forEach(listener => listener());
    }
    return result;
  } finally {
    if (running.get(accountStoreKey)?.promise === promise) running.delete(accountStoreKey);
  }
}
