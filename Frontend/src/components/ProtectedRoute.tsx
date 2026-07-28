import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import type { AuthUser } from "../lib/auth";

type ProtectedRouteProps = {
  children: ReactNode;
  // When provided, the user's `role` must be one of these to view the route
  // (Team Lead / HR Manager / Administrator workspaces). Omit for routes
  // every authenticated role can see (Dashboard, Profile, Phase 1 screens).
  // A user with no `role` yet (older session / backend not returning it)
  // is treated as a plain employee and redirected, same as a mismatched role.
  roles?: NonNullable<AuthUser["role"]>[];
};

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0 && !(user?.role && roles.includes(user.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
