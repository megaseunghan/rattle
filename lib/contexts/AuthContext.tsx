import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { Store } from '../../types';
import { UserFacingError } from '../utils/error';

const LAST_STORE_ID_KEY = 'LAST_STORE_ID';

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
  loading: boolean;
  signOut: () => Promise<void>;
  refreshStore: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);
  const [devPreviewMode, setDevPreviewMode] = useState<DevPreviewMode>('self');
  const [devPreviewEmployeeId, setDevPreviewEmployeeId] = useState<string | null>(null);
  const storeRequestId = useRef(0);
  const authRequestId = useRef(0);

  const setDevPreview = useCallback((mode: DevPreviewMode, employeeId: string | null) => {
    setDevPreviewMode(mode);
    setDevPreviewEmployeeId(mode === 'self' ? null : employeeId);
  }, []);

  async function loadStores(userId: string) {
    const requestId = ++storeRequestId.current;
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

    if (requestId !== storeRequestId.current) return;
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
    const lastStoreId = await AsyncStorage.getItem(LAST_STORE_ID_KEY);
    if (requestId !== storeRequestId.current) return;
    const selectedStore = storeList.find(s => s.id === lastStoreId) ?? storeList[0];
    setMemberRoles(roles);
    setStores(storeList);
    setStore(selectedStore ?? null);
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

  const refreshStore = useCallback(async () => {
    if (user) await loadStores(user.id);
  }, [user]);

  async function signOut() {
    storeRequestId.current += 1;
    authRequestId.current += 1;
    await AsyncStorage.removeItem(LAST_STORE_ID_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStore(null);
    setStores([]);
    setStoresLoaded(false);
    setMemberRoles({});
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
          setSession(null);
          setUser(null);
          setStore(null);
          setStores([]);
          setStoresLoaded(false);
          setMemberRoles({});
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
      user, session, store, stores, storesLoaded, memberRoles, currentRole, realRole, loading, signOut, refreshStore, switchStore,
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
