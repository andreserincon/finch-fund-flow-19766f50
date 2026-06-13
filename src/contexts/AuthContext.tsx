/**
 * @file AuthContext.tsx
 * @description Single shared auth source. The session check, the profile
 *   fetch, and the onAuthStateChange subscription run ONCE here, at the app
 *   root, instead of once per component. Previously useAuth was a plain hook,
 *   so every route guard, the sidebar, the bottom nav, the role hooks, and the
 *   dashboard each opened their own subscription and fetched the profile over
 *   the network independently (roughly fifteen duplicate fetches per screen),
 *   which made the whole app feel slow. Consumers read this context via the
 *   useAuth hook, whose public shape is unchanged.
 */
import { createContext, useState, useEffect, type ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/lib/types';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  signUp: (email: string, password: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<{ error: unknown }>;
  isTreasurer: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  /** Currently authenticated user (null if logged out) */
  const [user, setUser] = useState<User | null>(null);
  /** Active Supabase session */
  const [session, setSession] = useState<Session | null>(null);
  /** Extra profile data from the `profiles` table */
  const [profile, setProfile] = useState<Profile | null>(null);
  /** True while the initial session check is in progress */
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer the profile fetch to avoid potential Supabase client deadlocks
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // 2) Check for an existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Fetch the user's profile row from the `profiles` table.
   * Contains the legacy `role` field used by some parts of the app.
   */
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching profile:', error);
        }
      } else {
        setProfile(data as Profile | null);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error in fetchProfile:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  /** Sign in with email + password */
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  /** Create a new account (email confirmation required by default) */
  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error };
  };

  /** Sign the current user out */
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  /** Convenience flag - true when the profile.role is "treasurer" */
  const isTreasurer = profile?.role === 'treasurer';

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signIn, signUp, signOut, isTreasurer }}
    >
      {children}
    </AuthContext.Provider>
  );
}
