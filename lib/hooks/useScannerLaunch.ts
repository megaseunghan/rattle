import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Enrollment from '../services/attendanceScannerEnrollment';

/** Resolve scanner identity before mounting app authentication, queries, or POS effects. */
export function useScannerLaunch(pathname: string) {
  const [state, setState] = useState({ checking: true, scanner: pathname === '/attendance/scanner', error: false });
  const mounted = useRef(false);
  const latestRead = useRef(0);
  const [returnRequested, setReturnRequested] = useState(false);
  const allowReturn = returnRequested && pathname === '/login';
  const refetch = useCallback(async () => {
    const read = ++latestRead.current;
    try {
      const registration = await Enrollment.loadStoredAttendanceScannerRegistration();
      if (!mounted.current || read !== latestRead.current) return;
      setState(old => ({
        checking: false,
        scanner: !!registration || (old.scanner && !allowReturn),
        error: false,
      }));
      if (allowReturn) setReturnRequested(false);
    } catch { if (mounted.current && read === latestRead.current) setState(old => ({ ...old, checking: false, error: true })); }
  }, [allowReturn]);
  useEffect(() => {
    mounted.current = true; void refetch();
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void refetch(); });
    return () => { mounted.current = false; listener.remove(); };
  }, [refetch]);
  useEffect(() => {
    if (pathname === '/attendance/scanner') {
      setReturnRequested(false);
      setState(old => ({ ...old, scanner: true }));
    }
  }, [pathname]);
  const afterLeave = useCallback(() => {
    setReturnRequested(true);
  }, []);
  return { ...state, scanner: state.scanner || pathname === '/attendance/scanner', refetch, afterLeave };
}
