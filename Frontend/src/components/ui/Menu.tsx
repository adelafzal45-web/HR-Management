import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

// Generalises the click-outside / Escape-to-close popover that was inlined in
// DataTableExport. The trigger is cloned so callers keep full control of its look
// (any Button works); the popover closes on outside click, Escape, or any click
// inside it (item selection bubbles up to the container handler).

type TriggerProps = {
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  "aria-haspopup"?: ButtonHTMLAttributes<HTMLButtonElement>["aria-haspopup"];
  "aria-expanded"?: boolean;
};

export type MenuProps = {
  /** Any clickable element; it is cloned with the open/close handler + ARIA. */
  trigger: ReactElement<TriggerProps>;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
};

export function Menu({ trigger, children, align = "left", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: (e: MouseEvent<HTMLElement>) => {
          trigger.props.onClick?.(e);
          setOpen((o) => !o);
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
      })
    : trigger;

  return (
    <div ref={ref} className="relative inline-block">
      {triggerEl}
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={cn(
            "absolute z-50 mt-2 min-w-[12rem] overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-card-lg",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  leftIcon?: ReactNode;
  /** Destructive actions render in the error tone. */
  tone?: "default" | "danger";
};

export function MenuItem({ leftIcon, tone = "default", className, children, ...rest }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition",
        "hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger" ? "text-error hover:bg-error-tint" : "text-foreground",
        className,
      )}
      {...rest}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-border-muted" role="separator" />;
}
