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

// ============================================================================
// Design theme — the admin-configurable layer on top of the brand colour.
//
// Everything below drives the CSS custom properties declared in
// styles/index.css from a single JSON blob (company_settings.theme_config).
// The TS shape mirrors Backend/src/company-settings/theme-config.type.ts; the
// two are kept in sync by hand (the frontend can't import from the backend).
//
// The 13 colours per scheme are the ONLY colours stored. Their tint/contrast
// companions (`--color-success-tint`, `--color-accent-contrast`, …) are DERIVED
// here from luminance/lightness, so the admin never has to hand-tune a readable
// badge background or decide black-vs-white button text.
// ============================================================================

export type ThemeMode = "light" | "dark" | "system";
export type ThemeDensity = "comfortable" | "compact";
export type ShadowLevel = "none" | "sm" | "md" | "lg";
export type SidebarStyle = "solid" | "floating";

/** One full semantic colour set (hex), applied for a single light/dark scheme. */
export type ThemeColorSet = {
  accent: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  borderMuted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
};

export type ThemeRadius = { control: number; card: number; modal: number };
export type ThemeTypography = { fontFamily: string; baseSize: number; scale: number };
export type ThemeLayout = {
  sidebarWidth: number;
  sidebarCollapsedWidth: number;
  contentMaxWidth: number;
  headerHeight: number;
  sidebarStyle: SidebarStyle;
};

export type ThemeConfig = {
  mode: ThemeMode;
  density: ThemeDensity;
  colors: { light: ThemeColorSet; dark: ThemeColorSet };
  radius: ThemeRadius;
  shadow: ShadowLevel;
  typography: ThemeTypography;
  layout: ThemeLayout;
};

/**
 * The default theme. Every value here is the exact counterpart of a `:root` /
 * `.dark` default in styles/index.css, so a null `theme_config` (no admin
 * override) renders identically whether the CSS defaults or this object drive
 * it. This is also what "Reset to Default" on the Appearance screen restores.
 */
export const DEFAULT_THEME: ThemeConfig = {
  mode: "light",
  density: "comfortable",
  colors: {
    light: {
      accent: "#475569",
      background: "#F9FAFB",
      surface: "#FFFFFF",
      surfaceMuted: "#F3F4F6",
      foreground: "#111827",
      muted: "#6B7280",
      mutedForeground: "#9CA3AF",
      border: "#E5E7EB",
      borderMuted: "#F3F4F6",
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      info: "#3B82F6",
    },
    dark: {
      accent: "#94A3B8",
      background: "#0F172A",
      surface: "#1E293B",
      surfaceMuted: "#334155",
      foreground: "#F1F5F9",
      muted: "#94A3B8",
      mutedForeground: "#64748B",
      border: "#334155",
      borderMuted: "#1E293B",
      success: "#34D399",
      warning: "#FBBF24",
      error: "#F87171",
      info: "#60A5FA",
    },
  },
  radius: { control: 12, card: 16, modal: 16 },
  shadow: "sm",
  typography: { fontFamily: '"Poppins", system-ui, sans-serif', baseSize: 16, scale: 1.2 },
  layout: {
    sidebarWidth: 288,
    sidebarCollapsedWidth: 80,
    contentMaxWidth: 1600,
    headerHeight: 64,
    sidebarStyle: "solid",
  },
};

/**
 * Fills a stored/partial theme against DEFAULT_THEME so a config written by an
 * older app version (missing a key added later) never yields `undefined` vars.
 * A one-level-deep merge per section is enough — the leaves are scalars.
 */
export function mergeTheme(
  base: ThemeConfig,
  override: Partial<ThemeConfig> | null | undefined,
): ThemeConfig {
  if (!override) return base;
  return {
    mode: override.mode ?? base.mode,
    density: override.density ?? base.density,
    shadow: override.shadow ?? base.shadow,
    colors: {
      light: { ...base.colors.light, ...override.colors?.light },
      dark: { ...base.colors.dark, ...override.colors?.dark },
    },
    radius: { ...base.radius, ...override.radius },
    typography: { ...base.typography, ...override.typography },
    layout: { ...base.layout, ...override.layout },
  };
}

const GRAY_900: Rgb = { r: 17, g: 24, b: 39 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * Near-black or white, whichever reads better *on* the given fill. Same 0.45
 * threshold as the brand-contrast rule above, for the same reason.
 */
function contrastOn(rgb: Rgb): Rgb {
  return relativeLuminance(rgb) > 0.45 ? GRAY_900 : WHITE;
}

/**
 * A subtle background tint of a colour — pale in light mode, deep in dark mode —
 * so `bg-success-tint text-success` reads as a coherent badge in both schemes
 * without the admin picking eight extra colours.
 */
function tintOf(rgb: Rgb, isDark: boolean): Rgb {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s * (isDark ? 0.55 : 0.85), 0, 1),
    l: isDark ? 0.18 : 0.94,
  });
}

