import type { ReactNode } from "react";
import { AuthProvider } from "@/app/providers/AuthContext";
import { DevAuthProvider } from "@/app/providers/DevAuthContext";
import { BrandingProvider } from "@/app/providers/BrandingContext";
import { ThemeProvider } from "@/app/providers/ThemeContext";
import { NotificationsProvider } from "@/app/providers/NotificationsContext";
import { ToastProvider } from "@/app/providers/ToastContext";

/**
 * Single composition root for every context provider the app needs.
 * Order matters: Auth must be outermost since Branding/Notifications/Toast
 * all assume a logged-in (or logging-in) user is available.
 *
 * DevAuthProvider is the REAL backend-driven RBAC session (see
 * DevAuthContext.tsx): it fetches the live role -> permission graph, so
 * `hasPermission` reflects what the server will actually allow. /dashboard
 * (RbacDashboard) and the appraisal screens read from it. The /dev-login and
 * /rbac-dashboard routes it was originally built for no longer exist — the
 * real login at /login now issues the JWT it consumes.
 *
 * AuthProvider/AuthContext is the session used by the sidebar, header and
 * route guards (role slug + user profile). Both are mounted because the two
 * concerns have not been merged yet: AuthContext answers "who is this and
 * what role slug do they have", DevAuthContext answers "which permission
 * strings do they hold".
 *
 * ThemeProvider sits INSIDE BrandingProvider because it reads themeConfig +
 * primaryColor from it and is the sole applier of the design CSS variables.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DevAuthProvider>
        <BrandingProvider>
          <ThemeProvider>
            <NotificationsProvider>
              <ToastProvider>{children}</ToastProvider>
            </NotificationsProvider>
          </ThemeProvider>
        </BrandingProvider>
      </DevAuthProvider>
    </AuthProvider>
  );
}

export default AppProviders;
