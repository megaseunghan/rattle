import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useTossSync } from './useTossSync';

/** Root-only owner for startup/scope changes and actual background -> active transitions. */
export function usePosForegroundSync(enabled: boolean) {
  const { autoSyncOnForeground } = useTossSync();
  useEffect(() => {
    if (!enabled) return;
    let previous = AppState.currentState;
    if (previous === 'active') void autoSyncOnForeground();
    const subscription = AppState.addEventListener('change', next => {
      const returning = next === 'active' && previous !== 'active';
      previous = next;
      if (returning) void autoSyncOnForeground();
    });
    return () => subscription.remove();
  }, [enabled, autoSyncOnForeground]);
}
