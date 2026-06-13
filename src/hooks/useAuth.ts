/**
 * @file useAuth.ts
 * @description Auth hook. Reads the single shared auth source provided by
 *   AuthProvider (src/contexts/AuthContext.tsx). The session, profile, and
 *   auth subscription are created ONCE at the app root, not per component, so
 *   mounting many consumers no longer fans out into duplicate network fetches.
 *   The returned shape (user, session, profile, loading, signIn, signUp,
 *   signOut, isTreasurer) is unchanged, so call sites need no edits.
 *
 * Usage:
 *   const { user, profile, signIn, signOut, loading } = useAuth();
 */
import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
