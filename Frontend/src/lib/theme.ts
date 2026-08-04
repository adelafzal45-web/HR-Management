// ============================================================================
// Theme palette derived from the single `primary_color` in company_settings.
//
// The brand colour is configurable at runtime, so it can't live in
// tailwind.config.js as a literal — Tailwind compiles at build time and has no
// idea what a given deployment picked. Instead the config points at CSS custom
// properties (see tailwind.config.js) and this module writes them onto <html>
// once branding loads.
//
// The variables hold SPACE-SEPARATED RGB CHANNELS, not hex:
//
//   --color-brand: 241 179 68;
//
// That's deliberate. Tailwind's opacity modifiers (`bg-brand/60`,
// `focus:ring-brand/60`, which this codebase already uses) compile to
// `rgb(var(--color-brand) / 0.6)`. A hex value in the variable would make that
// expression invalid and the utility would silently produce no colour. Channels
// keep every existing `/opacity` utility working unchanged.
// ============================================================================

export type Rgb = { r: number; g: number; b: number };

/**
 * Fallback palette. Matches the value seeded into company_settings, so the app
 * looks correct during the first paint — before the branding request resolves —
 * and stays correct if it fails outright. Mirrored in index.css, which is what
 * actually applies during that first paint.
 */
export const DEFAULT_PRIMARY_COLOR = "#F1B344";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Parses `#RRGGBB` (with or without the hash). Returns null on anything else. */
export function parseHexColor(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = Number.parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

type Hsl = { h: number; s: number; l: number };

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const m = l - c / 2;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/**
 * WCAG relative luminance, used to decide whether text sitting *on* the brand
 * colour should be near-black or white. A configurable brand colour means we
 * can't hardcode one or the other: `text-gray-900` is right on amber and
 * unreadable on navy.
 */
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export type ThemePalette = {
  brand: Rgb;
  /** Hover/gradient-end variant: same hue, darker. */
  brandDark: Rgb;
  /** Pale tint for selected rows, badges, and active nav items. */
  brandLight: Rgb;
  /** Readable foreground for text/icons placed on `brand`. */
  brandContrast: Rgb;
};

/**
 * Derives the full palette from one colour.
 *
 * Hue and saturation are preserved and only lightness moves, so an arbitrary
 * primary colour yields a coherent set rather than three unrelated swatches.
 * The multipliers were chosen to reproduce roughly the original hand-picked
 * amber palette while still behaving sensibly at the extremes — a very dark
 * primary still gets a distinguishable `dark`, because the floor is relative.
 */
export function derivePalette(primary: Rgb): ThemePalette {
  const hsl = rgbToHsl(primary);

  const brandDark = hslToRgb({
    h: hsl.h,
    s: hsl.s,
    // Relative reduction, floored so a near-black primary doesn't collapse to
    // pure black and lose the hover affordance entirely.
    l: clamp(hsl.l * 0.82, 0.08, 0.95),
  });

  const brandLight = hslToRgb({
    h: hsl.h,
    // Slightly desaturated, otherwise a pale tint of a vivid hue reads as
    // washed-out neon rather than a neutral background.
    s: clamp(hsl.s * 0.85, 0, 1),
    l: clamp(Math.max(hsl.l, 0.9), 0.85, 0.96),
  });

  // 0.45 rather than the usual 0.5 midpoint: dark text holds up slightly better
  // than white on mid-tone colours at the small sizes used on buttons.
  const brandContrast =
    relativeLuminance(primary) > 0.45
      ? { r: 17, g: 24, b: 39 } // gray-900, matching the existing button styling
      : { r: 255, g: 255, b: 255 };

  return { brand: primary, brandDark, brandLight, brandContrast };
}

const channels = ({ r, g, b }: Rgb) => `${r} ${g} ${b}`;

/**
 * Writes the palette onto <html> as CSS custom properties.
 *
 * Applied to documentElement rather than injecting a <style> tag so it cascades
 * to portalled content too — modals and toasts mount outside the React root but
 * still inherit from <html>.
 *
 * An unparseable colour is ignored rather than reset to the default: the
 * fallback already lives in index.css, and blanking the variables mid-session
 * would make a bad save look like a broken app.
 */
export function applyPrimaryColor(primaryColor: string | null | undefined): void {
  if (typeof document === "undefined") return;

  const parsed = parseHexColor(primaryColor || "");
  if (!parsed) return;

  const palette = derivePalette(parsed);
  const root = document.documentElement;

  root.style.setProperty("--color-brand", channels(palette.brand));
  root.style.setProperty("--color-brand-dark", channels(palette.brandDark));
  root.style.setProperty("--color-brand-light", channels(palette.brandLight));
  root.style.setProperty("--color-brand-contrast", channels(palette.brandContrast));
}
