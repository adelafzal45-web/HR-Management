import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, TriangleAlert, XCircle, X as XIcon, Undo2 } from "lucide-react";
import { useTheme } from "./ThemeContext";

// Enterprise-style toast stack — bottom-right, stacked, auto-dismissing
// with a visible progress bar, and an optional inline action (e.g. "Undo").
// This replaces the previous centered "are you sure it worked" modal
// app-wide: every existing `toast.showSuccess/showWarning/showError(title,
// description)` call site keeps working unchanged, and callers that want
// richer behavior (an action button, a custom duration, or persistence)
// can pass a fourth `options` argument.

type FeedbackTone = "success" | "warning" | "error";

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  /** Milliseconds before auto-dismiss. Defaults: success 5000, warning/error persistent (null). Pass `null` to disable auto-dismiss. */
  duration?: number | null;
  /** Optional inline action rendered next to the dismiss button, e.g. Undo. */
  action?: ToastAction;
};

type FeedbackItem = {
  id: string;
  tone: FeedbackTone;
  title: string;
  description?: string;
  duration: number | null;
  action?: ToastAction;
};

type ToastContextValue = {
  showSuccess: (title: string, description?: string, options?: ToastOptions) => void;
  showWarning: (title: string, description?: string, options?: ToastOptions) => void;
  showError: (title: string, description?: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<FeedbackTone, number | null> = {
  success: 5000, // low-stakes confirmations can dismiss themselves
  warning: null, // needs acknowledgement
  error: null, // needs acknowledgement
};

const TONE_STYLES: Record<
  FeedbackTone,
  { iconColor: string; iconBg: string; bar: string; ring: string; icon: typeof CheckCircle2 }
> = {
  success: {
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
    bar: "bg-emerald-500",
    ring: "ring-emerald-100 dark:ring-emerald-500/20",
    icon: CheckCircle2,
  },
  warning: {
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-500/10",
    bar: "bg-amber-500",
    ring: "ring-amber-100 dark:ring-amber-500/20",
    icon: TriangleAlert,
  },
  error: {
    iconColor: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-50 dark:bg-rose-500/10",
    bar: "bg-rose-500",
    ring: "ring-rose-100 dark:ring-rose-500/20",
    icon: XCircle,
  },
};

function ToastCard({ item, onClose }: { item: FeedbackItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(item.duration ?? 0);
  const startedAt = useRef(0);

  const tone = TONE_STYLES[item.tone];
  const Icon = tone.icon;

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Mount → slide/fade in on next frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss countdown, pausable on hover (standard toast UX so a user
  // reading the message doesn't lose it mid-sentence).
  useEffect(() => {
    if (!item.duration) return;
    if (paused) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      remaining.current -= Date.now() - startedAt.current;
      return;
    }
    startedAt.current = Date.now();
    closeTimer.current = setTimeout(close, Math.max(0, remaining.current));
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [paused, item.duration, close]);

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      aria-live={item.tone === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ${tone.ring} transition-all duration-200 ease-out dark:bg-gray-900 dark:shadow-black/40 ${
        visible && !leaving ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3 p-4 pr-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.iconBg} ${tone.iconColor}`}>
          <Icon size={17} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
          {item.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{item.description}</p>
          )}
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick();
                close();
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-dark hover:underline dark:text-brand"
            >
              <Undo2 size={12} /> {item.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss notification"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-gray-100 hover:text-gray-500 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      {item.duration ? (
        <div className="h-1 w-full bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-full ${tone.bar} ${paused ? "" : "toast-progress"}`}
            style={{
              animationDuration: `${item.duration}ms`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const { themeClass } = useTheme();

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const push = useCallback((tone: FeedbackTone, title: string, description?: string, options?: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const duration = options?.duration !== undefined ? options.duration : DEFAULT_DURATION[tone];
    setItems((prev) => [...prev, { id, tone, title, description, duration, action: options?.action }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (title, description, options) => push("success", title, description, options),
      showWarning: (title, description, options) => push("warning", title, description, options),
      showError: (title, description, options) => push("error", title, description, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className={`${themeClass} pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-end gap-2.5 p-4 xs:inset-x-auto xs:right-0 sm:p-6`}
          aria-label="Notifications"
        >
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onClose={() => dismiss(item.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
