import { useState, useEffect } from 'react';
import { AuthService, subscribeToAuth } from '../lib/authService';
import type { AuthSession, UserProfile } from '../types/auth';

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => AuthService.getCurrentSession());
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    // Initial sync
    setSession(AuthService.getCurrentSession());

    // Listen to changes
    const unsubscribe = subscribeToAuth(updatedSession => {
      setSession(updatedSession);
    });

    return unsubscribe;
  }, []);

  const user: UserProfile | null = session ? session.user : null;
  const isAuthenticated = Boolean(session && session.user && session.user.email_verified);

  return {
    session,
    user,
    isAuthenticated,
    loading,
    setLoading,
    logout: () => AuthService.logout()
  };
}
