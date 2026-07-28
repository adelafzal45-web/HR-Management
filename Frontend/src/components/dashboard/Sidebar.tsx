import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  ClipboardCheck,
  CalendarX2,
  Wallet,
  Bell,
  User,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Users,
  UsersRound,
  CalendarClock,
  CalendarCheck,
  ClipboardList,
  BarChart3,
  Settings as SettingsIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import badge from "../../assets/badge.png";
import { useAuth } from "../../lib/AuthContext";
import { useBranding } from "../../lib/BrandingContext";
import ConfirmDialog from "../ConfirmDialog";

type NavItem = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "attendance", label: "Attendance", icon: Fingerprint },
  { key: "leave", label: "Leave", icon: CalendarX2 },
  { key: "payroll", label: "Payroll", icon: Wallet },
  { key: "appraisal", label: "Appraisal", icon: ClipboardCheck },
  { key: "notification", label: "Notification", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
];

// Phase 2 — only shown to users whose session role is "team_lead"
// (UC-13..UC-18). HR Manager / Administrator nav sections follow the same
// pattern once those phases are built.
const TEAM_LEAD_NAV_ITEMS: NavItem[] = [
  { key: "team-members", label: "My Team", icon: Users },
  { key: "team-attendance", label: "Team Attendance", icon: CalendarClock },
  { key: "team-leaves", label: "Team Leaves", icon: CalendarX2 },
  { key: "appraisal-criteria", label: "Appraisal Criteria", icon: ClipboardList },
  { key: "team-reports", label: "Team Reports", icon: BarChart3 },
];

