import { useState, useEffect } from 'react';
import { AuthService, subscribeToAuth } from '../lib/authService';
import { CloudShareService } from '../lib/cloudShare';
import type { AuthSession, UserProfile } from '../types/auth';

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => AuthService.getCurrentSession());
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    // Initial sync
    setSession(AuthService.getCurrentSession());

    // Sync user role from cloud in background
    AuthService.syncCurrentUserRole();

    // Listen to local auth session changes
    const unsubscribe = subscribeToAuth(updatedSession => {
      setSession(updatedSession);
    });

    // Real-time update when an admin changes user role/profile from another screen
    const unsubGlobal = CloudShareService.subscribeToGlobalRealtimeEvents(evt => {
      if (evt.type === 'user_updated') {
        const currentSession = AuthService.getCurrentSession();
        if (currentSession && currentSession.user) {
          const matchUser =
            (evt.userId && evt.userId === currentSession.user.id) ||
            (evt.username &&
              evt.username.toLowerCase() === currentSession.user.username?.toLowerCase().replace(/^@+/, ''));
          if (matchUser && evt.is_banned && currentSession.user.username?.toLowerCase() !== 'malaca') {
            AuthService.logout();
            setSession(null);
            window.dispatchEvent(
              new CustomEvent('7notpad_user_banned', {
                detail: { message: 'Sua conta de usuário foi suspensa pela administração.' },
              })
            );
            return;
          }
        }
        AuthService.syncCurrentUserRole();
      }
    });

    const handleBannedEvent = () => {
      setSession(null);
    };
    window.addEventListener('7notpad_user_banned', handleBannedEvent);

    const handleFocus = () => {
      AuthService.syncCurrentUserRole();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      unsubscribe();
      unsubGlobal();
      window.removeEventListener('7notpad_user_banned', handleBannedEvent);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

  const user: UserProfile | null = session ? session.user : null;
  const isAuthenticated = Boolean(session && session.user);

  return {
    session,
    user,
    isAuthenticated,
    loading,
    setLoading,
    logout: () => AuthService.logout()
  };
}

