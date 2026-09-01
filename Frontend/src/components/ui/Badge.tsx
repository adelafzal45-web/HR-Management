import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Tones map onto the token palette. `neutral`/`brand` reuse surface + brand
// tokens; the status tones use their `-tint`/`-contrast` pairs so a soft chip is
// a pale wash with the saturated colour as text, and a solid chip is the full
// colour with its readable contrast foreground. All themeable, no literal hues.
export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "info";
export type BadgeVariant = "soft" | "solid" | "outline";

const TONE: Record<BadgeTone, Record<BadgeVariant, string>> = {
  neutral: {
    soft: "bg-surface-muted text-muted",
    solid: "bg-foreground text-background",
    outline: "border border-border text-muted",
  },
  brand: {
    soft: "bg-brand-light text-brand-dark",
    solid: "bg-brand text-brand-contrast",
    outline: "border border-brand/40 text-brand-dark",
  },
  success: {
    soft: "bg-success-tint text-success",
    solid: "bg-success text-success-contrast",
    outline: "border border-success/40 text-success",
  },
  warning: {
    soft: "bg-warning-tint text-warning",
    solid: "bg-warning text-warning-contrast",
    outline: "border border-warning/40 text-warning",
  },
  error: {
    soft: "bg-error-tint text-error",
    solid: "bg-error text-error-contrast",
    outline: "border border-error/40 text-error",
  },
  info: {
    soft: "bg-info-tint text-info",
    solid: "bg-info text-info-contrast",
    outline: "border border-info/40 text-info",
  },
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  leftIcon?: ReactNode;
};

/**
 * Small pill for counts, labels and statuses. `StatusBadge` composes this with a
 * status→tone map; use it directly for generic labels and counts.
 */
export function Badge({ tone = "neutral", variant = "soft", leftIcon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-center text-xs font-semibold leading-none",
        TONE[tone][variant],
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
    </span>
  );
}