/** Resolves 'system' against the OS preference; passes 'light'/'dark' through. */
export function resolveThemeMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

// The stored colour keys → their CSS custom property names. Explicit rather than
// kebab-cased at runtime so a rename can't silently produce a dead variable.
const COLOR_VARS: Record<keyof ThemeColorSet, string> = {
  accent: "--color-accent",
  background: "--color-background",
  surface: "--color-surface",
  surfaceMuted: "--color-surface-muted",
  foreground: "--color-foreground",
  muted: "--color-muted",
  mutedForeground: "--color-muted-foreground",
  border: "--color-border",
  borderMuted: "--color-border-muted",
  success: "--color-success",
  warning: "--color-warning",
  error: "--color-error",
  info: "--color-info",
};

// `--shadow-card` points at the scheme's ramp entry (not a literal), so the
// deeper dark-mode shadow definitions in styles/index.css still apply.
const SHADOW_CARD: Record<ShadowLevel, string> = {
  none: "none",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
};

/**
 * Builds the full CSS-variable map for one resolved scheme, without touching the
 * DOM. Kept pure and separate from `applyTheme` so the provider can compute both
 * the light and dark maps up front and cache them for the pre-React first paint
 * (see the FOUC script in index.html), and so 'system' can switch schemes with
 * no recompute.
 */
export function computeThemeVars(
  theme: ThemeConfig,
  primaryColor: string | null | undefined,
  mode: "light" | "dark",
): Record<string, string> {
  const isDark = mode === "dark";
  const vars: Record<string, string> = {};

  // Brand — derived from primary_color, with a mode-aware active-state tint.
  const brand = parseHexColor(primaryColor || "") ?? parseHexColor(DEFAULT_PRIMARY_COLOR)!;
  const palette = derivePalette(brand);
  vars["--color-brand"] = channels(palette.brand);
  vars["--color-brand-dark"] = channels(palette.brandDark);
  vars["--color-brand-contrast"] = channels(palette.brandContrast);
  vars["--color-brand-light"] = channels(isDark ? tintOf(brand, true) : palette.brandLight);

  // Stored semantic + status colours for this scheme.
  const set = theme.colors[mode];
  (Object.keys(COLOR_VARS) as (keyof ThemeColorSet)[]).forEach((key) => {
    const rgb = parseHexColor(set[key]);
    if (rgb) vars[COLOR_VARS[key]] = channels(rgb);
  });

  // Derived companions: accent foreground + a tint/contrast per status colour.
  const accent = parseHexColor(set.accent);
  if (accent) vars["--color-accent-contrast"] = channels(contrastOn(accent));
  (["success", "warning", "error", "info"] as const).forEach((key) => {
    const rgb = parseHexColor(set[key]);
    if (!rgb) return;
    vars[`--color-${key}-tint`] = channels(tintOf(rgb, isDark));
    vars[`--color-${key}-contrast`] = channels(contrastOn(rgb));
  });

  // Radii, elevation, typography, layout (scheme-independent, emitted in both).
  vars["--radius-control"] = `${theme.radius.control}px`;
  vars["--radius-card"] = `${theme.radius.card}px`;
  vars["--radius-modal"] = `${theme.radius.modal}px`;
  vars["--shadow-card"] = SHADOW_CARD[theme.shadow] ?? SHADOW_CARD.sm;
  vars["--font-sans"] = theme.typography.fontFamily;
  vars["--font-size-base"] = `${theme.typography.baseSize}px`;
  vars["--font-scale"] = String(theme.typography.scale);
  vars["--sidebar-width"] = `${theme.layout.sidebarWidth}px`;
  vars["--sidebar-width-collapsed"] = `${theme.layout.sidebarCollapsedWidth}px`;
  vars["--content-max-width"] = `${theme.layout.contentMaxWidth}px`;
  vars["--header-height"] = `${theme.layout.headerHeight}px`;

  return vars;
}

/**
 * Writes a theme onto <html>: the resolved scheme's variables, the `dark` class,
 * and the density attribute. This is the single runtime entry point the
 * ThemeProvider calls — for the saved theme, for a live preview draft, and again
 * whenever the OS scheme changes under 'system'. Idempotent and safe to re-run.
 */
export function applyTheme(
  theme: ThemeConfig,
  primaryColor: string | null | undefined,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const mode = resolveThemeMode(theme.mode);
  const vars = computeThemeVars(theme, primaryColor, mode);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle("dark", mode === "dark");
  root.setAttribute("data-density", theme.density);
}
