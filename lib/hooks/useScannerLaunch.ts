import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Enrollment from '../services/attendanceScannerEnrollment';

/** Resolve scanner identity before mounting app authentication, queries, or POS effects. */
export function useScannerLaunch(pathname: string) {
  const [state, setState] = useState({ checking: true, scanner: pathname === '/attendance/scanner', error: false });
  const mounted = useRef(false);
  const refetch = useCallback(async () => {
    try {
      const registration = await Enrollment.loadStoredAttendanceScannerRegistration();
      if (mounted.current) setState(old => ({ checking: false, scanner: old.scanner || !!registration, error: false }));
    } catch { if (mounted.current) setState(old => ({ ...old, checking: false, error: true })); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refetch();
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void refetch(); });
    return () => { mounted.current = false; listener.remove(); };
  }, [refetch]);
  useEffect(() => { if (pathname === '/attendance/scanner') setState(old => ({ ...old, scanner: true })); }, [pathname]);
  return { ...state, scanner: state.scanner || pathname === '/attendance/scanner', refetch };
}
