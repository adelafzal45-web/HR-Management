import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Search, Bell, LogOut, Check, UserRound, KeyRound, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthContext";
import { useNotifications } from "@/app/providers/NotificationsContext";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import NotificationDetailPanel from "@/modules/notifications/components/NotificationDetailPanel";
import { truncateMessage } from "@/modules/notifications/utils/notificationDisplay";
import type { NotificationRecord } from "@/api/hrApi";

type HeaderProps = {
 title: string;
 onMenuClick: () => void;
 onRequestLogout: () => void;
 /** @deprecated notification count now comes from NotificationsContext */
 notificationCount?: number;
};

// Flat index of the app's pages so the header search bar actually does
// something — it used to render an input with no state or handler at all,
// which looked like global search but silently went nowhere. This is a
// lightweight quick-nav rather than full content search, but it means
// typing in the box now reliably takes you somewhere.
const SEARCHABLE_PAGES: { label: string; route: string; keywords?: string }[] = [
 { label: "Dashboard", route: "/dashboard" },
 { label: "Attendance", route: "/attendance" },
 { label: "Leave", route: "/leave", keywords: "time off vacation" },
 { label: "Payroll", route: "/payroll", keywords: "salary payslip" },
 { label: "Appraisal", route: "/appraisal", keywords: "performance review" },
 { label: "Notifications", route: "/notifications" },
 { label: "My Profile", route: "/profile", keywords: "edit profile account" },
 { label: "My Team", route: "/team", keywords: "team lead" },
 { label: "Team Attendance", route: "/team/attendance" },
 { label: "Team Leaves", route: "/team/leaves" },
 { label: "Team Reports", route: "/team/reports" },
 { label: "Evaluation Rubric", route: "/team/rubric", keywords: "appraisal criteria weightage questions" },
 { label: "Evaluation Forms", route: "/performance/forms", keywords: "appraisal forms builder assignments analytics" },
 { label: "Employees", route: "/employees", keywords: "staff people" },
 { label: "Process Payroll", route: "/payroll/process" },
 { label: "Attendance Records", route: "/attendance-records" },
 { label: "Leave Requests", route: "/leave-requests" },
 { label: "Settings", route: "/settings", keywords: "company departments designations roles permissions branding shifts" },
 { label: "SMTP & Delivery", route: "/settings/smtp", keywords: "email smtp mail server queue delivery outbound" },
 { label: "Email Templates", route: "/settings/email-templates", keywords: "email template placeholders branding subject body" },
];

// Characters of the message shown in the bell dropdown before it is cut off.
// The dropdown is a fixed w-80 (20rem) — a long, unbroken message previously
// relied on `line-clamp-2` alone, which still let a run of long words push
// past the panel's edge and made rows of very different lengths sit next to
// each other awkwardly. Capping the source string keeps every row a
// predictable height; the full text is one click away in the side panel.
const BELL_MESSAGE_PREVIEW_LIMIT = 90;

function timeAgo(iso: string) {
 const diffMs = Date.now() - new Date(iso).getTime();
 const mins = Math.round(diffMs / 60000);
 if (mins < 1) return "Just now";
 if (mins < 60) return `${mins}m ago`;
 const hours = Math.round(mins / 60);
 if (hours < 24) return `${hours}h ago`;
 const days = Math.round(hours / 24);
 return `${days}d ago`;
}

