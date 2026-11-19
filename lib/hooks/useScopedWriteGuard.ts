import { useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePreviewWriteGuard } from './usePreviewWriteGuard';

/** 현재 신원·대상·권한 범위를 떠난 확인창 콜백은 다시 쓰지 않는다. */
export function useScopedWriteGuard(parts: readonly unknown[]) {
  const { user, store, permissionRevision } = useAuth();
  const preview = usePreviewWriteGuard();
  const identity = JSON.stringify([user?.id, store?.id, permissionRevision, ...parts]);
  const latest = useRef({ identity });
  if (latest.current.identity !== identity) latest.current = { identity };
  const captured = latest.current;
  return useCallback(() => preview.canWrite() && latest.current === captured, [preview.canWrite, captured]);
}
