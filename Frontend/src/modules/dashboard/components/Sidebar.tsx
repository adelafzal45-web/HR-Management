import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, X, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import badge from "@/assets/badge.png";
import { useAuth } from "@/app/providers/AuthContext";
import { useBranding } from "@/app/providers/BrandingContext";
import type { Role } from "@/constants/roles";
import {
  NAV_TREE,
  isGroup,
  canAccess,
  resolveLeafPath,
  pathMatchesLocation,
  type NavNode,
  type NavGroup,
  type NavLeaf,
} from "@/config/navigation";

const COLLAPSE_STORAGE_KEY = "technocues:sidebar-collapsed";

type SidebarProps = {
  activeKey?: string;
  mobileOpen: boolean;
  onClose: () => void;
  onRequestLogout: () => void;
};

/** True if this leaf (or any leaf under this group) is the current route. */
function isNodeActive(
  node: NavNode,
  pathname: string,
  search: string,
  activeKey: string | undefined,
  role: Role | undefined,
): boolean {
  if (isGroup(node)) {
    return node.children.some((child) => isNodeActive(child, pathname, search, activeKey, role));
  }
  if (activeKey && node.key === activeKey) return true;
  return pathMatchesLocation(resolveLeafPath(node, role), pathname, search);
}

function SidebarLeafButton({
  icon: Icon,
  label,
  isActive,
  collapsed,
  nested,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  collapsed: boolean;
  nested?: boolean;
  onClick: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

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
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center rounded-xl text-left text-[15px] font-medium transition-colors duration-150 ${
          collapsed ? "mx-auto w-11 justify-center py-2.5" : `w-full py-3 ${nested ? "pl-11 pr-4" : "px-4"}`
        } ${
          isActive
            ? collapsed
              ? "bg-transparent"
              : "bg-brand-light text-brand"
            : "text-muted-foreground hover:bg-background hover:text-foreground"
        }`}
      >
        {!nested && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
              isActive ? "bg-brand text-brand-contrast" : "bg-transparent text-muted-foreground"
            }`}
          >
            <Icon size={18} />
          </span>
        )}
        {nested && !collapsed && (
          <span className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-brand" : "bg-muted-foreground"}`} />
        )}
        {!collapsed && (
          <span
            className={`${nested ? "" : "ml-3"} max-w-[160px] overflow-hidden truncate whitespace-nowrap opacity-100 ${
              isActive ? "text-brand font-semibold" : ""
            }`}
          >
            {label}
          </span>
        )}
      </button>

      {collapsed &&
        tooltipPos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
            className="pointer-events-none fixed z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-foreground py-1.5 pl-2 pr-3.5 text-xs font-medium text-background shadow-card-lg"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background/10 text-background">
              <Icon size={14} />
            </span>
            {label}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-foreground" />
          </span>,
          document.body,
        )}
    </div>
  );
}

