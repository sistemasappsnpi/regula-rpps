import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, type Tenant } from "./api";

interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  isSuperAdmin: boolean;
  features: string[];
  hasFeature: (key: string) => boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me.user);
      setTenant(me.tenant);
      setIsSuperAdmin(me.isSuperAdmin);
      setFeatures(me.features);
    } catch {
      clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await api.login(email, password);
      setToken(result.token);
      setUser(result.user);
      setTenant(result.tenant);
      setIsSuperAdmin(result.isSuperAdmin);
      setFeatures(result.features);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setTenant(null);
    setIsSuperAdmin(false);
    setFeatures([]);
  }, []);

  const hasFeature = useCallback((key: string) => features.includes(key), [features]);

  const value = useMemo(
    () => ({ user, tenant, isSuperAdmin, features, hasFeature, loading, error, login, logout }),
    [user, tenant, isSuperAdmin, features, hasFeature, loading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
  }
  return ctx;
}
