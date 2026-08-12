// Grouped sub-navigation shell for the HR/Admin payroll workspace — the same
// collapsible-sidebar pattern as SettingsLayout, so payroll reads as one
// coherent surface rather than a scatter of routes. Pages render themselves
// inside via `children`.
//
// Four groups, ordered by how often you touch them: Run (Dashboard, Run
// Payroll), Records (Payslips, Reports), Requests (Loans, Expense Claims,
// Approvals) and Configuration (Activate Payroll, Settings, Components,
// Structures, Rule Builder, Tax, Bonuses). Configuration is "set up once", so
// it sits at the bottom and starts collapsed. Pay Periods stays routed but off
// the nav — Run Payroll is the way into a cycle — and is reachable from the
// Dashboard. The `soon` flag remains on the tab type for any future roadmap
// leaf, but nothing carries it today.
//
// Each group also carries a one-line `hint` — payroll has a lot of screens and
// the group labels alone don't say which one to open first. The hint answers
// "what is this section for?" in plain language.

import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarRange,
  PlayCircle,
  ReceiptText,
  Receipt,
  CheckCheck,
  SlidersHorizontal,
  Blocks,
  Layers,
  ListChecks,
  Scale,
  Landmark,
  HandCoins,
  Gift,
  BarChart3,
  ChevronRight,
  ChevronDown,
  Wallet,
  Cog,
  Archive,
  Inbox,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";

type PayrollTab = {
  to: string;
  label: string;
  icon: typeof Wallet;
  /** Route exists and is guarded, but renders ComingSoon until Phase 2. */
  soon?: boolean;
};

type PayrollGroup = {
  key: string;
  label: string;
  icon: typeof Wallet;
  /** Plain-English "what is this section for" line, shown under the heading. */
  hint: string;
  items: PayrollTab[];
};

const GROUPS: PayrollGroup[] = [
  {
    key: "run",
    label: "Run",
    icon: PlayCircle,
    hint: "Start each pay cycle here.",
    items: [
      { to: "/payroll/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/payroll/run", label: "Run Payroll", icon: PlayCircle },
    ],
  },
  {
    key: "records",
    label: "Records",
    icon: Archive,
    hint: "Payslips and cost reports for past runs.",
    items: [
      { to: "/payroll/payslips", label: "Payslips", icon: ReceiptText },
      { to: "/payroll/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    key: "requests",
    label: "Requests",
    icon: Inbox,
    hint: "Employee loans, claims and sign-off.",
    items: [
      { to: "/payroll/loans", label: "Loans & Advances", icon: HandCoins },
      { to: "/payroll/reimbursements", label: "Expense Claims", icon: Receipt },
      { to: "/payroll/approvals", label: "Approvals", icon: CheckCheck },
    ],
  },
  {
    key: "configuration",
    label: "Configuration",
    icon: Cog,
    hint: "Set up once. Start with Activate Payroll.",
    items: [
      { to: "/payroll/setup", label: "Activate Payroll", icon: ListChecks },
      { to: "/payroll/settings", label: "General Settings", icon: SlidersHorizontal },
      { to: "/payroll/components", label: "Salary Components", icon: Blocks },
      { to: "/payroll/structures", label: "Salary Structures", icon: Layers },
      { to: "/payroll/rules", label: "Rule Builder", icon: Scale },
      { to: "/payroll/tax", label: "Tax & Statutory", icon: Landmark },
      { to: "/payroll/bonuses", label: "Bonuses & Incentives", icon: Gift },
    ],
  },
];

// Routed payroll screens that intentionally aren't in the nav. Pay Periods is
// reached through Run Payroll (and the Dashboard), but its breadcrumb still
// needs a label, so it's merged into ALL_TABS — same pattern as SettingsLayout.
const HIDDEN_TABS: PayrollTab[] = [
  { to: "/payroll/periods", label: "Pay Periods", icon: CalendarRange },
];

const ALL_TABS = [...GROUPS.flatMap((g) => g.items), ...HIDDEN_TABS];

// Remembers which groups are expanded across visits, same pattern as
// SettingsLayout and the main Sidebar's fold state.
const OPEN_GROUPS_STORAGE_KEY = "technocues:payroll-open-groups";

function defaultOpenGroups(): Record<string, boolean> {
  // Configuration is "set up once", so it starts collapsed — out of the way but
  // one click open. Run / Records / Requests start expanded.
  return Object.fromEntries(GROUPS.map((g) => [g.key, g.key !== "configuration"]));
}

function loadOpenGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return defaultOpenGroups();
  try {
    const saved = window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
    if (!saved) return defaultOpenGroups();
    const parsed = JSON.parse(saved);
    return { ...defaultOpenGroups(), ...parsed };
  } catch {
    return defaultOpenGroups();
  }
}

export default function PayrollLayout({
  activeTab,
  children,
}: {
  activeTab: string;
  children: ReactNode;
}) {
  const current = ALL_TABS.find((t) => t.to === activeTab);
  const currentGroup = GROUPS.find((g) => g.items.some((i) => i.to === activeTab));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <DashboardLayout title="Payroll" activeKey="payroll">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
        <span>Payroll</span>
        {currentGroup && (
          <>
            <ChevronRight size={14} className="text-gray-300" />
            <span>{currentGroup.label}</span>
          </>
        )}
        <ChevronRight size={14} className="text-gray-300" />
        <span className="font-medium text-gray-800">{current?.label}</span>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* Grouped nav — collapsible sections keep related screens (Run /
            Records / Requests / Configuration) clustered as the payroll surface
            grows. */}
        <div className="w-full shrink-0 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100 lg:w-64">
          <div className="flex flex-col gap-0.5">
            {GROUPS.map((group) => {
              const GroupIcon = group.icon;
              const isOpen = openGroups[group.key] ?? true;
              const groupIsActive = group.key === currentGroup?.key;

              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                      groupIsActive ? "text-brand-dark" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <GroupIcon size={16} className={groupIsActive ? "text-brand" : "text-gray-400"} />
                    <span className="flex-1">{group.label}</span>
                    <ChevronDown
                      size={15}
                      className={`shrink-0 text-gray-400 transition-transform duration-200 ${
                        isOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="ml-4 flex flex-col gap-0.5 border-l border-gray-100 py-1 pl-3">
                      <p className="pb-1 pr-2 text-[11px] leading-snug text-gray-400">
                        {group.hint}
                      </p>
                      {group.items.map(({ to, label, icon: Icon, soon }) => (
                        <NavLink
                          key={to}
                          to={to}
                          end
                          className={({ isActive }) =>
                            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                              isActive
                                ? "bg-brand-light text-brand-dark"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                            }`
                          }
                        >
                          <Icon size={15} />
                          <span className="flex-1">{label}</span>
                          {soon && (
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                              Soon
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardLayout>
  );
}
