import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
 CheckCircle2,
 XCircle,
 AlertTriangle,
 Info,
 Loader2,
 ShieldAlert,
 Bell,
 Megaphone,
 X as XIcon,
 type LucideIcon,
} from "lucide-react";

// ─── Notification types ──────────────────────────────────────────────────
// Eight tones cover the notification scenarios that come up across an
// HRMS/Payroll/Attendance app: routine CRUD feedback (success/error),
// validation/attention states (warning), passive FYI (info), long-running
// actions (processing), auth/permission events (security), upcoming
// deadlines (reminder), and platform-level announcements (system).
export type ToastType = "success" | "error" | "warning" | "info" | "processing" | "security" | "reminder" | "system";

type ToastItem = { id: string; type: ToastType; title: string; description?: string };

type ShowFn = (title: string, description?: string) => string;

type ToastContextValue = {
 // Names kept as `show*(title, description?)` so every existing call site
 // (Departments/Designations/Roles/Permissions/JobCategories/Shifts/
 // Branding/CompanyDetails/Employees/Professionals/etc.) keeps working
 // unchanged. Each returns the toast id, so callers that need to update or
 // dismiss it later (e.g. a "Processing…" toast that becomes "Success") can.
 showSuccess: ShowFn;
 showError: ShowFn;
 showWarning: ShowFn;
 showInfo: ShowFn;
 showProcessing: ShowFn;
 showSecurity: ShowFn;
 showReminder: ShowFn;
 showSystem: ShowFn;
 /** Update an existing toast in place — e.g. flip a "processing" toast to "success" when a long-running action finishes. */
 update: (id: string, patch: { type?: ToastType; title?: string; description?: string }) => void;
 /** Dismiss a toast before its auto-timer would normally close it. */
 dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Auto-dismiss timing per type. `null` means the toast waits for the user
// (or a caller-triggered `dismiss`/`update`) to close it — reserved for
// tones where silently disappearing would be a problem: something failed,
// needs attention, is still running, or is security-sensitive.
const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
 success: 3500,
 error: null,
 warning: null,
 info: 4500,
 processing: null,
 security: null,
 reminder: 5500,
 system: 5500,
};

const TONE_STYLES: Record<ToastType, { iconBg: string; icon: LucideIcon; spin?: boolean }> = {
 success: { iconBg: "bg-emerald-500", icon: CheckCircle2 },
 error: { iconBg: "bg-red-500", icon: XCircle },
 warning: { iconBg: "bg-amber-500", icon: AlertTriangle },
 info: { iconBg: "bg-blue-500", icon: Info },
 processing: { iconBg: "bg-indigo-500", icon: Loader2, spin: true },
 security: { iconBg: "bg-red-900", icon: ShieldAlert },
 reminder: { iconBg: "bg-yellow-500", icon: Bell },
 system: { iconBg: "bg-gray-500", icon: Megaphone },
};

function Toast({ item, onClose }: { item: ToastItem; onClose: (id: string) => void }) {
 const [visible, setVisible] = useState(false);
 const tone = TONE_STYLES[item.type];
 const Icon = tone.icon;
 const dismissAfter = AUTO_DISMISS_MS[item.type];

 const close = useCallback(() => {
 setVisible(false);
 // Let the exit transition finish before unmounting.
 setTimeout(() => onClose(item.id), 180);
 }, [item.id, onClose]);

 // Mount → slide/fade in on the next frame.
 useEffect(() => {
 const raf = requestAnimationFrame(() => setVisible(true));
 return () => cancelAnimationFrame(raf);
 }, []);

 useEffect(() => {
 if (dismissAfter) {
 const timer = setTimeout(close, dismissAfter);
 return () => clearTimeout(timer);
 }
 }, [dismissAfter, close]);

 return (
 <div
 role="status"
 aria-live="polite"
 className={`pointer-events-auto relative w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-100 transition-all duration-200 xs:w-96 ${
 visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
 }`}
 >
 <div className="flex items-start gap-3">
 <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${tone.iconBg}`}>
 <Icon size={16} strokeWidth={2.5} className={tone.spin ? "animate-spin" : undefined} />
 </span>

 <div className="min-w-0 flex-1 pt-0.5">
 <h2 className="text-sm font-semibold text-gray-900">{item.title}</h2>
 {item.description && <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.description}</p>}
 </div>

 <button
 type="button"
 onClick={close}
 aria-label="Dismiss"
 className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-gray-50 hover:text-gray-500"
 >
 <XIcon size={14} />
 </button>
 </div>

 {/* Timed toasts get a thin progress bar so it's clear they'll auto-dismiss. */}
 {dismissAfter && (
 <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-gray-100">
 <div
 className={`h-full ${tone.iconBg} transition-[width] ease-linear`}
 style={{
 width: visible ? "0%" : "100%",
 transitionDuration: visible ? `${dismissAfter}ms` : "0ms",
 }}
 />
 </div>
 )}
 </div>
 );
}

export function ToastProvider({ children }: { children: ReactNode }) {
 const [items, setItems] = useState<ToastItem[]>([]);

 const push = useCallback((type: ToastType, title: string, description?: string) => {
 const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
 setItems((prev) => [...prev, { id, type, title, description }]);
 return id;
 }, []);

 const dismiss = useCallback((id: string) => {
 setItems((prev) => prev.filter((item) => item.id !== id));
 }, []);

 const update = useCallback(
 (id: string, patch: { type?: ToastType; title?: string; description?: string }) => {
 setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
 },
 [],
 );

 const value = useMemo<ToastContextValue>(
 () => ({
 showSuccess: (title, description) => push("success", title, description),
 showError: (title, description) => push("error", title, description),
 showWarning: (title, description) => push("warning", title, description),
 showInfo: (title, description) => push("info", title, description),
 showProcessing: (title, description) => push("processing", title, description),
 showSecurity: (title, description) => push("security", title, description),
 showReminder: (title, description) => push("reminder", title, description),
 showSystem: (title, description) => push("system", title, description),
 update,
 dismiss,
 }),
 [push, update, dismiss],
 );

 return (
 <ToastContext.Provider value={value}>
 {children}
 {items.length > 0 &&
 createPortal(
 // Stacked in the top-right corner — non-blocking notifications, not
 // a modal you must dismiss to keep working. Newest appears at the
 // bottom of the stack, pushing older ones up.
 <div className="pointer-events-none fixed right-4 top-4 z-[200] flex flex-col gap-3 xs:right-6 xs:top-6">
 {items.map((item) => (
 <Toast key={item.id} item={item} onClose={dismiss} />
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
