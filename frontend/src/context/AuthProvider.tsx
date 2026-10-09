import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import { refreshSession, setSessionExpiredHandler } from "../api/client";
import { setAccessToken } from "../api/tokenStore";
import type { Session, User } from "../types/auth";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const startSession = useCallback((session: Session) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  // When the page loads, try to restore the session from the refresh cookie.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (active) startSession(session);
      })
      .catch(() => {
        if (active) clearSession();
      });
    return () => {
      active = false;
    };
  }, [startSession, clearSession]);

  // If a request discovers the session is over, log the user out of the screen too.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      startSession(await authApi.login(identifier, password));
    },
    [startSession]
  );

  const register = useCallback(
    async (payload: authApi.RegisterPayload) => {
      startSession(await authApi.register(payload));
    },
    [startSession]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server cannot be reached, this device is logged out.
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
