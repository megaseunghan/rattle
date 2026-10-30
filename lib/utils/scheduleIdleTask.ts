/** Defer optional work; cancellation prevents queued callbacks after blur/unmount.
 * This yields the JS queue, but does not move computation to another thread.
 */
export function scheduleIdleTask(task: () => void): () => void {
  let cancelled = false;
  const run = () => { if (!cancelled) task(); };
  if (typeof requestIdleCallback === 'function' && typeof cancelIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: 500 });
    return () => { cancelled = true; cancelIdleCallback(handle); };
  }
  const handle = setTimeout(run, 0);
  return () => { cancelled = true; clearTimeout(handle); };
}
