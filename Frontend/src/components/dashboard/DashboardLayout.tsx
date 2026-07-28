import { useEffect, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

type DashboardLayoutProps = {
  title: string;
  activeKey?: string;
  children: ReactNode;
};

export default function DashboardLayout({ title, activeKey, children }: DashboardLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    <div className="flex h-[100dvh] w-full overflow-hidden bg-gray-50">
      <Sidebar activeKey={activeKey} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="scroll-touch scrollbar-hide min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 xs:px-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
