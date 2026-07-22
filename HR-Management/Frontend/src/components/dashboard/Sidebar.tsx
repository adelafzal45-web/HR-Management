import { useEffect, useState } from "react";
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
  CalendarClock,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import badge from "../../assets/badge.png";
import { useAuth } from "../../lib/AuthContext";
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
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex items-center rounded-xl text-left text-[15px] font-medium transition-colors ${
          collapsed ? "mx-auto w-11 justify-center py-2.5" : "w-full px-4 py-3"
        } ${
          isActive
            ? "bg-brand-light text-gray-900"
            : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isActive ? "bg-brand text-white" : "bg-transparent text-gray-400"
          }`}
        >
          <Icon size={18} />
        </span>
        {!collapsed && (
          <span className="ml-3 max-w-[160px] overflow-hidden whitespace-nowrap opacity-100">
            {label}
          </span>
        )}
      </button>

      {/* Tooltip — only relevant (and only rendered) when the rail is folded.
          Shows the icon alongside the full title so the hover preview mirrors
          exactly what the expanded item looks like. */}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-gray-900 py-1.5 pl-2 pr-3.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:opacity-100"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
            <Icon size={14} />
          </span>
          {label}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-gray-900" />
        </span>
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
  const navigate = useNavigate();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const isTeamLead = user?.role === "team_lead";

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
            src={badge}
            alt="TechnoCues"
            className="h-9 w-9 rounded-full object-contain shadow-sm ring-2 ring-white xs:h-10 xs:w-10"
          />
        ) : (
          <img src={logo} alt="TechnoCues" className="h-auto w-[150px] object-contain" />
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/40">
            <img src={badge} alt="TechnoCues" className="h-10 w-10 rounded-full object-contain" />
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
      {/* Desktop sidebar — folds to an icon rail via the toggle button; individual
          icons reveal their full title in a tooltip on hover while folded. */}
      <aside
        className={`relative z-30 hidden shrink-0 flex-col border-r border-gray-100 bg-white px-4 py-6 transition-[width] duration-200 ease-in-out lg:flex ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <SidebarContent activeKey={activeKey} collapsed={collapsed} />

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
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-white px-4 py-6 shadow-xl transition-transform duration-200 ${
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
