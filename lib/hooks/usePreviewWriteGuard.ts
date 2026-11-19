import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage, UserFacingError } from '../utils/error';

/** 확인창이 열려 있어도 쓰기 직전의 미리보기 상태를 확인한다. */
export function usePreviewWriteGuard() {
  const { devPreviewMode } = useAuth();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const mode = useRef(devPreviewMode);
  mode.current = devPreviewMode;
  const canWrite = useCallback(() => active.current && mode.current === 'self', []);
  const assertCanWrite = useCallback(() => {
    if (!canWrite()) throw new UserFacingError(getErrorMessage(null));
  }, [canWrite]);
  return { canWrite, assertCanWrite };
}
