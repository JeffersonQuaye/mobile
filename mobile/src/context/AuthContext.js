import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearSession,
  loadEnvPreference,
  loadSession,
  saveEnvPreference,
  saveSession,
} from "../services/storage";
import { authService, refreshSession } from "../services/api";
import { setRuntimeEnv } from "../config/env";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  // Restore stored session and env preference on start
  useEffect(() => {
    async function init() {
      try {
        const savedEnv = await loadEnvPreference();
        if (savedEnv) {
          setRuntimeEnv(savedEnv);
        }

        const storedSession = await loadSession();
        if (storedSession) {
          setSession(storedSession);
        }
      } catch (err) {
        console.warn("Session restore error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Periodic token refresh every 10 minutes
  useEffect(() => {
    if (!session?.refresh_token) return undefined;

    const interval = setInterval(
      async () => {
        try {
          const renewed = await refreshSession(session.refresh_token);
          setSession(renewed);
        } catch (err) {
          console.warn("Automatic token refresh failed:", err);
          await clearSession();
          setSession(null);
        }
      },
      10 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [session?.refresh_token]);

  const login = useCallback(async (user, token, refreshToken) => {
    const newSession = { user, token, refresh_token: refreshToken };
    await saveSession(newSession);
    setSession(newSession);
    setAuthError("");
  }, []);

  const logout = useCallback(async () => {
    if (session?.refresh_token) {
      await authService.logout(session.refresh_token);
    }
    await clearSession();
    setSession(null);
    setAuthError("");
  }, [session?.refresh_token]);

  const switchEnvironment = useCallback(async (envName, customUrl = null) => {
    setRuntimeEnv(envName, customUrl);
    await saveEnvPreference(envName);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      token: session?.token || null,
      isAuthenticated: Boolean(session?.token),
      loading,
      authError,
      setAuthError,
      login,
      logout,
      switchEnvironment,
    }),
    [session, loading, authError, login, logout, switchEnvironment],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
