/** @type {import('tailwindcss').Config} */

// The brand colours are NOT literals here on purpose. `primary_color` in
// company_settings is editable at runtime from Settings > Branding, and Tailwind
// compiles at build time — so the utilities point at CSS custom properties that
// src/lib/theme.ts writes onto <html> once branding loads. Defaults for the
// first paint live in src/index.css.
//
// `<alpha-value>` is the placeholder Tailwind substitutes when an opacity
// modifier is used, which is why the variables hold space-separated RGB
// channels rather than hex: it keeps `bg-brand/60`, `focus:ring-brand/60` and
// friends working exactly as before.
export default {
 content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
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
 },
 fontFamily: {
 sans: ["Poppins", "system-ui", "sans-serif"],
 },
 },
 },
 plugins: [],
};
