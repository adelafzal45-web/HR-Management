import { createPortal } from "react-dom";
import badge from "@/assets/badge.png";

type LoadingOverlayProps = {
  show: boolean;
  label?: string;
};

// A lightweight, employee preloader shown while an action (login, sign
// up, sending a reset link, etc.) is in flight. Rendered via a portal so it
// always covers the full viewport regardless of where it's triggered from.
export default function LoadingOverlay({ show, label = "Just a moment…" }: LoadingOverlayProps) {
  if (!show) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-white/75 backdrop-blur-sm"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-[3px] border-brand-light" />
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-brand border-r-brand-dark" />
        <img
          src={badge}
          alt=""
          aria-hidden
          className="h-11 w-11 animate-pulse rounded-full object-contain shadow-sm"
        />
      </div>
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>,
    document.body,
  );
}
