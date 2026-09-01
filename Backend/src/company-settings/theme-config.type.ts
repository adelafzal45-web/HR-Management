/**
 * Shape of the admin-configurable design theme.
 *
 * Stored as a single `jsonb` blob on `company_settings.theme_config` and served
 * (whole) on the public branding payload so the frontend can theme itself before
 * any token exists. The brand/primary colour is NOT here — it stays in
 * `primary_color`, which drives the derived brand palette. Everything else the
 * Appearance settings screen controls lives in this object.
 *
 * Colours are `#rrggbb` hex; the frontend converts them to the space-separated
 * RGB channels its CSS variables use. Sizes are plain numbers in the unit noted
 * per field. A null column means "no override" → the frontend falls back to
 * DEFAULT_THEME.
 *
 * Validation of an incoming object lives in `dto/theme-config.dto.ts`; this
 * interface is the read-side type used by the entity and service.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeDensity = 'comfortable' | 'compact';
export type ShadowLevel = 'none' | 'sm' | 'md' | 'lg';
export type SidebarStyle = 'solid' | 'floating';

/** Semantic colours as `#rrggbb`; one full set per colour scheme. */
export interface ThemeColorSet {
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
}

/** Corner radii in px, per component family. */
export interface ThemeRadius {
  control: number;
  card: number;
  modal: number;
}

export interface ThemeTypography {
  /** CSS font-family stack, or a single family name. */
  fontFamily: string;
  /** Base body font size in px. */
  baseSize: number;
  /** Heading scale ratio (e.g. 1.2 = minor third). */
  scale: number;
}

export interface ThemeLayout {
  /** Expanded sidebar width in px. */
  sidebarWidth: number;
  /** Collapsed sidebar width in px. */
  sidebarCollapsedWidth: number;
  /** Max content column width in px. */
  contentMaxWidth: number;
  /** Header height in px. */
  headerHeight: number;
  sidebarStyle: SidebarStyle;
}

export interface ThemeConfig {
  mode: ThemeMode;
  density: ThemeDensity;
  colors: {
    light: ThemeColorSet;
    dark: ThemeColorSet;
  };
  radius: ThemeRadius;
  shadow: ShadowLevel;
  typography: ThemeTypography;
  layout: ThemeLayout;
}
