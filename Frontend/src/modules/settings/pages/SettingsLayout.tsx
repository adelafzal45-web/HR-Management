import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
 Building2,
 Network,
 IdCard,
 ShieldCheck,
 KeyRound,
 Palette,
 PenLine,
 Tags,
 Clock,
 CalendarRange,
 CalendarDays,
 ListChecks,
 ChevronRight,
 ChevronDown,
 SlidersHorizontal,
 Lock,
 Mail,
 ServerCog,
 MailCheck,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";

type SettingsTab = {
 to: string;
 label: string;
 icon: typeof Building2;
};

type SettingsGroup = {
 key: string;
 label: string;
 icon: typeof Building2;
 items: SettingsTab[];
};

const GROUPS: SettingsGroup[] = [
 {
 key: "details",
 label: "Details",
 icon: SlidersHorizontal,
 items: [
 { to: "/settings/company", label: "Company Details", icon: Building2 },
 { to: "/settings/branding", label: "Branding", icon: Palette },
 {
 to: "/settings/certificate-signatures",
 label: "Certificate Signatures",
 icon: PenLine,
 },
 ],
 },
 {
 key: "organization",
 label: "Organization",
 icon: Network,
 items: [
 { to: "/settings/departments", label: "Departments", icon: Network },
 { to: "/settings/designations", label: "Designations", icon: IdCard },
 { to: "/settings/job-categories", label: "Job Categories", icon: Tags },
 { to: "/settings/shifts", label: "Shifts", icon: Clock },
 { to: "/settings/leave-types", label: "Leave Types", icon: CalendarRange },
 { to: "/settings/working-days", label: "Working Days", icon: CalendarDays },
 { to: "/settings/employee-fields", label: "Employee Fields", icon: ListChecks },
 ],
 },
 {
 key: "email",
 label: "Email",
 icon: Mail,
 items: [
 { to: "/settings/smtp", label: "SMTP & Delivery", icon: ServerCog },
 { to: "/settings/email-templates", label: "Email Templates", icon: MailCheck },
 ],
 },
 {
 key: "access-control",
 label: "Access Control",
 icon: Lock,
 items: [
 { to: "/settings/roles", label: "Roles & Permissions", icon: ShieldCheck },
 ],
 },
];

// Screens that still resolve as routes but are deliberately absent from the
// nav. Permissions is managed from inside a Role now, so listing it as a peer
// of Roles only offered a second, lesser way to reach the same data — but the
// route stays reachable, and the breadcrumb has to keep naming it correctly for
// anyone who lands there directly.
const HIDDEN_TABS: SettingsTab[] = [
 { to: "/settings/permissions", label: "Permissions", icon: KeyRound },
];

const ALL_TABS = [...GROUPS.flatMap((g) => g.items), ...HIDDEN_TABS];

// Remembers which groups are expanded across visits, same pattern as the
// main Sidebar's fold state.
const OPEN_GROUPS_STORAGE_KEY = "technocues:settings-open-groups";

function defaultOpenGroups(): Record<string, boolean> {
 return Object.fromEntries(GROUPS.map((g) => [g.key, true]));
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

export default function SettingsLayout({ activeTab, children }: { activeTab: string; children: ReactNode }) {
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
 <DashboardLayout title="Settings" activeKey="settings">
 {/* Breadcrumb */}
 <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
 <span>Settings</span>
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
 {/* Grouped nav — collapsible sections instead of a flat tab bar, so
 related screens (Details / Organization / Access Control) stay
 visually clustered as the settings surface grows. */}
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
 {group.items.map(({ to, label, icon: Icon }) => (
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
 {label}
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
