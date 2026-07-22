import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { clearSession, getSession, setSession, type AuthSession, type AuthUser } from "./auth";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(() => getSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: Boolean(session?.token),
      login: (next) => {
        setSession(next);
        setSessionState(next);
      },
      logout: () => {
        clearSession();
        setSessionState(null);
      },
      updateUser: (updates) => {
        setSessionState((prev) => {
          if (!prev) return prev;
          const next = { ...prev, user: { ...prev.user, ...updates } };
          setSession(next);
          return next;
        });
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
