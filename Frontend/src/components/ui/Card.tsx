import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * The card shell — one place for the `rounded-card bg-surface shadow-card` +
 * hairline ring that was copy-pasted (as `rounded-2xl bg-white shadow-sm
 * ring-1 ring-gray-100`) across KPIs, empty/error states, tables and panels.
 * Pair with CardHeader/CardBody/CardFooter for the standard sectioning, or drop
 * arbitrary children in and pad via className.
 */
export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover elevation + a focus ring; use for clickable cards. */
  interactive?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card bg-surface shadow-card ring-1 ring-border-muted",
        interactive &&
          "cursor-pointer transition hover:shadow-card-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
        className,
      )}
      {...rest}
    />
  );
});

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3 border-b border-border-muted px-5 py-4", className)}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-3 border-t border-border-muted px-5 py-4", className)}
      {...rest}
    />
  );
}
