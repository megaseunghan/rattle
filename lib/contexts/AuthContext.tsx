import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { loadMyStores } from '../services/stores';
import { closedStoreAccess, getMyStoreAccess } from '../services/storeAccess';
import { getMyStoreVisibility } from '../services/storeVisibility';
import { allowsFinancialSharing } from '../utils/financialSharing';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { Store, StoreAccess, StoreVisibility, StoreRole } from '../../types';
import { UserFacingError } from '../utils/error';
import { subscribeAccessInvalidation, clearQueryData, isAccessDenied } from '../query/client';
import { clearPosSyncCoordinator } from '../services/posSyncCoordinator';
import { clearLegacyPosCache } from '../query/legacyPosCache';
import { setExpenseCategorySession } from '../utils/expenseCategorySession';

import { clearAttendanceDeviceCredentials } from '../services/attendanceCredentials';

const LAST_STORE_ID_KEY = 'LAST_STORE_ID';
const STORE_ACCESS_REFRESH_MS = 5 * 60_000;

export type DevPreviewMode = 'self' | 'regular' | 'part_time';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  store: Store | null;
  stores: Store[];
  storesLoaded: boolean;
  /** 매장 id → 그 매장에서의 역할. 오너 매장은 포함하지 않으므로 store.owner_id와 함께 봐야 함 */
  memberRoles: Record<string, 'admin' | 'member'>;
  /** 서버 관리 capability에서 계산한 호환값. 미리보기에서는 member다. */
  currentRole: 'admin' | 'member';
  /** 실제 서버 관리 capability의 호환값. 사장 전용 판단에는 사용하지 않는다. */
  realRole: 'admin' | 'member';
  access: StoreAccess;
  visibility: StoreVisibility | null;
  storeRole: StoreRole | null;
  permissionsReady: boolean;
  permissionsPending: boolean;
  permissionRevision: string;
  canManageStore: boolean;
  canViewOwnerDashboard: boolean;
  canReadFinancials: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshStore: (preferredStoreId?: string) => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
  // ── 관리자 전용 테스트 미리보기 (전 화면에 적용) ──
  devPreviewMode: DevPreviewMode;
  devPreviewEmployeeId: string | null;
  setDevPreview: (mode: DevPreviewMode, employeeId: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [memberRoles, setMemberRoles] = useState<Record<string, 'admin' | 'member'>>({});
  const [accessByStore, setAccessByStore] = useState<Record<string, StoreAccess>>({});
  const [visibilityByStore, setVisibilityByStore] = useState<Record<string, StoreVisibility>>({});
  const lastPermissions = useRef<{ userId: string; access: Record<string, StoreAccess>; visibility: Record<string, StoreVisibility>; stores: Store[]; roles: typeof memberRoles } | null>(null);
  const accessController = useRef<AbortController | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [devPreviewMode, setDevPreviewMode] = useState<DevPreviewMode>('self');
  const [devPreviewEmployeeId, setDevPreviewEmployeeId] = useState<string | null>(null);
  const storeRequestId = useRef(0);
  const authRequestId = useRef(0);
  const authenticatedUserId = useRef<string | null>(null);
  const cacheIdentity = useRef<string | null>(null);

  useEffect(() => { void clearLegacyPosCache().catch(() => {}); }, []);

  function resetQueryIdentity(identity: string) {
    if (cacheIdentity.current === identity) return;
    cacheIdentity.current = identity;
    void clearQueryData();
    clearPosSyncCoordinator();
  }

  const setDevPreview = useCallback((mode: DevPreviewMode, employeeId: string | null) => {
    const allowed = __DEV__ && !!store && !!user && accessByStore[store.id]?.can_manage_store;
    const nextMode = allowed ? mode : 'self';
    const nextEmployee = nextMode === 'self' ? null : employeeId ?? '__unlinked_preview__';
    if (nextMode === devPreviewMode && nextEmployee === devPreviewEmployeeId) return;
    void clearQueryData();
    clearPosSyncCoordinator();
    setDevPreviewMode(nextMode);
    setDevPreviewEmployeeId(nextEmployee);
  }, [devPreviewMode, devPreviewEmployeeId, store?.id, user?.id, accessByStore]);

  async function loadStores(userId: string, preferredStoreId?: string) {
    if (authenticatedUserId.current !== userId) return;
    const requestId = ++storeRequestId.current;
    accessController.current?.abort();
    const controller = new AbortController();
    accessController.current = controller;
    setCheckingPermissions(true);
    try {
      await readStorePermissions(userId, requestId, controller, preferredStoreId);
    } finally {
      if (storeRequestId.current === requestId) setCheckingPermissions(false);
    }
  }

  async function readStorePermissions(userId: string, requestId: number, controller: AbortController, preferredStoreId?: string) {
    const previous = lastPermissions.current?.userId === userId ? lastPermissions.current : null;
    const isCurrent = () => {
      if (requestId === storeRequestId.current) return true;
      if (preferredStoreId) throw new UserFacingError('매장 목록이 갱신됐어요. 같은 설정으로 다시 시도해주세요.');
      return false;
    };
    const { stores: storeList, roles, access: financialAccess } = await loadMyStores(userId).catch(error => {
      if (isCurrent() && isAccessDenied(error)) {
        lastPermissions.current = null;
        setAccessByStore({});
        setVisibilityByStore({});
        resetQueryIdentity('access-denied');
      }
      throw error;
    });
    if (!isCurrent()) return;
    const entries = await Promise.all(storeList.map(async s => {
      const [access, visibility] = await Promise.all([
        getMyStoreAccess(s.id, { signal: controller.signal }),
        getMyStoreVisibility(s.id, { signal: controller.signal }),
      ]);
      const sameOwner = previous?.stores.some(old => old.id === s.id && old.owner_id === s.owner_id) && previous.roles[s.id] === roles[s.id];
      const priorAccess = sameOwner ? previous?.access[s.id] : undefined;
      const confirmedAccess = access.status === 'unavailable' && access.error?.transient && priorAccess
        ? priorAccess : access.data;
      const priorVisibility = priorAccess && JSON.stringify(priorAccess) === JSON.stringify(confirmedAccess) && financialAccess[s.id] === true
        ? previous?.visibility[s.id] : null;
      return { id: s.id, access: confirmedAccess, visibility: visibility.status === 'success' ? visibility.data
        : visibility.status === 'unknown' && visibility.error.transient ? priorVisibility : null };
    }));
    const access = Object.fromEntries(entries.map(e => [e.id, e.access]));
    const visibility = Object.fromEntries(entries.flatMap(e => e.visibility ? [[e.id, e.visibility]] : []));
    const lastStoreId = preferredStoreId ?? await AsyncStorage.getItem(LAST_STORE_ID_KEY);
    if (!isCurrent()) return;
    if (preferredStoreId && !storeList.some(s => s.id === preferredStoreId)) throw new UserFacingError('만들어진 매장을 확인하지 못했어요. 다시 시도해주세요.');
    const selectedStore = storeList.find(s => s.id === lastStoreId) ?? storeList[0];
    resetQueryIdentity(JSON.stringify([userId,
      storeList.map(s => [s.id, s.owner_id, access[s.id], visibility[s.id]]).sort()]));
    if (preferredStoreId && storeList.some(s => s.id === preferredStoreId)) await AsyncStorage.setItem(LAST_STORE_ID_KEY, preferredStoreId);
    if (!isCurrent()) return;
    lastPermissions.current = { userId, stores: storeList, roles, access, visibility };
    setAccessByStore(access);
    setVisibilityByStore(visibility);
    setMemberRoles(roles);
    setStores(previous => JSON.stringify(previous) === JSON.stringify(storeList) ? previous : storeList);
    setStore(previous => JSON.stringify(previous) === JSON.stringify(selectedStore ?? null) ? previous : selectedStore ?? null);
    setStoresLoaded(true);
  }

  const switchStore = useCallback(async (storeId: string) => {
    const selectedStore = stores.find(s => s.id === storeId);
    if (!user || !selectedStore) throw new UserFacingError('매장 목록을 다시 확인해주세요.');
    // 이전 요청을 폐기하고 새 매장의 권한은 서버에서 다시 확인한다.
    const requestId = ++storeRequestId.current;
    await AsyncStorage.setItem(LAST_STORE_ID_KEY, storeId);
    if (requestId !== storeRequestId.current) throw new UserFacingError('매장 목록이 변경됐어요. 다시 선택해주세요.');
    lastPermissions.current = null;
    setAccessByStore({});
    setVisibilityByStore({});
    void clearQueryData();
    clearPosSyncCoordinator();
    setStore(selectedStore);
    setDevPreview('self', null);
    await loadStores(user.id, storeId);
  }, [user, stores, setDevPreview]);

  const refreshStore = useCallback(async (preferredStoreId?: string) => {
    if (user) await loadStores(user.id, preferredStoreId);
  }, [user]);

  // Foreground revalidation applies sharing revocations promptly; a slower active-session
  // refresh avoids repeatedly loading every store and member while the app stays open.
  useEffect(() => {
    if (!user) return;
    const refresh = () => { if (AppState.currentState === 'active') void loadStores(user.id).catch(() => { /* 다음 활성화 또는 주기에 다시 조회한다. */ }); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, STORE_ACCESS_REFRESH_MS);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [user?.id]);

  async function signOut() {
    const previousUserId = authenticatedUserId.current ?? user?.id;
    accessController.current?.abort();
    storeRequestId.current += 1;
    authRequestId.current += 1;
    if (previousUserId) await clearAttendanceDeviceCredentials(previousUserId);
    authenticatedUserId.current = null;
    lastPermissions.current = null;
    await clearQueryData();
    clearPosSyncCoordinator();
    await clearLegacyPosCache().catch(() => {});
    await AsyncStorage.removeItem(LAST_STORE_ID_KEY);
    await supabase.auth.signOut();
    setExpenseCategorySession(null);
    setUser(null);
    setSession(null);
    setStore(null);
    setStores([]);
    setStoresLoaded(false);
    setMemberRoles({});
    setAccessByStore({}); setVisibilityByStore({});
    setDevPreview('self', null);
  }

  const actualAccess = store && user ? accessByStore[store.id] : undefined;
  const realRole = actualAccess?.can_manage_store ? 'admin' : 'member';
  const previewing = realRole === 'admin' && devPreviewMode !== 'self';
  const currentRole = previewing ? 'member' : realRole;
  const access = previewing ? closedStoreAccess(store?.id ?? '') : actualAccess ?? closedStoreAccess(store?.id ?? '');
  const visibility = store && user ? visibilityByStore[store.id] ?? null : null;
  const storeRole = previewing ? (devPreviewMode === 'part_time' ? 'part_timer' : 'employee') : access.role;
  const permissionsReady = !!actualAccess?.role;
  const permissionsPending = checkingPermissions && !actualAccess;
  const canManageStore = access.can_manage_store;
  const canViewOwnerDashboard = access.can_view_owner_dashboard && store?.owner_id === user?.id;
  const permissionRevision = JSON.stringify([store?.id, actualAccess, visibility]);
  const canReadFinancials = !!actualAccess?.role && !!visibility && (previewing
    ? devPreviewEmployeeId !== '__unlinked_preview__' && allowsFinancialSharing(visibility.financial_share_scope, devPreviewMode)
    : visibility.can_read_financials);

  useEffect(() => subscribeAccessInvalidation(storeId => {
    if (user && stores.some(s => s.id === storeId)) void loadStores(user.id).catch(() => { /* 다음 재조회에서 다시 확인한다. */ });
  }), [user?.id, stores]);

  useEffect(() => {
    let deferredLoad: ReturnType<typeof setTimeout> | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session?.user && session.user.id === authenticatedUserId.current) {
          setSession(session);
          setUser(session.user);
          return;
        }
        if (deferredLoad !== null) clearTimeout(deferredLoad);
        const eventRequestId = ++authRequestId.current;
        storeRequestId.current += 1;
        accessController.current?.abort();
        if (!session?.user || authenticatedUserId.current !== session.user.id) {
          lastPermissions.current = null;
          setAccessByStore({}); setVisibilityByStore({});
          void clearQueryData();
          setLoading(true);
        }

        const previousUserId = authenticatedUserId.current;
        if (previousUserId && previousUserId !== session?.user?.id) {
          void clearAttendanceDeviceCredentials(previousUserId);
        }
        if (session?.user) {
          const user = session.user;
          if (authenticatedUserId.current !== user.id) {
            authenticatedUserId.current = user.id;
            setStore(null); setStores([]); setStoresLoaded(false); setMemberRoles({});
            setDevPreviewMode('self'); setDevPreviewEmployeeId(null);
          }
          setExpenseCategorySession(user.id);
          setSession(session);
          setUser(user);
          // onAuthStateChange 콜백 안에서 Supabase 쿼리를 직접 호출하면
          // 내부 잠금으로 인해 데드락이 발생하므로 setTimeout으로 defer
          deferredLoad = setTimeout(async () => {
            deferredLoad = null;
            if (eventRequestId !== authRequestId.current) return;
            try {
              await loadStores(user.id);
            } catch (e) {
              console.error('[Auth] loadStores error:', e);
            } finally {
              if (eventRequestId === authRequestId.current) setLoading(false);
            }
          }, 0);
        } else {
          authenticatedUserId.current = null;
          setExpenseCategorySession(null);
          resetQueryIdentity('signed-out');
          setSession(null);
          setUser(null);
          setStore(null);
          setStores([]);
          setStoresLoaded(false);
          setMemberRoles({});
          setAccessByStore({});
          setVisibilityByStore({});
          setLoading(false);
        }
      }
    );

    return () => {
      storeRequestId.current += 1;
      accessController.current?.abort();
      authRequestId.current += 1;
      if (deferredLoad !== null) clearTimeout(deferredLoad);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, store, stores, storesLoaded, memberRoles, currentRole, realRole, access, visibility, storeRole, permissionsReady, permissionsPending, permissionRevision, canManageStore, canViewOwnerDashboard, canReadFinancials, loading, signOut, refreshStore, switchStore,
      devPreviewMode, devPreviewEmployeeId, setDevPreview,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
