import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { notificationApi, type NotificationRecord, type NotificationType } from "@/api/hrApi";
import { useAuth } from "@/app/providers/AuthContext";

type NotificationsContextValue = {
  notifications: NotificationRecord[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  sendNotification: (payload: { title: string; message: string; type: NotificationType }) => Promise<void>;
  updateNotification: (id: string, payload: { title: string; message: string; type: NotificationType }) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_INTERVAL_MS = 30000;

// The live `Notification` table is a company-wide broadcast — every
// Admin/HR-created row is visible to everyone, with no per-recipient
// `isRead` column on the backend (see hrApi.ts). "Read" is therefore
// purely a per-browser, per-user preference, tracked here in localStorage
// and merged onto the fetched list rather than round-tripped to the API.
function readStorageKey(identity: string) {
  return `hrms.notifications.read.${identity}`;
}

function loadReadIds(identity: string): Set<string> {
  try {
    const raw = localStorage.getItem(readStorageKey(identity));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(identity: string, ids: Set<string>) {
  try {
    localStorage.setItem(readStorageKey(identity), JSON.stringify([...ids]));
  } catch {
    // Best-effort — worst case, read state doesn't persist across reloads.
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const identity = user?.email || "guest";

  const [raw, setRaw] = useState<NotificationRecord[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setReadIds(loadReadIds(identity));
  }, [identity]);

  useEffect(() => {
    if (!isAuthenticated) {
      setRaw([]);
      return;
    }
    let active = true;
    setLoading(true);
    notificationApi
      .getAll()
      .then((data) => {
        if (active) {
          setRaw(data);
          setError(null);
        }
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

  const notifications = useMemo(
    () => raw.map((n) => ({ ...n, isRead: readIds.has(n.notificationId) })),
    [raw, readIds],
  );

  const markAsRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev).add(id);
        saveReadIds(identity, next);
        return next;
      });
    },
    [identity],
  );

  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      raw.forEach((n) => next.add(n.notificationId));
      saveReadIds(identity, next);
      return next;
    });
  }, [raw, identity]);

  const sendNotification = useCallback(
    async (payload: { title: string; message: string; type: NotificationType }) => {
      await notificationApi.create(payload);
      refresh();
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
    setRaw((prev) => prev.filter((n) => n.notificationId !== id));
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

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
