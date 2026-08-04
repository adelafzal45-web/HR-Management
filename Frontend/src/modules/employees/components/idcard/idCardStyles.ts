// ============================================================================
// Shared geometry and palette for the printed ID card.
//
// The card is specified in millimetres because it is a physical object: CR80
// portrait, 53.98mm x 85.6mm trim. Tailwind cannot express mm, and rounding
// these to the nearest rem would change the printed size, so both faces use
// inline styles built from these constants instead of utility classes. That is
// the one place in the app where inline styles are the correct tool rather than
// a shortcut.
//
// Values are transcribed from Backend/TechnoCues_ID_Card.html so a card
// printed from this app is dimensionally identical to the approved design; the
// markup itself is rebuilt as components rather than embedded, per the spec.
// ============================================================================

import type { CSSProperties } from "react";

/** CR80 portrait trim size. Do not add bleed — print vendors impose that. */
export const CARD_WIDTH_MM = 53.98;
export const CARD_HEIGHT_MM = 85.6;

/**
 * Screen preview scale. The legacy file used 3.6, which renders the 53.98mm
 * card at a comfortable ~204px CSS width for on-screen review.
 */
export const PREVIEW_SCALE = 3.6;

export const CARD_COLORS = {
  gold1: "#F8C828",
  gold2: "#EDA458",
  ink: "#1A1A1A",
  inkSoft: "#3A3A3A",
  cream: "#FFFBF2",
  cream2: "#FFF6E4",
  line: "#E9DFC9",
  white: "#FFFFFF",
  goldText: "#9A6A17",
  muted: "#8a8272",
  mutedLabel: "#a49a82",
  expiry: "#B04A2C",
} as const;

/** The outer face: fixed physical size, clipped corners, cream ground. */
export const cardFaceStyle: CSSProperties = {
  width: `${CARD_WIDTH_MM}mm`,
  height: `${CARD_HEIGHT_MM}mm`,
  borderRadius: "3.2mm",
  overflow: "hidden",
  position: "relative",
  background: CARD_COLORS.cream,
  fontFamily: "'Inter', system-ui, sans-serif",
};

/**
 * Decorative outlined circle bleeding off a corner. Purely visual, so it is
 * marked aria-hidden at every call site.
 */
export function cornerRingStyle(
  size: string,
  position: CSSProperties,
): CSSProperties {
  return {
    position: "absolute",
    borderRadius: "50%",
    border: `1.1mm solid ${CARD_COLORS.gold1}`,
    opacity: 0.14,
    width: size,
    height: size,
    ...position,
  };
}