// Phase 2 — HR Manager / Administrator workspace: Settings (Company Details,
// Departments, Designations, Roles, Permissions, Branding). Gated the same
// way the Team Lead section is gated above.
const ADMIN_NAV_ITEMS: NavItem[] = [
  { key: "employees", label: "Employees", icon: UsersRound },
  { key: "attendance-records", label: "Attendance Records", icon: CalendarCheck },
  { key: "leave-requests", label: "Leave Requests", icon: CalendarX2 },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

// Every nav key now maps to a real route — nothing here should fall through
// to the /coming-soon placeholder anymore (Phase 1 covers all of these).
const ROUTE_BY_KEY: Record<string, string> = {
  dashboard: "/dashboard",
  attendance: "/attendance",
  leave: "/leave",
  payroll: "/payroll",
  appraisal: "/appraisal",
  notification: "/notifications",
  profile: "/edit-profile",
  "team-members": "/team",
  "team-attendance": "/team/attendance",
  "team-leaves": "/team/leaves",
  "appraisal-criteria": "/team/appraisal-criteria",
  "team-reports": "/team/reports",
  employees: "/employees",
  "attendance-records": "/attendance-records",
  "leave-requests": "/leave-requests",
  settings: "/settings",
};

const COLLAPSE_STORAGE_KEY = "technocues:sidebar-collapsed";

type SidebarProps = {
  activeKey?: string;
  mobileOpen: boolean;
  onClose: () => void;
};

// A single nav (or logout) button. When `collapsed` is true it shows just the
// icon, and reveals the item's full title in a tooltip on hover — the
// sidebar itself no longer expands on hover, only via the fold button.
function SidebarItemButton({
  icon: Icon,
  label,
  isActive,
  collapsed,
  onClick,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  isActive?: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  // The tooltip used to be `absolute` inside the scroll rail, which meant
  // its width counted toward the rail's scrollable area — with the rail
  // folded down to 80px, that overflow silently made the whole sidebar
  // pannable left/right. Rendering it into a portal at a fixed viewport
  // position keeps the rail's own box (and therefore its scroll extent)
  // limited to its actual width.
  const showTooltip = () => {
    if (!collapsed || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
  };
  const hideTooltip = () => setTooltipPos(null);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex items-center rounded-xl text-left text-[15px] font-medium transition-colors duration-150 ${
          collapsed ? "mx-auto w-11 justify-center py-2.5" : "w-full px-4 py-3"
        } ${
          isActive
            ? collapsed
              ? "bg-transparent"
              : "bg-brand-light text-brand"
            : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
            isActive ? "bg-brand text-white" : "bg-transparent text-gray-400"
          }`}
        >
          <Icon size={18} />
        </span>
        {!collapsed && (
          <span
            className={`ml-3 max-w-[160px] overflow-hidden truncate whitespace-nowrap opacity-100 ${
              isActive ? "text-brand font-semibold" : ""
            }`}
          >
            {label}
          </span>
        )}
      </button>

      {/* Tooltip — only relevant (and only rendered) when the rail is folded.
          Shows the icon alongside the full title so the hover preview mirrors
          exactly what the expanded item looks like. Portalled to <body> and
          positioned with `fixed` coordinates so it can never affect the
          sidebar rail's own layout or scroll size. */}
      {collapsed &&
        tooltipPos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
            className="pointer-events-none fixed z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-gray-900 py-1.5 pl-2 pr-3.5 text-xs font-medium text-white shadow-lg"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
              <Icon size={14} />
            </span>
            {label}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-gray-900" />
          </span>,
          document.body,
        )}
    </div>
  );
}

function SidebarContent({
  activeKey = "dashboard",
  onNavigate,
  collapsed = false,
}: {
  activeKey?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { logout, isAuthenticated, user } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const isTeamLead = user?.role === "team_lead";
  const isAdmin = user?.role === "hr_manager" || user?.role === "administrator";
  const logoSrc = branding.logoUrl || logo;
  const badgeSrc = branding.logoUrl || badge;

  const handleLogoClick = () => {
    navigate(isAuthenticated ? "/dashboard" : "/login");
    onNavigate?.();
  };

  const handleNavClick = (key: string, label: string) => {
    const route = ROUTE_BY_KEY[key];
    if (route) {
      navigate(route);
    } else {
      navigate("/coming-soon", { state: { key, label } });
    }
    onNavigate?.();
  };

  const confirmLogout = () => {
    setConfirmLogoutOpen(false);
    onNavigate?.();
    logout();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleLogoClick}
        className="mb-10 flex h-10 shrink-0 items-center self-start rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        aria-label="Go to TechnoCues home"
      >
        {collapsed ? (
          <img
            src={badgeSrc}
            alt={branding.companyName || "TechnoCues"}
            className="h-9 w-9 rounded-full object-contain shadow-sm ring-2 ring-white xs:h-10 xs:w-10"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = badge;
            }}
          />
        ) : (
          <img
            src={logoSrc}
            alt={branding.companyName || "TechnoCues"}
            className="h-auto w-[150px] object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = logo;
            }}
          />
        )}
      </button>

      <nav className="flex flex-1 flex-col gap-1.5">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <SidebarItemButton
            key={key}
            icon={Icon}
            label={label}
            isActive={key === activeKey}
            collapsed={collapsed}
            onClick={() => handleNavClick(key, label)}
          />
        ))}

        {isTeamLead && (
          <>
            {!collapsed && (
              <p className="mb-1 mt-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Team Lead
              </p>
            )}
            {collapsed && <div className="my-3 h-px bg-gray-100" />}
            {TEAM_LEAD_NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <SidebarItemButton
                key={key}
                icon={Icon}
                label={label}
                isActive={key === activeKey}
                collapsed={collapsed}
                onClick={() => handleNavClick(key, label)}
              />
            ))}
          </>
        )}

        {isAdmin && (
          <>
            {!collapsed && (
              <p className="mb-1 mt-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Administration
              </p>
            )}
            {collapsed && <div className="my-3 h-px bg-gray-100" />}
            {ADMIN_NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <SidebarItemButton
                key={key}
                icon={Icon}
                label={label}
                isActive={activeKey === key || (key === "settings" && !!activeKey?.startsWith("settings"))}
                collapsed={collapsed}
                onClick={() => handleNavClick(key, label)}
              />
            ))}
          </>
        )}
      </nav>

      <div className="mt-4">
        <SidebarItemButton
          icon={LogOut}
          label="Logout"
          collapsed={collapsed}
          onClick={() => setConfirmLogoutOpen(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Log out of TechnoCues?"
        description="You'll need to sign in again to access your dashboard."
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        tone="danger"
        icon={
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 ring-4 ring-red-50/40">
            <img src={badge} alt="TechnoCues" className="h-7 w-7 rounded-full object-contain" />
          </div>
        }
        onConfirm={confirmLogout}
        onCancel={() => setConfirmLogoutOpen(false)}
      />
    </>
  );
}

export default function Sidebar({ activeKey, mobileOpen, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <>
      {/* Desktop sidebar — a self-contained column, completely separate from
          the main content area on the opposite side, each scrolling on its
          own. Folds to an icon rail via the toggle button; individual icons
          reveal their full title in a tooltip on hover while folded. */}
      <aside
        className={`relative z-30 hidden h-[100dvh] shrink-0 flex-col border-r border-gray-100 bg-white transition-[width] duration-200 ease-in-out lg:flex ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Scrollable, but the scrollbar itself is hidden — the rail still
            scrolls with wheel/trackpad/touch when the nav list is taller
            than the viewport, it just doesn't show a visible track. */}
        <div className="scroll-touch scrollbar-hide flex h-full flex-col overflow-y-auto overflow-x-hidden px-4 py-6">
          <SidebarContent activeKey={activeKey} collapsed={collapsed} />
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition hover:border-brand hover:text-brand-dark"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Mobile drawer — always shows full labels */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
        />
        <aside
          className={`scroll-touch scrollbar-hide absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col overflow-y-auto overflow-x-hidden overscroll-contain bg-white px-4 py-6 shadow-xl transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
          <SidebarContent activeKey={activeKey} onNavigate={onClose} />
        </aside>
      </div>
    </>
  );
}
