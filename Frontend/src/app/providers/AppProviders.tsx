import type { ReactNode } from "react";
import { AuthProvider } from "@/app/providers/AuthContext";
import { BrandingProvider } from "@/app/providers/BrandingContext";
import { NotificationsProvider } from "@/app/providers/NotificationsContext";
import { ToastProvider } from "@/app/providers/ToastContext";

/**
 * Single composition root for every context provider the app needs.
 * Order matters: Auth must be outermost since Branding/Notifications/Toast
 * all assume a logged-in (or logging-in) user is available.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <BrandingProvider>
        <NotificationsProvider>
          <ToastProvider>{children}</ToastProvider>
        </NotificationsProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}

export default AppProviders;
