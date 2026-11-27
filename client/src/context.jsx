import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const hiddenAt = useRef(null);
  const loggingOut = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/auth/me');
      setUser(data.user || null);
      return data.user || null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback((nextUser) => {
    setUser(nextUser);
    setLoading(false);
  }, []);

  const logout = useCallback(async ({ silent = false } = {}) => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    setUser(null);
    loggingOut.current = false;
    if (!silent) window.location.assign('/login');
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const ping = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await api('/auth/heartbeat', { method: 'POST' });
      } catch (error) {
        if (error.status === 401) setUser(null);
      }
    };

    const interval = window.setInterval(ping, 45_000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current) {
        const awayMinutes = (Date.now() - hiddenAt.current) / 60_000;
        hiddenAt.current = null;
        if (awayMinutes >= 20) {
          setUser(null);
          api('/auth/logout', { method: 'POST' }).catch(() => {});
          window.location.assign('/login?expired=1');
          return;
        }
      }
      ping();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
