// ============================================================================
// Central navigation tree — the single source of truth for:
//   1. Sidebar structure (nested groups + items)
//   2. Breadcrumbs (derived by walking the tree to the active path)
//   3. Route guarding (AppRouter wraps every real route in <ProtectedRoute
//      roles={...}> using the exact same `roles` array defined here, so the
//      sidebar and the router can never disagree about who can see what)
//
// Every leaf is either:
//   - implemented: true  -> `path` is a real, working page
//   - implemented: false -> `path` is still a real, guarded route, it just
//     renders <ComingSoon /> until the feature ships (see AppRouter.tsx).
//     This keeps "coming soon" items behind the same RBAC + direct-URL
//     protection as everything else, instead of being an unguarded dead end.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardCheck,
  CalendarX2,
  Wallet,
  Bell,
  User,
  Fingerprint,
  UsersRound,
  Settings as SettingsIcon,
} from "lucide-react";
import { ROLES, type Role } from "@/constants/roles";

export type NavLeaf = {
  type: "leaf";
  key: string;
  label: string;
  icon: LucideIcon;
  /** Static path, or a function that resolves the right destination per role
   *  (e.g. "Leave Requests" goes to the org-wide queue for HR/Admin, but the
   *  team-scoped queue for a Team Lead). */
  path: string | ((role: Role | undefined) => string);
  /** Omit = visible to every authenticated role. */
  roles?: Role[];
  /** true = real working page. false = guarded route that renders ComingSoon. */
  implemented: boolean;
};

export type NavGroup = {
  type: "group";
  key: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  children: NavNode[];
};

export type NavNode = NavLeaf | NavGroup;

const leaf = (n: Omit<NavLeaf, "type">): NavLeaf => ({ type: "leaf", ...n });

const HR_ADMIN: Role[] = [ROLES.HR_MANAGER, ROLES.ADMINISTRATOR];
const MANAGEMENT: Role[] = [ROLES.HR_MANAGER, ROLES.ADMINISTRATOR, ROLES.TEAM_LEAD];

export const NAV_TREE: NavNode[] = [
  leaf({
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
    implemented: true,
  }),

  // "Appraisal" is one flat sidebar entry whose destination follows the role's
  // place in the 3-role flow, because each role acts at a different step of it:
  //   HR/Admin  -> /performance/forms, the management workspace (build forms,
  //                set weights, publish, assign, read analytics, run the
  //                question bank, grant Team Lead access, and read statistics /
  //                results / comparisons). All of those are in-page tabs, each
  //                gated on its own permission inside AppraisalManagement, so
  //                there is still no sidebar dropdown and no per-tab route.
  //   Team Lead -> /team, the roster they review from. They must NOT be sent to
  //                /performance/forms: that route is gated to HR_ADMIN_ROLES
  //                precisely so Leads cannot create or edit forms, questions or
  //                weights, and pointing them at it would only yield a 403.
  //   Employee  -> /appraisal, their own read-only history and statistics.
  leaf({
    key: "appraisal",
    label: "Appraisal",
    icon: ClipboardCheck,
    path: (role) => {
      if (role && HR_ADMIN.includes(role)) return "/performance/forms";
      if (role === ROLES.TEAM_LEAD) return "/team";
      return "/appraisal";
    },
    implemented: true,
  }),

  // "Leave" is one flat sidebar entry for everyone. Regular employees land
  // on their own leave balance/history; HR/Admin/Team Lead land on the same
  // page but see an extra "Leave Requests" tab rendered in-page via
  // SectionTabs (src/config/featureTabs.ts) — no nested sidebar dropdown.
  leaf({
    key: "leave",
    label: "Leave",
    icon: CalendarX2,
    path: "/leave",
    implemented: true,
  }),

  // Same pattern as "Leave": one flat entry, with an in-page "Employee
  // Attendance" tab appearing for HR/Admin/Team Lead only.
  leaf({
    key: "attendance",
    label: "Attendance",
    icon: Fingerprint,
    path: "/attendance",
    implemented: true,
  }),

  leaf({
    key: "payroll",
    label: "Payroll",
    icon: Wallet,
    path: "/payroll",
    implemented: true,
  }),
  leaf({
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    path: "/notifications",
    implemented: true,
  }),
  leaf({
    key: "employees",
    label: "Employees",
    icon: UsersRound,
    path: (role) => (role === ROLES.TEAM_LEAD ? "/team" : "/employees"),
    roles: MANAGEMENT,
    implemented: true,
  }),
  leaf({
    key: "profile",
    label: "Profile",
    icon: User,
    path: "/profile",
    implemented: true,
  }),
  leaf({
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    path: "/settings/company",
    roles: HR_ADMIN,
    implemented: true,
  }),
];

