import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Draws the error ring and sets `aria-invalid` for assistive tech. */
  invalid?: boolean;
};

/**
 * The base text input — token-driven so it themes with the rest of the kit.
 * Intentionally unopinionated about labels/adornments: `FormField` composes it
 * with a label and the password-reveal toggle, and forms that need a leading
 * icon wrap it themselves. Refs and native attributes pass straight through.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-control bg-surface-muted px-4 py-3 text-sm text-foreground outline-none transition",
        "placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        invalid && "ring-2 ring-error/60",
        className,
      )}
      {...rest}
    />
  );
});
