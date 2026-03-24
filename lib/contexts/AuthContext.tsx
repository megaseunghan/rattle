import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { Store } from '../../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  store: Store | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshStore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStore(userId: string) {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      setStore(null);
    } else {
      setStore(data[0] as Store);
    }
  }

  async function refreshStore() {
    if (user) {
      await loadStore(user.id);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setStore(null);
  }

  useEffect(() => {
    // onAuthStateChange는 마운트 시 현재 세션을 즉시 emit — getSession() 중복 불필요
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] event:', event, '| user:', session?.user?.email ?? 'null');
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadStore(session.user.id);
        } else {
          setStore(null);
        }
        console.log('[Auth] loading -> false');
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, store, loading, signOut, refreshStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