function SidebarGroup({
  node,
  pathname,
  search,
  activeKey,
  role,
  collapsed,
  expandedKeys,
  onToggleExpand,
  onLeafClick,
  onExpandFromCollapsed,
}: {
  node: NavGroup;
  pathname: string;
  search: string;
  activeKey: string | undefined;
  role: Role | undefined;
  collapsed: boolean;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string) => void;
  onLeafClick: (leafNode: NavLeaf) => void;
  onExpandFromCollapsed: (groupKey: string) => void;
}) {
  const visibleChildren = node.children.filter((child) => canAccess(child, role));
  if (visibleChildren.length === 0) return null;

  const active = isNodeActive(node, pathname, search, activeKey, role);
  const isOpen = collapsed ? false : expandedKeys.has(node.key);

  return (
    <div>
      <button
        type="button"
        onClick={() => (collapsed ? onExpandFromCollapsed(node.key) : onToggleExpand(node.key))}
        aria-expanded={isOpen}
        className={`flex items-center rounded-xl text-left text-[15px] font-medium transition-colors duration-150 ${
          collapsed ? "mx-auto w-11 justify-center py-2.5" : "w-full px-4 py-3"
        } ${active ? "text-brand" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
            active ? "bg-brand text-brand-contrast" : "bg-transparent text-muted-foreground"
          }`}
        >
          <node.icon size={18} />
        </span>
        {!collapsed && (
          <>
            <span className={`ml-3 flex-1 truncate whitespace-nowrap ${active ? "text-brand font-semibold" : ""}`}>
              {node.label}
            </span>
            <ChevronDown
              size={15}
              className={`shrink-0 text-muted-foreground transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {!collapsed && isOpen && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {visibleChildren.map((child) =>
            isGroup(child) ? (
              <SidebarGroup
                key={child.key}
                node={child}
                pathname={pathname}
                search={search}
                activeKey={activeKey}
                role={role}
                collapsed={false}
                expandedKeys={expandedKeys}
                onToggleExpand={onToggleExpand}
                onLeafClick={onLeafClick}
                onExpandFromCollapsed={onExpandFromCollapsed}
              />
            ) : (
              <SidebarLeafButton
                key={child.key}
                icon={child.icon}
                label={child.label}
                nested
                collapsed={false}
                isActive={isNodeActive(child, pathname, search, activeKey, role)}
                onClick={() => onLeafClick(child)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  activeKey,
  onNavigate,
  collapsed = false,
  onRequestLogout,
  onExpandFromCollapsed,
}: {
  activeKey?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onRequestLogout: () => void;
  onExpandFromCollapsed: (groupKey: string) => void;
}) {
  const { isAuthenticated, user } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const logoSrc = branding.logoUrl || logo;
  // The folded rail renders into a 36–40px circle, so the wide wordmark is the
  // wrong asset there — it squashes to an unreadable smear. Prefer the dedicated
  // collapsed logo, fall back to the wordmark only if no collapsed variant was
  // configured, and to the bundled badge if branding is empty entirely.
  const badgeSrc = branding.logoCollapsedUrl || branding.logoUrl || badge;
  const role = user?.role;

  // Auto-expand whichever group contains the active route, on top of
  // whatever the person has manually opened, so the current page's section
  // never looks collapsed on load or after a hard navigation.
  const autoExpandedKey = useMemo(() => {
    for (const node of NAV_TREE) {
      if (isGroup(node) && isNodeActive(node, location.pathname, location.search, activeKey, role)) {
        return node.key;
      }
    }
    return null;
  }, [location.pathname, location.search, activeKey, role]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(autoExpandedKey ? [autoExpandedKey] : []),
  );

  useEffect(() => {
    if (autoExpandedKey) {
      setExpandedKeys((prev) => (prev.has(autoExpandedKey) ? prev : new Set(prev).add(autoExpandedKey)));
    }
  }, [autoExpandedKey]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleLogoClick = () => {
    navigate(isAuthenticated ? "/dashboard" : "/login");
    onNavigate?.();
  };

  const handleLeafClick = (leafNode: NavLeaf) => {
    const dest = resolveLeafPath(leafNode, role);
    navigate(dest);
    onNavigate?.();
  };

  const handleExpandFromCollapsed = (groupKey: string) => {
    setExpandedKeys((prev) => new Set(prev).add(groupKey));
    onExpandFromCollapsed(groupKey);
  };

  const visibleTree = NAV_TREE.filter((node) => canAccess(node, role));

  return (
    <>
      <button
        type="button"
        onClick={handleLogoClick}
        className="mb-10 flex h-10 shrink-0 items-center self-start rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        aria-label={`Go to ${branding.companyName || "TechnoCues"} home`}
      >
        {collapsed ? (
          <img
            src={badgeSrc}
            alt={branding.companyName || "TechnoCues"}
            className="h-9 w-9 rounded-full object-contain shadow-card ring-2 ring-surface xs:h-10 xs:w-10"
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
        {visibleTree.map((node) =>
          isGroup(node) ? (
            <SidebarGroup
              key={node.key}
              node={node}
              pathname={location.pathname}
              search={location.search}
              activeKey={activeKey}
              role={role}
              collapsed={collapsed}
              expandedKeys={expandedKeys}
              onToggleExpand={toggleExpand}
              onLeafClick={handleLeafClick}
              onExpandFromCollapsed={handleExpandFromCollapsed}
            />
          ) : (
            <SidebarLeafButton
              key={node.key}
              icon={node.icon}
              label={node.label}
              collapsed={collapsed}
              isActive={isNodeActive(node, location.pathname, location.search, activeKey, role)}
              onClick={() => handleLeafClick(node)}
            />
          ),
        )}
      </nav>

      <div className="mt-4">
        <SidebarLeafButton
          icon={LogOut}
          label="Logout"
          collapsed={collapsed}
          onClick={() => {
            onNavigate?.();
            onRequestLogout();
          }}
        />
      </div>
    </>
  );
}

export default function Sidebar({ activeKey, mobileOpen, onClose, onRequestLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Clicking a group while the rail is folded un-collapses the rail (the
  // group then opens itself via SidebarContent's expandedKeys state)
  // instead of silently doing nothing.
  const expandFromCollapsed = () => setCollapsed(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`relative z-30 hidden h-[100dvh] shrink-0 flex-col border-r border-border-muted bg-surface transition-[width] duration-200 ease-in-out lg:flex ${
          collapsed ? "w-sidebar-collapsed" : "w-sidebar"
        }`}
      >
        <div className="scroll-touch scrollbar-hide flex h-full flex-col overflow-y-auto overflow-x-hidden px-4 py-6">
          <SidebarContent
            activeKey={activeKey}
            collapsed={collapsed}
            onRequestLogout={onRequestLogout}
            onExpandFromCollapsed={expandFromCollapsed}
          />
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-card transition hover:border-brand hover:text-brand-dark"
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
          className={`absolute inset-0 bg-black/40 transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={onClose}
        />
        <aside
          className={`scroll-touch scrollbar-hide absolute inset-y-0 left-0 flex w-sidebar max-w-[85%] flex-col overflow-y-auto overflow-x-hidden overscroll-contain bg-surface px-4 py-6 shadow-card-lg transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
          <SidebarContent
            activeKey={activeKey}
            onNavigate={onClose}
            onRequestLogout={onRequestLogout}
            onExpandFromCollapsed={() => {}}
          />
        </aside>
      </div>
    </>
  );
}