export default function Header({ title, onMenuClick, onRequestLogout }: HeaderProps) {
 const { user } = useAuth();
 const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
 const [bellOpen, setBellOpen] = useState(false);
 // The row shows a capped preview; this holds the notification whose full
 // text is open in the side panel. Kept separate from `bellOpen` so the
 // panel survives the dropdown closing (the panel's own backdrop click
 // closes it independently of the dropdown's outside-click handler).
 const [viewingNotification, setViewingNotification] = useState<NotificationRecord | null>(null);
 const [profileOpen, setProfileOpen] = useState(false);
 const [searchQuery, setSearchQuery] = useState("");
 const [searchOpen, setSearchOpen] = useState(false);
 const bellRef = useRef<HTMLDivElement>(null);
 const profileRef = useRef<HTMLDivElement>(null);
 const searchRef = useRef<HTMLDivElement>(null);
 const navigate = useNavigate();

 const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";

 const searchMatches = useMemo(() => {
 const q = searchQuery.trim().toLowerCase();
 if (!q) return [];
 return SEARCHABLE_PAGES.filter(
 (p) => p.label.toLowerCase().includes(q) || p.keywords?.toLowerCase().includes(q),
 ).slice(0, 6);
 }, [searchQuery]);

 const goToSearchResult = (route: string) => {
 navigate(route);
 setSearchQuery("");
 setSearchOpen(false);
 };

 useEffect(() => {
 if (!bellOpen && !profileOpen && !searchOpen) return;
 const onClickOutside = (e: MouseEvent) => {
 if (bellOpen && bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
 if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
 if (searchOpen && searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
 };
 document.addEventListener("mousedown", onClickOutside);
 return () => document.removeEventListener("mousedown", onClickOutside);
 }, [bellOpen, profileOpen, searchOpen]);

 const recent = notifications.slice(0, 5);

 // Opening a notification is what marks it read, same as it always was —
 // the difference is that "opening" now shows the full message in the side
 // panel instead of just clearing the unread dot, so a long message has
 // somewhere to be read in full.
 const openNotification = (n: NotificationRecord) => {
 setViewingNotification(n);
 if (!n.isRead) markAsRead(n.notificationId);
 };

 return (
 <>
 <header className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-3 py-3 xs:gap-4 xs:px-4 xs:py-4 sm:px-6 lg:px-8">
 <button
 type="button"
 onClick={onMenuClick}
 className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 lg:hidden"
 aria-label="Open menu"
 >
 <Menu size={22} />
 </button>

 <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-gray-900 xs:text-xl sm:flex-none sm:text-2xl">
 {title}
 </h1>

 <div className="order-last w-full sm:order-none sm:ml-4 sm:max-w-sm sm:flex-1" ref={searchRef}>
 <div className="relative">
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value);
 setSearchOpen(true);
 }}
 onFocus={() => searchQuery && setSearchOpen(true)}
 onKeyDown={(e) => {
 if (e.key === "Enter" && searchMatches[0]) goToSearchResult(searchMatches[0].route);
 if (e.key === "Escape") setSearchOpen(false);
 }}
 placeholder="Jump to a page..."
 aria-label="Jump to a page"
 className="w-full rounded-full bg-gray-100 py-2.5 pl-4 pr-11 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/50"
 />
 <span className="pointer-events-none absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-gray-200 text-gray-500">
 <Search size={15} />
 </span>

 {searchOpen && searchQuery.trim() && (
 <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
 {searchMatches.length === 0 ? (
 <p className="px-4 py-4 text-center text-sm text-gray-400">No pages match "{searchQuery}".</p>
 ) : (
 searchMatches.map((p) => (
 <button
 key={p.route}
 type="button"
 onClick={() => goToSearchResult(p.route)}
 className="flex w-full items-center gap-2 border-b border-gray-50 px-4 py-2.5 text-left text-sm text-gray-700 last:border-0 hover:bg-brand-light/30"
 >
 <Search size={13} className="shrink-0 text-gray-400" />
 {p.label}
 </button>
 ))
 )}
 </div>
 )}
 </div>
 </div>

 <div className="ml-auto flex shrink-0 items-center gap-2 xs:gap-3 sm:gap-4">
 <div className="relative" ref={bellRef}>
 <button
 type="button"
 onClick={() => setBellOpen((o) => !o)}
 className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 text-gray-700 hover:bg-gray-100"
 aria-label="Notifications"
 >
 <Bell size={20} />
 {unreadCount > 0 && (
 <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-dark px-1 text-[11px] font-semibold text-white">
 {unreadCount > 9 ? "9+" : unreadCount}
 </span>
 )}
 </button>

 {bellOpen && (
 <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
 <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
 <p className="text-sm font-semibold text-gray-900">Notifications</p>
 {unreadCount > 0 && (
 <button
 type="button"
 onClick={markAllAsRead}
 className="flex items-center gap-1 text-xs font-medium text-brand-dark hover:underline"
 >
 <Check size={12} /> Mark all read
 </button>
 )}
 </div>

 <div className="max-h-80 overflow-y-auto">
 {recent.length === 0 ? (
 <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet.</p>
 ) : (
 recent.map((n) => (
 <button
 key={n.notificationId}
 type="button"
 onClick={() => openNotification(n)}
 className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50 ${
 n.isRead ? "" : "bg-brand-light/30"
 }`}
 >
 <span className="flex w-full items-center gap-2">
 {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-dark" />}
 <span className="truncate text-sm font-medium text-gray-900">{n.title}</span>
 </span>
 <span className="break-words text-xs text-gray-500">{truncateMessage(n.message, BELL_MESSAGE_PREVIEW_LIMIT)}</span>
 <span className="text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
 </button>
 ))
 )}
 </div>

 <button
 type="button"
 onClick={() => {
 setBellOpen(false);
 navigate("/notifications");
 }}
 className="block w-full border-t border-gray-100 px-4 py-3 text-center text-sm font-medium text-brand-dark hover:bg-gray-50"
 >
 View all
 </button>
 </div>
 )}
 </div>

 <div className="relative" ref={profileRef}>
 <button
 type="button"
 onClick={() => setProfileOpen((o) => !o)}
 aria-haspopup="menu"
 aria-expanded={profileOpen}
 aria-label="Open profile menu"
 className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-1.5 transition hover:bg-gray-100 xs:pr-2 sm:pr-3"
 >
 <span className="hidden text-right sm:block">
 <span className="block text-sm font-medium leading-tight text-gray-900">{displayName}</span>
 <span className="block text-xs font-normal leading-relaxed text-gray-400">
 {user?.jobTitle || "Team Member"}
 </span>
 </span>

 <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light text-sm font-semibold text-brand-dark xs:h-10 xs:w-10 sm:h-11 sm:w-11">
 {/* Sized by the wrapper's responsive classes rather than EmployeeAvatar's
     own `size` prop, which would pin the navbar avatar to one width across
     every breakpoint. The avatar fills the wrapper instead. */}
 <EmployeeAvatar
 firstName={user?.firstName}
 lastName={user?.lastName}
 photo={user?.avatarUrl}
 thumb={user?.avatarThumbUrl}
 className="!h-full !w-full ring-0"
 />
 </span>

 <ChevronDown
 size={16}
 className={`hidden shrink-0 text-gray-400 transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`}
 />
 </button>

 {profileOpen && (
 <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[90vw] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-100">
 <div className="border-b border-gray-100 px-4 py-3 sm:hidden">
 <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
 <p className="truncate text-xs text-gray-400">{user?.jobTitle || "Team Member"}</p>
 </div>

 <button
 type="button"
 onClick={() => {
 setProfileOpen(false);
 navigate("/profile");
 }}
 className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
 >
 <UserRound size={16} className="shrink-0 text-gray-400" />
 My Profile
 </button>

 <button
 type="button"
 onClick={() => {
 setProfileOpen(false);
 navigate("/change-password");
 }}
 className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
 >
 <KeyRound size={16} className="shrink-0 text-gray-400" />
 Change Password
 </button>

 <button
 type="button"
 onClick={() => {
 setProfileOpen(false);
 onRequestLogout();
 }}
 className="flex min-h-11 w-full items-center gap-3 border-t border-gray-100 px-4 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
 >
 <LogOut size={16} className="shrink-0" />
 Logout
 </button>
 </div>
 )}
 </div>
 </div>
 </header>

 <NotificationDetailPanel
 notification={viewingNotification}
 onClose={() => setViewingNotification(null)}
 />
 </>
 );
}
