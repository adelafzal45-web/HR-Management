import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/**
 * A styled native `<select>` — token-driven, with the browser chevron replaced by
 * a positioned icon (`appearance-none`). For search/multi-select use the existing
 * SearchableSelect/MultiSelect; this is the lightweight single-choice control.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <span className="relative block w-full">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full appearance-none rounded-control border border-border bg-surface px-3 py-2.5 pr-9 text-sm text-foreground outline-none transition",
          "focus:border-brand/60 focus:ring-2 focus:ring-brand/60",
          "disabled:cursor-not-allowed disabled:opacity-60",
          invalid && "border-error ring-2 ring-error/60",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
});
