import { useEffect, useRef, useState } from "react";
import { Menu, Search, Bell, LogOut, Check, UserRound, KeyRound, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useNotifications } from "../../lib/NotificationsContext";
import ConfirmDialog from "../ConfirmDialog";
import badge from "../../assets/badge.png";

type HeaderProps = {
  title: string;
  onMenuClick: () => void;
  /** @deprecated notification count now comes from NotificationsContext */
  notificationCount?: number;
};

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

export default function Header({ title, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";
  const initials = (user?.firstName?.[0] ?? "A") + (user?.lastName?.[0] ?? "");

  useEffect(() => {
    if (!bellOpen && !profileOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (bellOpen && bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [bellOpen, profileOpen]);

  const recent = notifications.slice(0, 5);

  return (
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

      <div className="order-last w-full sm:order-none sm:ml-4 sm:max-w-sm sm:flex-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Search something here..."
            className="w-full rounded-full bg-gray-100 py-2.5 pl-4 pr-11 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/50"
          />
          <span className="pointer-events-none absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-gray-200 text-gray-500">
            <Search size={15} />
          </span>
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
                      onClick={() => markAsRead(n.notificationId)}
                      className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50 ${
                        n.isRead ? "" : "bg-brand-light/30"
                      }`}
                    >
                      <span className="flex w-full items-center gap-2">
                        {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-dark" />}
                        <span className="truncate text-sm font-medium text-gray-900">{n.title}</span>
                      </span>
                      <span className="line-clamp-2 text-xs text-gray-500">{n.message}</span>
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
                {user?.jobTitle || "Founder of TechnoCues"}
              </span>
            </span>

            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light text-sm font-semibold text-brand-dark xs:h-10 xs:w-10 sm:h-11 sm:w-11">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initials.toUpperCase() || "A"
              )}
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
                <p className="truncate text-xs text-gray-400">{user?.jobTitle || "Founder of TechnoCues"}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate("/edit-profile");
                }}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <UserRound size={16} className="shrink-0 text-gray-400" />
                Edit Profile
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
                  setConfirmLogoutOpen(true);
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
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          logout();
        }}
        onCancel={() => setConfirmLogoutOpen(false)}
      />
    </header>
  );
}
