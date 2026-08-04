// ============================================================================
// Real JWT-based authentication context.
//
// The backend issues a JWT from POST /auth/login and includes the user's live
// permission set in the response. Every subsequent request sends the token as
// `Authorization: Bearer <token>`, verified by JwtAuthGuard + PermissionGuard.
//
// This replaces the old dev-bypass (x-user-id header) and demo fallback.
// Sessions persist in localStorage and re-validate via GET /auth/me on boot.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi, type LoginResult, type MeResult } from "@/modules/auth/api";
import { ApiError, getToken, onAuthFailure } from "@/lib/apiClient";

export type AuthUser = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  avatarUrl?: string;
  /** 128px derivative of `avatarUrl`, used for the navbar avatar. */
  avatarThumbUrl?: string;
  employeeId: string;
  role: "employee" | "team_lead" | "hr_manager" | "administrator";
  roleName: string | null;
  roleId: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  hasPermission: (permissionKey: string) => boolean;
  hasAnyPermission: (permissionKeys: string[]) => boolean;
  hasAllPermissions: (permissionKeys: string[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, check for a persisted token and re-validate it
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    authApi
      .me()
      .then((result: MeResult) => {
        if (cancelled) return;
        setUser(result.user);
        setPermissions(result.permissions);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // Token invalid or expired and refresh didn't save it — clear session.
        void authApi.logout();
        setUser(null);
        setPermissions([]);
        setError(
          err instanceof ApiError && err.status === 401
            ? "Session expired. Please log in again."
            : null,
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // apiClient refreshes expired access tokens on its own. It only reports back
  // here when the refresh itself failed, meaning the session is genuinely over
  // (revoked, expired past 7 days, or logged out elsewhere). Clearing context
  // state flips isAuthenticated to false, which the route guards act on — the
  // client never navigates from inside the transport layer.
  useEffect(() => {
    return onAuthFailure(() => {
      setUser(null);
      setPermissions([]);
      setError("Session expired. Please log in again.");
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result: LoginResult = await authApi.login(email, password);
      setUser(result.user);
      setPermissions(result.permissions);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Login failed. Please check your credentials and try again.";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // Revokes the refresh token server-side before dropping local state, so
    // the httpOnly cookie can't be used to mint new tokens after logout.
    await authApi.logout();
    setUser(null);
    setPermissions([]);
    setError(null);
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isAuthenticated: Boolean(user),
      isLoading,
      error,
      login,
      logout,
      updateUser,
      hasPermission: (key: string) => permissions.includes(key),
      hasAnyPermission: (keys: string[]) =>
        keys.some((k) => permissions.includes(k)),
      hasAllPermissions: (keys: string[]) =>
        keys.every((k) => permissions.includes(k)),
    }),
    [user, permissions, isLoading, error, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
