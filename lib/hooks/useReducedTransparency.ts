import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Default to an opaque surface until the system preference is known. */
export function useReducedTransparency() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true;
      if (active) setReduced(value);
    });
    AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active && !changed) setReduced(value);
    }).catch(() => { /* Keep the readable opaque surface when the preference is unavailable. */ });
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}
