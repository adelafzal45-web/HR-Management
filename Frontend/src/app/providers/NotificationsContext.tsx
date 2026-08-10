import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
 notificationApi,
 type NotificationRecord,
 type NotificationType,
 type SendNotificationPayload,
} from "@/api/hrApi";
import { useAuth } from "@/app/providers/AuthContext";

type NotificationsContextValue = {
 /** The signed-in user's bell — only what was addressed to them. */
 notifications: NotificationRecord[];
 unreadCount: number;
 loading: boolean;
 error: string | null;
 refresh: () => void;
 markAsRead: (id: string) => void;
 markAllAsRead: () => void;
 sendNotification: (payload: SendNotificationPayload) => Promise<NotificationRecord>;
 updateNotification: (id: string, payload: { title: string; message: string; type: NotificationType }) => Promise<void>;
 deleteNotification: (id: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_INTERVAL_MS = 30000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
 const { isAuthenticated } = useAuth();

 const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
 const [unreadCount, setUnreadCount] = useState(0);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [tick, setTick] = useState(0);

 const refresh = useCallback(() => setTick((t) => t + 1), []);

 // Reads `/notifications/me`, not `/notifications`. The latter is the
 // sender's view of everything ever sent and is gated on
 // `notifications.view` (HR/Admin only), so an ordinary employee's bell used
 // to 403 against it. Read state comes back from the server: each recipient
 // owns their own row, so `isRead` is theirs and follows them between
 // browsers.
 useEffect(() => {
 if (!isAuthenticated) {
 setNotifications([]);
 setUnreadCount(0);
 return;
 }
 let active = true;
 setLoading(true);
 notificationApi
 .getMine()
 .then(({ data, unread }) => {
 if (!active) return;
 setNotifications(data);
 setUnreadCount(unread);
 setError(null);
 })
 .catch((err) => {
 if (active) setError(err instanceof Error ? err.message : "Couldn't load notifications.");
 })
 .finally(() => {
 if (active) setLoading(false);
 });
 return () => {
 active = false;
 };
 }, [isAuthenticated, tick]);

 useEffect(() => {
 if (!isAuthenticated) return;
 const id = setInterval(refresh, POLL_INTERVAL_MS);
 return () => clearInterval(id);
 }, [isAuthenticated, refresh]);

 // Optimistic: the badge clears on click and the server call follows. A
 // failure rolls the row back and refreshes, so the bell never claims a
 // notice was read when the server still has it unread.
 const markAsRead = useCallback((id: string) => {
 let wasUnread = false;
 setNotifications((prev) =>
 prev.map((n) => {
 if (n.notificationId !== id || n.isRead) return n;
 wasUnread = true;
 return { ...n, isRead: true };
 }),
 );
 if (!wasUnread) return;
 setUnreadCount((c) => Math.max(0, c - 1));

 notificationApi.markRead(id).catch(() => {
 setNotifications((prev) =>
 prev.map((n) => (n.notificationId === id ? { ...n, isRead: false } : n)),
 );
 setUnreadCount((c) => c + 1);
 });
 }, []);

 const markAllAsRead = useCallback(() => {
 const previous = notifications;
 const previousUnread = unreadCount;
 if (previousUnread === 0) return;

 setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
 setUnreadCount(0);

 notificationApi.markAllRead().catch(() => {
 setNotifications(previous);
 setUnreadCount(previousUnread);
 });
 }, [notifications, unreadCount]);

 // Returns the batch summary so the caller can report how many people it
 // actually reached rather than assuming "everyone".
 const sendNotification = useCallback(
 async (payload: SendNotificationPayload) => {
 const created = await notificationApi.create(payload);
 refresh();
 return created;
 },
 [refresh],
 );

 const updateNotification = useCallback(
 async (id: string, payload: { title: string; message: string; type: NotificationType }) => {
 await notificationApi.update(id, payload);
 refresh();
 },
 [refresh],
 );

 const deleteNotification = useCallback(async (id: string) => {
 await notificationApi.remove(id);
 setNotifications((prev) => prev.filter((n) => n.notificationId !== id));
 }, []);

 const value = useMemo<NotificationsContextValue>(
 () => ({
 notifications,
 unreadCount,
 loading,
 error,
 refresh,
 markAsRead,
 markAllAsRead,
 sendNotification,
 updateNotification,
 deleteNotification,
 }),
 [notifications, unreadCount, loading, error, refresh, markAsRead, markAllAsRead, sendNotification, updateNotification, deleteNotification],
 );

 return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
 const ctx = useContext(NotificationsContext);
 if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
 return ctx;
}
