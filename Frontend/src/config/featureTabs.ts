import {
  CalendarX2,
  ClipboardCheck,
  Fingerprint,
  CalendarCheck,
  Users,
  UserCog,
  IdCard,
} from "lucide-react";
import type { SectionTab } from "@/components/common/SectionTabs";
import { ROLES, type Role } from "@/constants/roles";

// Same "who counts as management" definition used by the sidebar
// (src/config/navigation.ts) — kept here too so this file has no
// dependency on the nav tree, just the roles module.
const MANAGEMENT: Role[] = [ROLES.HR_MANAGER, ROLES.ADMINISTRATOR, ROLES.TEAM_LEAD];

/**
 * Tabs for the single "Leave" sidebar entry. Everyone gets "My Leave";
 * HR/Admin/Team Lead additionally get "Leave Requests", which itself
 * resolves to the team-scoped queue for a Team Lead vs. the org-wide
 * queue for HR/Admin.
 */
export function getLeaveTabs(role: Role | undefined): SectionTab[] {
  const tabs: SectionTab[] = [{ key: "my-leave", label: "My Leave", icon: CalendarX2, path: "/leave" }];
  if (role && MANAGEMENT.includes(role)) {
    tabs.push({
      key: "leave-requests",
      label: "Leave Requests",
      icon: ClipboardCheck,
      path: role === ROLES.TEAM_LEAD ? "/team/leaves" : "/leave-requests",
    });
  }
  return tabs;
}

/**
 * Tabs for the single "Attendance" sidebar entry. Everyone gets "Daily
 * Attendance"; HR/Admin/Team Lead additionally get "Employee Attendance",
 * resolved the same team-scoped-vs-org-wide way as Leave Requests above.
 */
export function getAttendanceTabs(role: Role | undefined): SectionTab[] {
  const tabs: SectionTab[] = [
    { key: "daily-attendance", label: "Daily Attendance", icon: Fingerprint, path: "/attendance" },
  ];
  if (role && MANAGEMENT.includes(role)) {
    tabs.push({
      key: "employee-attendance",
      label: "Employee Attendance",
      icon: CalendarCheck,
      path: role === ROLES.TEAM_LEAD ? "/team/attendance" : "/attendance-records",
    });
  }
  return tabs;
}

/**
 * Tabs for the Employee Management section. The base "Employees" list is
 * always visible to HR/Admin roles. "Team Leads" and "Employee Cards" are
 * permission-gated — the caller checks `employees.team.view` and
 * `employees.card.view` respectively, and only passes in tabs the user may
 * actually access.
 *
 * This function is permission-agnostic; <Can> or `hasPermission` must be
 * used at the call site.
 */
export function getEmployeeTabs(options: {
  showTeamLeads: boolean;
  showCards: boolean;
}): SectionTab[] {
  const tabs: SectionTab[] = [
    { key: "employees", label: "Employees", icon: Users, path: "/employees" },
  ];
  if (options.showTeamLeads) {
    tabs.push({ key: "team-leads", label: "Team Leads", icon: UserCog, path: "/employees/team-leads" });
  }
  if (options.showCards) {
    tabs.push({ key: "employee-cards", label: "Employee Cards", icon: IdCard, path: "/employees/cards" });
  }
  return tabs;
}

/**
 * Tabs for the Appraisal section. Everyone with appraisal access gets
 * "My Appraisal"; management roles additionally get Compare, Overview, and
 * Manage Forms.
 */
export function getAppraisalTabs(role: Role | undefined): SectionTab[] {
  const tabs: SectionTab[] = [
    { key: "my-appraisal", label: "My Appraisal", icon: ClipboardCheck, path: "/appraisal" },
  ];
  if (role && MANAGEMENT.includes(role)) {
    tabs.push(
      { key: "compare", label: "Compare", icon: Users, path: "/appraisal/compare" },
      { key: "overview", label: "Overview", icon: CalendarCheck, path: "/appraisal/overview" },
      { key: "manage", label: "Manage Forms", icon: UserCog, path: "/appraisal/manage" },
    );
  }
  return tabs;
}