// Not part of the sidebar tree, but real guarded destinations we still want
// breadcrumbs/labels for.
export const EXTRA_ROUTE_LABELS: Record<string, string> = {};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function isGroup(node: NavNode): node is NavGroup {
  return node.type === "group";
}

/** Resolve a leaf's destination path for the given role (strips any query string). */
export function resolveLeafPath(leafNode: NavLeaf, role: Role | undefined): string {
  const raw = typeof leafNode.path === "function" ? leafNode.path(role) : leafNode.path;
  return raw;
}

/** Can this role see the node at all? No `roles` = visible to everyone. */
export function canAccess(node: { roles?: Role[] }, role: Role | undefined): boolean {
  if (!node.roles || node.roles.length === 0) return true;
  if (!role) return false;
  return node.roles.includes(role);
}

/** Strip a query string for path comparisons on nav paths that don't carry one. */
function stripQuery(path: string): string {
  return path.split("?")[0];
}

/**
 * True if `navPath` (a leaf's resolved path) matches the current location.
 * A leaf carrying a query string must match pathname+search exactly so that
 * sibling leaves differing only in their query don't all highlight together;
 * plain leaves match on pathname alone.
 *
 * No leaf currently uses a query string — the ?type=daily/weekly/monthly
 * evaluation leaves that needed this are gone. The branch is kept because it
 * costs nothing and any future query-parameterised leaf would silently
 * mis-highlight without it.
 */
export function pathMatchesLocation(navPath: string, pathname: string, search: string): boolean {
  if (navPath.includes("?")) {
    return `${pathname}${search}` === navPath;
  }
  return navPath === pathname;
}

export type BreadcrumbEntry = { label: string; path: string | null };

/**
 * Walk the tree and return the [Section, Subsection, ..., Current] trail for
 * the given location. Matches on the leaf's *resolved* path, which is
 * role-aware: the Appraisal leaf resolves to /performance/forms for HR/Admin,
 * /team for a Team Lead and /appraisal for an Employee, so each role gets a
 * trail pointing at the page they can actually open.
 */
export function getBreadcrumbTrail(pathname: string, role: Role | undefined, search = ""): BreadcrumbEntry[] {
  function search_(nodes: NavNode[], trail: BreadcrumbEntry[]): BreadcrumbEntry[] | null {
    for (const node of nodes) {
      if (isGroup(node)) {
        const found = search_(node.children, [...trail, { label: node.label, path: null }]);
        if (found) return found;
      } else {
        const resolved = resolveLeafPath(node, role);
        if (pathMatchesLocation(resolved, pathname, search)) {
          return [...trail, { label: node.label, path: stripQuery(resolved) }];
        }
      }
    }
    return null;
  }

  return search_(NAV_TREE, []) ?? [];
}

/** Find the nav leaf whose resolved path matches the given location, for the given role. */
export function findLeafByPath(pathname: string, role: Role | undefined, search = ""): NavLeaf | null {
  function search_(nodes: NavNode[]): NavLeaf | null {
    for (const node of nodes) {
      if (isGroup(node)) {
        const found = search_(node.children);
        if (found) return found;
      } else if (pathMatchesLocation(resolveLeafPath(node, role), pathname, search)) {
        return node;
      }
    }
    return null;
  }

  return search_(NAV_TREE);
}
