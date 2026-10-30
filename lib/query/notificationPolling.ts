/** One timer and one app-state listener per visible notification query. No UI dependency. */
interface PollingLifecycle {
  isActive: () => boolean;
  subscribeActive: (callback: () => void) => () => void;
}
interface PollingEntry {
  subscribers: Set<() => Promise<unknown>>;
  timer: ReturnType<typeof setInterval>;
  unsubscribe: () => void;
}
const polling = new Map<string, PollingEntry>();
export function subscribeNotificationPolling(key: string, poll: () => Promise<unknown>, lifecycle: PollingLifecycle): () => void {
  let entry = polling.get(key);
  if (!entry) {
    const subscribers = new Set([poll]);
    const tick = () => {
      if (!lifecycle.isActive()) return;
      const callback = subscribers.values().next().value;
      if (callback) void callback().catch(() => { /* Query observer owns the visible error. */ });
    };
    entry = { subscribers, timer: setInterval(tick, 30_000), unsubscribe: lifecycle.subscribeActive(tick) };
    polling.set(key, entry);
    tick();
  } else entry.subscribers.add(poll);
  const registered = entry;
  return () => {
    registered.subscribers.delete(poll);
    if (!registered.subscribers.size) {
      clearInterval(registered.timer);
      registered.unsubscribe();
      if (polling.get(key) === registered) polling.delete(key);
    }
  };
}
