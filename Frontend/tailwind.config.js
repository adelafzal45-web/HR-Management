/** @type {import('tailwindcss').Config} */

// Colours, radii, shadows, typography and layout are NOT literals here on
// purpose. The design theme (company_settings.theme_config) plus the brand
// primary_color are editable at runtime from Settings > Appearance, and Tailwind
// compiles at build time — so every utility points at a CSS custom property that
// src/lib/theme.ts writes onto <html> once settings load. The first-paint
// defaults live in src/styles/index.css (:root for light, .dark for dark).
//
// `<alpha-value>` is the placeholder Tailwind substitutes when an opacity
// modifier is used, which is why the colour variables hold space-separated RGB
// channels rather than hex: it keeps `bg-brand/60`, `bg-surface/70`,
// `focus:ring-brand/60` and friends working exactly as before.
export default {
 content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
 // Dark mode is opt-in via a `.dark` class on <html>, toggled by the theme
 // pipeline (resolving 'system' through prefers-color-scheme). NOT the default
 // `media` strategy: the mode is an admin/user setting, not the OS's call.
 darkMode: "class",
 theme: {
 extend: {
 screens: {
 xs: "375px",
 },
 colors: {
 brand: {
 DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
 dark: "rgb(var(--color-brand-dark) / <alpha-value>)",
 light: "rgb(var(--color-brand-light) / <alpha-value>)",
 // Readable foreground for text/icons sitting on `brand`. Derived from
 // the primary colour's luminance, so a dark brand colour flips this to
 // white instead of leaving unreadable dark text on a dark button.
 contrast: "rgb(var(--color-brand-contrast) / <alpha-value>)",
 },
 // Secondary / accent.
 accent: {
 DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
 contrast: "rgb(var(--color-accent-contrast) / <alpha-value>)",
 },
 // Semantic neutrals — the themed replacements for the hardcoded grays.
 // See the migration map in the redesign plan (bg-white → bg-surface, etc.).
 background: "rgb(var(--color-background) / <alpha-value>)",
 surface: {
 DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
 muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
 },
 foreground: "rgb(var(--color-foreground) / <alpha-value>)",
 muted: {
 DEFAULT: "rgb(var(--color-muted) / <alpha-value>)",
 foreground: "rgb(var(--color-muted-foreground) / <alpha-value>)",
 },
 // Named `border` so `border-border` / `bg-border` themed usages work.
 // The bare `border` utility (width) is untouched — this only adds colours.
 border: {
 DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
 muted: "rgb(var(--color-border-muted) / <alpha-value>)",
 },
 // Status. Each carries a subtle `-tint` background and a readable
 // `-contrast` foreground for solid fills.
 success: {
 DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
 tint: "rgb(var(--color-success-tint) / <alpha-value>)",
 contrast: "rgb(var(--color-success-contrast) / <alpha-value>)",
 },
 warning: {
 DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
 tint: "rgb(var(--color-warning-tint) / <alpha-value>)",
 contrast: "rgb(var(--color-warning-contrast) / <alpha-value>)",
 },
 error: {
 DEFAULT: "rgb(var(--color-error) / <alpha-value>)",
 tint: "rgb(var(--color-error-tint) / <alpha-value>)",
 contrast: "rgb(var(--color-error-contrast) / <alpha-value>)",
 },
 info: {
 DEFAULT: "rgb(var(--color-info) / <alpha-value>)",
 tint: "rgb(var(--color-info-tint) / <alpha-value>)",
 contrast: "rgb(var(--color-info-contrast) / <alpha-value>)",
 },
 },
 borderRadius: {
 control: "var(--radius-control)",
 card: "var(--radius-card)",
 modal: "var(--radius-modal)",
 pill: "var(--radius-pill)",
 },
 // New names, not overrides: the existing `shadow-sm/md/lg/xl` utilities keep
 // Tailwind's values so no unmigrated screen shifts. The kit uses these, and
 // the shadow-level setting drives `--shadow-card`.
 boxShadow: {
 card: "var(--shadow-card)",
 "card-md": "var(--shadow-md)",
 "card-lg": "var(--shadow-lg)",
 },
 fontFamily: {
 // Single entry whose var() fallback carries the full stack, so a themed
 // family applies and a missing one degrades to Poppins → system.
 sans: ["var(--font-sans, \"Poppins\", system-ui, sans-serif)"],
 },
 maxWidth: {
 content: "var(--content-max-width)",
 },
 width: {
 sidebar: "var(--sidebar-width)",
 "sidebar-collapsed": "var(--sidebar-width-collapsed)",
 },
 // Extends width/height/padding/etc. — enables h-header, w-sidebar and the
 // density paddings p-density-pad / py-density-row used by the kit.
 spacing: {
 header: "var(--header-height)",
 "density-pad": "var(--density-pad)",
 "density-row": "var(--density-row)",
 },
 },
 },
 plugins: [],
};
