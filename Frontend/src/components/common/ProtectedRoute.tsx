import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type AuthUser } from "@/app/providers/AuthContext";
import LoadingOverlay from "@/components/common/LoadingOverlay";

type ProtectedRouteProps = {
  children: ReactNode;
  // When provided, the user's `role` must be one of these to view the route
  // (Team Lead / HR Manager / Administrator workspaces). Omit for routes
  // every authenticated role can see (Dashboard, Profile, Phase 1 screens).
  roles?: NonNullable<AuthUser["role"]>[];
};

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  // On a hard refresh the stored token is re-validated against GET /auth/me.
  // Until that resolves we know nothing about the session, so redirecting here
  // would bounce an authenticated user to /login on every reload.
  if (isLoading) {
    return <LoadingOverlay show label="Restoring your session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0 && !(user?.role && roles.includes(user.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
