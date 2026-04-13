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
  const [loading, setLoading] = useState(true);

  async function loadStores(userId: string) {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      setStores([]);
      setStore(null);
      return;
    }

    const storeList = data as Store[];
    setStores(storeList);

    const lastStoreId = await AsyncStorage.getItem(LAST_STORE_ID_KEY);
    const selectedStore = lastStoreId ? storeList.find(s => s.id === lastStoreId) : storeList[0];
    setStore(selectedStore ?? null);
  }

  async function switchStore(storeId: string) {
    await AsyncStorage.setItem(LAST_STORE_ID_KEY, storeId);
    setStore(stores.find(s => s.id === storeId) ?? null);
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
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true);

        if (session) {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setStore(null);
            setStores([]);
            setLoading(false);
            return;
          }
          setSession(session);
          setUser(user);
          await loadStores(user.id);
        } else {
          setSession(null);
          setUser(null);
          setStore(null);
          setStores([]);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, store, stores, loading, signOut, refreshStore, switchStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
