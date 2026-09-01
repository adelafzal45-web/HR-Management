import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Builds a windowed page list with `"…"` gaps so the control stays compact for
 * large page counts: always shows first/last and a small window around current.
 * e.g. page 7 of 20 → [1, "…", 6, 7, 8, "…", 20].
 */
export function buildPageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

const navBtn =
  "flex min-h-9 min-w-9 items-center justify-center rounded-control border border-border text-muted transition " +
  "hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-muted";

export type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/**
 * Token-driven pager shared by DataTable and any paged list. Three responsive
 * tiers so it never overflows a narrow viewport: below `xs` only Prev/Next + a
 * compact "page / total"; from `xs` the First/Last jumps appear; from `sm` the
 * full numbered window replaces the compact indicator. The active page uses the
 * brand gradient with its readable `brand-contrast` foreground. Renders nothing
 * for a single page.
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages));

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        className={cn(navBtn, "hidden xs:flex")}
        onClick={() => go(1)}
        disabled={page <= 1}
        aria-label="First page"
      >
        <ChevronsLeft size={15} aria-hidden />
      </button>
      <button type="button" className={navBtn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft size={15} aria-hidden />
      </button>

      {/* Numbered window on ≥ sm; a compact "page / total" on smaller screens. */}
      <div className="hidden items-center gap-1 sm:flex">
        {buildPageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="flex min-h-9 min-w-9 items-center justify-center text-sm text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => go(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "flex min-h-9 min-w-9 items-center justify-center rounded-control text-sm font-medium transition",
                p === page
                  ? "bg-gradient-to-r from-brand to-brand-dark text-brand-contrast shadow-card"
                  : "text-muted hover:bg-background hover:text-foreground",
              )}
            >
              {p}
            </button>
          ),
        )}
      </div>

      <span className="min-w-[64px] text-center text-sm font-medium text-foreground sm:hidden">
        {page} / {totalPages}
      </span>

      <button type="button" className={navBtn} onClick={() => go(page + 1)} disabled={page >= totalPages} aria-label="Next page">
        <ChevronRight size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(navBtn, "hidden xs:flex")}
        onClick={() => go(totalPages)}
        disabled={page >= totalPages}
        aria-label="Last page"
      >
        <ChevronsRight size={15} aria-hidden />
      </button>
    </div>
  );
}
