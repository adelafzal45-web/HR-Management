import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

// Every colour/radius/shadow below is a design token (see tailwind.config.js →
// CSS vars in styles/index.css), so a saved theme restyles every button with no
// code change. `brand-contrast` is the luminance-derived readable foreground for
// the brand fill — that is why primary uses it instead of a hardcoded text-white
// or text-gray-900 that would break on a dark brand colour.
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-gradient-to-r from-brand to-brand-dark text-brand-contrast shadow-card hover:brightness-95",
  secondary: "bg-surface-muted text-foreground hover:bg-surface-muted/70",
  outline: "border border-border bg-surface text-foreground hover:border-brand/60 hover:text-brand-dark",
  ghost: "text-muted hover:bg-surface-muted hover:text-foreground",
  danger: "bg-error text-error-contrast shadow-card hover:brightness-95",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 px-3 py-1.5 text-xs",
  md: "min-h-10 gap-2 px-4 py-2.5 text-sm",
  lg: "min-h-12 gap-2 px-5 py-3 text-[15px]",
};

const SPINNER_SIZE: Record<ButtonSize, number> = { sm: 15, md: 16, lg: 18 };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the label, and disables the button. */
  loading?: boolean;
  /** Icon before the label. Replaced by the spinner while `loading`. */
  leftIcon?: ReactNode;
  /** Icon after the label. Hidden while `loading`. */
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  /** Fully-rounded pill vs the token control radius. Defaults to control. */
  shape?: "control" | "pill";
};

/**
 * The one button primitive. Variants/sizes are token-driven; `loading` disables
 * and swaps the left icon for a spinner without dropping the label. Defaults to
 * `type="button"` so a button inside a form never submits by accident — callers
 * that want a submit pass `type="submit"` explicitly (see PrimaryButton).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    shape = "control",
    type = "button",
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // eslint-disable-next-line react/button-has-type -- `type` is a constrained prop with a safe default
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        shape === "pill" ? "rounded-pill" : "rounded-control",
        fullWidth && "w-full",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={SPINNER_SIZE[size]} className="animate-spin" aria-hidden /> : leftIcon}
      {children != null && children !== "" && <span>{children}</span>}
      {!loading && rightIcon}
    </button>
  );
});
