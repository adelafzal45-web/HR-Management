// Preview + print wrapper for ID card faces.
//
// The faces themselves are laid out in millimetres at true physical size, which
// is ~204px wide on screen — too small to review. `IdCardStage` scales a face up
// for on-screen display using a transform, so the preview is a magnified view
// of the exact print geometry rather than a separate larger layout that could
// drift from it.
//
// `IdCardSheet` renders every selected card into a print-only container. The
// print CSS mirrors the legacy @media print block: exact colour adjustment
// (otherwise browsers strip the gold gradients), no preview transform, no
// shadows, one card per page.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  PREVIEW_SCALE,
} from "@/modules/employees/components/idcard/idCardStyles";

/**
 * Scales a true-size card face for on-screen review.
 *
 * The outer box reserves the scaled footprint so surrounding layout reflows
 * correctly — a bare `transform: scale()` would visually enlarge the card while
 * leaving a 204px hole in the flow, overlapping whatever sits beside it.
 */
export function IdCardStage({
  children,
  scale = PREVIEW_SCALE,
  label,
}: {
  children: ReactNode;
  scale?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      )}
      <div
        style={{
          width: `calc(${CARD_WIDTH_MM}mm * ${scale})`,
          height: `calc(${CARD_HEIGHT_MM}mm * ${scale})`,
          overflow: "visible",
        }}
      >
        <div
          style={{
            width: `${CARD_WIDTH_MM}mm`,
            height: `${CARD_HEIGHT_MM}mm`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            boxShadow: "0 18px 40px -12px rgba(20,15,5,.35), 0 2px 6px rgba(20,15,5,.15)",
            borderRadius: "3.2mm",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Print-only container: hidden on screen, and the only thing visible when the
 * browser prints. Each child is placed on its own page at exact trim size.
 *
 * The `@media print` rules are injected as a <style> element rather than added
 * to the global stylesheet because they hide the entire app (`body > *`) while
 * printing — scoping them to this component means they only exist while a card
 * sheet is mounted, so an unrelated Ctrl+P elsewhere in the app is unaffected.
 */
/**
 * Print-only container: hidden on screen, and the only thing visible when the
 * browser prints. Each child is placed on its own page at exact trim size.
 *
 * Rendered through a portal into `document.body` rather than inline, because the
 * print rules hide every *direct child* of body except this sheet. Left inline,
 * the sheet would sit inside `#root` — which the same rule hides — so the
 * printout would be blank. The portal makes the sheet a sibling of `#root`,
 * which is exactly what the selector expects.
 *
 * The `@media print` rules are injected as a <style> element rather than added
 * to the global stylesheet because they hide the entire app while printing —
 * scoping them here means they only exist while a card sheet is mounted, so an
 * unrelated Ctrl+P elsewhere in the app is unaffected.
 */
export function IdCardSheet({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "idcard-print-root idcard-print-sheet";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);

  return (
    <>
      <style>{`
        .idcard-print-sheet { display: none; }
        @media print {
          /* Keep the gold gradients and cream ground: browsers drop background
             graphics when printing unless told otherwise. */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          /* Hide the app chrome, show only the sheet. */
          body > *:not(.idcard-print-root) { display: none !important; }
          .idcard-print-root { display: block !important; }
          .idcard-print-page {
            width: ${CARD_WIDTH_MM}mm;
            height: ${CARD_HEIGHT_MM}mm;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            box-shadow: none !important;
          }
          .idcard-print-page:last-child { page-break-after: auto; break-after: auto; }
          @page { margin: 0; size: ${CARD_WIDTH_MM}mm ${CARD_HEIGHT_MM}mm; }
        }
      `}</style>
      {host && createPortal(children, host)}
    </>
  );
}

/** One printed page holding a single card face at exact trim size. */
export function IdCardPage({ children }: { children: ReactNode }) {
  return <div className="idcard-print-page">{children}</div>;
}
