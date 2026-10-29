import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { getFinancialAccess } from '../services/stores';
import { allowsFinancialSharing } from '../utils/financialSharing';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { Store } from '../../types';
import { UserFacingError } from '../utils/error';
import { clearQueryData } from '../query/client';
import { clearPosSyncCoordinator } from '../services/posSyncCoordinator';
import { clearLegacyPosCache } from '../query/legacyPosCache';

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
  /** 미리보기 적용된 역할 — 화면 대부분은 이 값으로 admin/member를 분기한다 */
  currentRole: 'admin' | 'member';
  /** 실제 로그인 계정의 역할 (미리보기와 무관). 미리보기 스위처 자체를 admin에게만 보여줄 때 사용 */
  realRole: 'admin' | 'member';
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
  const [financialAccess, setFinancialAccess] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [devPreviewMode, setDevPreviewMode] = useState<DevPreviewMode>('self');
  const [devPreviewEmployeeId, setDevPreviewEmployeeId] = useState<string | null>(null);
  const storeRequestId = useRef(0);
  const authRequestId = useRef(0);
  const cacheIdentity = useRef<string | null>(null);

  useEffect(() => { void clearLegacyPosCache().catch(() => {}); }, []);

  function resetQueryIdentity(identity: string) {
    if (cacheIdentity.current === identity) return;
    cacheIdentity.current = identity;
    void clearQueryData();
    clearPosSyncCoordinator();
  }

  const setDevPreview = useCallback((mode: DevPreviewMode, employeeId: string | null) => {
    const nextMode = __DEV__ ? mode : 'self';
    const nextEmployee = !__DEV__ || mode === 'self' ? null : employeeId ?? '__unlinked_preview__';
    if (nextMode === devPreviewMode && nextEmployee === devPreviewEmployeeId) return;
    void clearQueryData();
    clearPosSyncCoordinator();
    setDevPreviewMode(nextMode);
    setDevPreviewEmployeeId(nextEmployee);
  }, [devPreviewMode, devPreviewEmployeeId]);

  async function loadStores(userId: string, preferredStoreId?: string) {
    const requestId = ++storeRequestId.current;
    const isCurrent = () => {
      if (requestId === storeRequestId.current) return true;
      if (preferredStoreId) throw new UserFacingError('매장 목록이 갱신됐어요. 같은 설정으로 다시 시도해주세요.');
      return false;
    };
    const [ownedRes, memberRes] = await Promise.all([
      supabase
        .from('stores')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('store_members')
        .select('store_id, role, stores(*)')
        .eq('user_id', userId)
        .eq('status', 'approved'),
    ]);

    if (!isCurrent()) return;
    if (ownedRes.error) throw new Error(ownedRes.error.message);
    if (memberRes.error) throw new Error(memberRes.error.message);

    const ownedStores: Store[] = (ownedRes.data ?? []) as Store[];

    const roles: Record<string, 'admin' | 'member'> = {};
    const memberStores: Store[] = [];
    for (const m of (memberRes.data ?? []) as any[]) {
      if (m.stores) {
        roles[m.store_id] = m.role;
        memberStores.push(m.stores as Store);
      }
    }

    // 소유 매장 우선, 멤버 매장 중복 제거 후 병합
    const storeMap = new Map<string, Store>();
    ownedStores.forEach(s => storeMap.set(s.id, s));
    memberStores.forEach(s => { if (!storeMap.has(s.id)) storeMap.set(s.id, s); });

    const storeList = Array.from(storeMap.values());
    // Missing migration/network error fails closed for members; owners remain usable.
    let access: Record<string, boolean> = {};
    try { access = await getFinancialAccess(storeList.map(s => s.id)); } catch { /* No member financial reads without server confirmation. */ }
    const lastStoreId = preferredStoreId ?? await AsyncStorage.getItem(LAST_STORE_ID_KEY);
    if (!isCurrent()) return;
    if (preferredStoreId && !storeList.some(s => s.id === preferredStoreId)) throw new UserFacingError('만들어진 매장을 확인하지 못했어요. 다시 시도해주세요.');
    const selectedStore = storeList.find(s => s.id === lastStoreId) ?? storeList[0];
    resetQueryIdentity(JSON.stringify([userId,
      storeList.map(s => [s.id, s.owner_id, s.financial_share_scope, access[s.id]]).sort(), Object.entries(roles).sort()]));
    if (preferredStoreId && storeList.some(s => s.id === preferredStoreId)) await AsyncStorage.setItem(LAST_STORE_ID_KEY, preferredStoreId);
    if (!isCurrent()) return;
    setFinancialAccess(access);
    setMemberRoles(roles);
    setStores(previous => JSON.stringify(previous) === JSON.stringify(storeList) ? previous : storeList);
    setStore(previous => JSON.stringify(previous) === JSON.stringify(selectedStore ?? null) ? previous : selectedStore ?? null);
    setStoresLoaded(true);
  }

  const switchStore = useCallback(async (storeId: string) => {
    const selectedStore = stores.find(s => s.id === storeId);
    if (!user || !selectedStore) throw new UserFacingError('매장 목록을 다시 확인해주세요.');
    // 선택할 때 서버를 재조회하지 않는다. 이전 조회도 현재 선택을 덮어쓸 수 없다.
    const requestId = ++storeRequestId.current;
    await AsyncStorage.setItem(LAST_STORE_ID_KEY, storeId);
    if (requestId !== storeRequestId.current) throw new UserFacingError('매장 목록이 변경됐어요. 다시 선택해주세요.');
    setStore(selectedStore);
    setDevPreview('self', null);
  }, [user, stores, setDevPreview]);

  const refreshStore = useCallback(async (preferredStoreId?: string) => {
    if (user) await loadStores(user.id, preferredStoreId);
  }, [user]);

  // Foreground revalidation applies sharing revocations promptly; a slower active-session
  // refresh avoids repeatedly loading every store and member while the app stays open.
  useEffect(() => {
    if (!user) return;
    const refresh = () => { if (AppState.currentState === 'active') void loadStores(user.id).catch(() => setFinancialAccess({})); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, STORE_ACCESS_REFRESH_MS);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [user?.id]);

  async function signOut() {
    storeRequestId.current += 1;
    authRequestId.current += 1;
    await clearQueryData();
    clearPosSyncCoordinator();
    await clearLegacyPosCache().catch(() => {});
    await AsyncStorage.removeItem(LAST_STORE_ID_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStore(null);
    setStores([]);
    setStoresLoaded(false);
    setMemberRoles({});
    setFinancialAccess({});
    setDevPreview('self', null);
  }

  // 현재 매장에서의 역할 (오너이면 admin, 아니면 memberRoles에서 조회)
  const realRole: 'admin' | 'member' =
    !store || !user ? 'admin' :
    store.owner_id === user.id ? 'admin' :
    memberRoles[store.id] ?? 'member';

  // 관리자가 "직원/파트타이머로 보기"를 켜면 나머지 모든 화면은 member로 취급된다
  const currentRole: 'admin' | 'member' =
    realRole === 'admin' && devPreviewMode !== 'self' ? 'member' : realRole;

  const canReadFinancials = !!store && !!user && (currentRole === 'admin' ||
    (realRole === 'admin' && devPreviewMode !== 'self'
      ? devPreviewEmployeeId !== '__unlinked_preview__' && allowsFinancialSharing(store.financial_share_scope, devPreviewMode)
      : financialAccess[store.id] === true));

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const eventRequestId = ++authRequestId.current;
        storeRequestId.current += 1;
        setLoading(true);

        if (session?.user) {
          const user = session.user;
          setSession(session);
          setUser(user);
          // onAuthStateChange 콜백 안에서 Supabase 쿼리를 직접 호출하면
          // 내부 잠금으로 인해 데드락이 발생하므로 setTimeout으로 defer
          setTimeout(async () => {
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
          resetQueryIdentity('signed-out');
          setSession(null);
          setUser(null);
          setStore(null);
          setStores([]);
          setStoresLoaded(false);
          setMemberRoles({});
    setFinancialAccess({});
          setLoading(false);
        }
      }
    );

    return () => {
      storeRequestId.current += 1;
      authRequestId.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, store, stores, storesLoaded, memberRoles, currentRole, realRole, canReadFinancials, loading, signOut, refreshStore, switchStore,
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
