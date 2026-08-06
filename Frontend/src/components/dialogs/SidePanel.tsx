import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type SidePanelProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky action row pinned to the bottom, outside the scroll area. */
  footer?: ReactNode;
  /** Tailwind max-width for the panel. `max-w-md` suits a single column. */
  maxWidth?: string;
};

/**
 * A right-hand drawer, as the counterpart to `Modal`'s centred dialog.
 *
 * The distinction is what the work is *about*. A modal is a self-contained
 * decision — confirm this, fill this in — and centring it is correct because
 * nothing behind it matters while it is open. A drawer is for editing one row of
 * a list you are still working through: the table stays visible beside it, so the
 * row being edited keeps its context and closing the panel does not feel like
 * leaving a screen.
 *
 * It is also the shape that survives long forms. The header and footer are
 * outside the scroll container, so Save never scrolls out of reach no matter how
 * many fields the panel grows — the failure mode a tall centred modal has.
 *
 * Full-width below `sm`: a 28rem drawer on a phone is a modal with wasted margin.
 */
export default function SidePanel({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = "max-w-md",
}: SidePanelProps) {
  // Escape closes, matching ConfirmDialog and the filter popovers. Bound only
  // while open so a closed panel is not holding a global key handler.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The page behind must not scroll while the drawer is over it: a trackpad
  // gesture that starts on the backdrop would otherwise move the table.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full ${maxWidth} flex-col bg-white shadow-2xl sm:rounded-l-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-gray-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-gray-100 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
