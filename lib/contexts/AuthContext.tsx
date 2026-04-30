import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { Store } from '../../types';

const LAST_STORE_ID_KEY = 'LAST_STORE_ID';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  store: Store | null;
  stores: Store[];
  storesLoaded: boolean;
  currentRole: 'admin' | 'member';
  loading: boolean;
  signOut: () => Promise<void>;
  refreshStore: () => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
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

  async function loadStores(userId: string) {
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

    const ownedStores: Store[] = (ownedRes.data ?? []) as Store[];

    const roles: Record<string, 'admin' | 'member'> = {};
    const memberStores: Store[] = [];
    for (const m of (memberRes.data ?? []) as any[]) {
      if (m.stores) {
        roles[m.store_id] = m.role;
        memberStores.push(m.stores as Store);
      }
    }
    setMemberRoles(roles);

    // 소유 매장 우선, 멤버 매장 중복 제거 후 병합
    const storeMap = new Map<string, Store>();
    ownedStores.forEach(s => storeMap.set(s.id, s));
    memberStores.forEach(s => { if (!storeMap.has(s.id)) storeMap.set(s.id, s); });

    const storeList = Array.from(storeMap.values());

    if (storeList.length === 0) {
      setStores([]);
      setStore(null);
      setStoresLoaded(true);
      return;
    }

    setStores(storeList);
    const lastStoreId = await AsyncStorage.getItem(LAST_STORE_ID_KEY);
    const selectedStore = lastStoreId ? storeList.find(s => s.id === lastStoreId) : storeList[0];
    setStore(selectedStore ?? null);
    setStoresLoaded(true);
  }

  async function switchStore(storeId: string) {
    await AsyncStorage.setItem(LAST_STORE_ID_KEY, storeId);
    if (user) {
      await loadStores(user.id);
    }
  }

  async function refreshStore() {
    if (user) {
      await loadStores(user.id);
    }
  }

  async function signOut() {
    await AsyncStorage.removeItem(LAST_STORE_ID_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStore(null);
    setStores([]);
    setStoresLoaded(false);
    setMemberRoles({});
  }

  // 현재 매장에서의 역할 (오너이면 admin, 아니면 memberRoles에서 조회)
  const currentRole: 'admin' | 'member' =
    !store || !user ? 'admin' :
    store.owner_id === user.id ? 'admin' :
    memberRoles[store.id] ?? 'member';

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setLoading(true);

        if (session?.user) {
          const user = session.user;
          setSession(session);
          setUser(user);
          // onAuthStateChange 콜백 안에서 Supabase 쿼리를 직접 호출하면
          // 내부 잠금으로 인해 데드락이 발생하므로 setTimeout으로 defer
          setTimeout(async () => {
            try {
              await loadStores(user.id);
            } catch (e) {
              console.error('[Auth] loadStores error:', e);
            } finally {
              setLoading(false);
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

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, store, stores, storesLoaded, currentRole, loading, signOut, refreshStore, switchStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
