import React, { useEffect, type ReactNode } from 'react';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

import { queryClient } from './client';
export * from './client';
export function RattleQueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => listener.remove();
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
export function useQueryScope(): string {
  const { user, realRole, currentRole, devPreviewMode, devPreviewEmployeeId, memberRoles, canReadFinancials } = useAuth();
  return JSON.stringify([user?.id ?? null, realRole, currentRole, devPreviewMode, devPreviewEmployeeId, canReadFinancials,
    Object.entries(memberRoles ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}
