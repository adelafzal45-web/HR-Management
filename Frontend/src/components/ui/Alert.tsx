import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "error";

const TONE: Record<AlertTone, { wrap: string; icon: string; Icon: typeof Info }> = {
  info: { wrap: "border-info/30 bg-info-tint", icon: "text-info", Icon: Info },
  success: { wrap: "border-success/30 bg-success-tint", icon: "text-success", Icon: CheckCircle2 },
  warning: { wrap: "border-warning/30 bg-warning-tint", icon: "text-warning", Icon: AlertTriangle },
  error: { wrap: "border-error/30 bg-error-tint", icon: "text-error", Icon: XCircle },
};

export type AlertProps = {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Override the default tone icon; pass `null` to hide it. */
  icon?: ReactNode;
  /** Renders a dismiss button that calls this. */
  onDismiss?: () => void;
  className?: string;
};

/**
 * Inline status panel for form-level errors, confirmations and hints. Tone drives
 * the token colours and the default icon; content and dismissibility are opt-in.
 */
export function Alert({ tone = "info", title, children, icon, onDismiss, className }: AlertProps) {
  const cfg = TONE[tone];
  const showIcon = icon !== null;
  return (
    <div role="status" className={cn("flex gap-3 rounded-card border p-4 text-sm text-foreground", cfg.wrap, className)}>
      {showIcon && (
        <span className={cn("mt-0.5 shrink-0", cfg.icon)}>{icon ?? <cfg.Icon size={18} aria-hidden />}</span>
      )}
      <div className="min-w-0 flex-1">
        {title != null && <p className="font-semibold">{title}</p>}
        {children != null && <div className={cn("text-muted", title != null && "mt-0.5")}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
