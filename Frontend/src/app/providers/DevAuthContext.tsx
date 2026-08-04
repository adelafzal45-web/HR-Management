// ============================================================================
// DevAuthContext — compatibility adapter over the real JWT session.
//
// This used to be the x-user-id dev bypass: you typed a raw User UUID, picked
// a role, and the client sent that id as a spoofable header. The backend now
// has real auth (POST /auth/login issues a JWT; JwtAuthGuard verifies it and
// PermissionGuard reads identity from the *verified token*), so the bypass is
// both unnecessary and no longer accepted server-side.
//
// The hook is kept — as a read-only projection of AuthContext — because
// Can.tsx, PermissionRoute.tsx and RbacDashboard.tsx consume this exact
// shape. New code should call `useAuth()` from AuthContext directly.
// ============================================================================

import { useContext, useMemo, createContext, type ReactNode } from "react";
import { useAuth } from "@/app/providers/AuthContext";

/** Mirrors the old dev-session shape so existing consumers keep compiling. */
export type DevSession = {
  userId: string;
  role: { role_id: string; role_name: string };
  permissions: string[];
};

type DevAuthContextValue = {
  session: DevSession | null;
  isAuthenticated: boolean;
  logout: () => void;
  hasPermission: (permissionKey: string) => boolean;
  hasAnyPermission: (permissionKeys: string[]) => boolean;
  hasRole: (roleName: string) => boolean;
};

const DevAuthContext = createContext<DevAuthContextValue | null>(null);

export function DevAuthProvider({ children }: { children: ReactNode }) {
  const {
    user,
    permissions,
    isAuthenticated,
    logout,
    hasPermission,
    hasAnyPermission,
  } = useAuth();

  const value = useMemo<DevAuthContextValue>(() => {
    const session: DevSession | null = user
      ? {
          userId: user.employeeId,
          role: {
            role_id: user.roleId ?? "",
            role_name: user.roleName ?? "Unknown",
          },
          permissions,
        }
      : null;

    return {
      session,
      isAuthenticated,
      logout,
      hasPermission,
      hasAnyPermission,
      hasRole: (roleName: string) =>
        Boolean(user?.roleName?.toLowerCase() === roleName.toLowerCase()),
    };
  }, [user, permissions, isAuthenticated, logout, hasPermission, hasAnyPermission]);

  return <DevAuthContext.Provider value={value}>{children}</DevAuthContext.Provider>;
}

export function useDevAuth() {
  const ctx = useContext(DevAuthContext);
  if (!ctx) throw new Error("useDevAuth must be used within DevAuthProvider");
  return ctx;
}
