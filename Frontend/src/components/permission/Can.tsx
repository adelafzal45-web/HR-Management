import type { ReactNode } from "react";
import { useDevAuth } from "@/app/providers/DevAuthContext";

type CanProps = {
  /** A single backend permission key, e.g. "employees.create" */
  permission?: string;
  /** True if ANY of these permission keys is enough */
  anyOf?: string[];
  /** True if ALL of these permission keys are required */
  allOf?: string[];
  /** A backend role_name to require instead of / in addition to permissions */
  role?: string;
  children: ReactNode;
  /** Rendered instead of children when access is denied. Omit to render nothing (hide). */
  fallback?: ReactNode;
};

/**
 * Global permission guard for UI elements (buttons, menu items, tabs,
 * sections). Hides (or replaces with `fallback`) its children when the
 * current dev-session role lacks the required backend permission key(s).
 *
 * This is a UX convenience only — the backend's PermissionGuard is the real
 * authority and re-checks every request independently.
 */
export function Can({ permission, anyOf, allOf, role, children, fallback = null }: CanProps) {
  const { hasPermission, hasAnyPermission, hasRole, isAuthenticated } = useDevAuth();

  if (!isAuthenticated) return <>{fallback}</>;

  if (role && !hasRole(role)) return <>{fallback}</>;
  if (permission && !hasPermission(permission)) return <>{fallback}</>;
  if (anyOf && anyOf.length > 0 && !hasAnyPermission(anyOf)) return <>{fallback}</>;
  if (allOf && allOf.length > 0 && !allOf.every((p) => hasPermission(p))) return <>{fallback}</>;

  return <>{children}</>;
}

export default Can;
