import { useEffect, useState, type ReactNode } from "react";
import Sidebar from "@/modules/dashboard/components/Sidebar";
import Header from "@/modules/dashboard/components/Header";
import Breadcrumbs from "@/components/common/Breadcrumbs";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { useAuth } from "@/app/providers/AuthContext";
import { useBranding } from "@/app/providers/BrandingContext";
import badge from "@/assets/badge.png";

type DashboardLayoutProps = {
 title: string;
 activeKey?: string;
 children: ReactNode;
};

export default function DashboardLayout({ title, activeKey, children }: DashboardLayoutProps) {
 const [mobileNavOpen, setMobileNavOpen] = useState(false);
 // Owned once, here, instead of Sidebar and Header each mounting their own
 // copy of the same "Log out?" dialog — same trigger, same dialog, no
 // risk of the two copies ever drifting apart in copy or behavior.
 const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
 const { logout } = useAuth();
 const { branding } = useBranding();
 const companyName = branding.companyName || "TechnoCues";

 // Lock the body while the mobile drawer is open so the page behind it
 // can't scroll along with it (the classic "double scroll" iOS bug).
 useEffect(() => {
 if (!mobileNavOpen) return;
 const { overflow } = document.body.style;
 document.body.style.overflow = "hidden";
 return () => {
 document.body.style.overflow = overflow;
 };
 }, [mobileNavOpen]);

 return (
 // Fixed to the viewport height — the sidebar and the main content area
 // below are each their own independent, self-contained scroll regions
 // instead of the whole page scrolling as one long column.
 <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
 <Sidebar
 activeKey={activeKey}
 mobileOpen={mobileNavOpen}
 onClose={() => setMobileNavOpen(false)}
 onRequestLogout={() => setConfirmLogoutOpen(true)}
 />

 <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
 <Header
 title={title}
 onMenuClick={() => setMobileNavOpen(true)}
 onRequestLogout={() => setConfirmLogoutOpen(true)}
 />
 <main className="scroll-touch scrollbar-hide min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 xs:px-4 sm:px-6 sm:py-6 lg:px-8">
 <div className="mx-auto w-full max-w-content">
					<Breadcrumbs />
					{children}
				</div>
 </main>
 </div>

 <ConfirmDialog
 open={confirmLogoutOpen}
 title={`Log out of ${companyName}?`}
 description="You'll need to sign in again to access your dashboard."
 confirmLabel="Log Out"
 cancelLabel="Cancel"
 tone="danger"
 icon={
 <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted ring-4 ring-border-muted/40">
 <img src={badge} alt={companyName} className="h-7 w-7 rounded-full object-contain" />
 </div>
 }
 onConfirm={() => {
 setConfirmLogoutOpen(false);
 void logout();
 }}
 onCancel={() => setConfirmLogoutOpen(false)}
 />
 </div>
 );
}
