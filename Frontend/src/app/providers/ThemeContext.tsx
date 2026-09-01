import {
 createContext,
 useCallback,
 useContext,
 useEffect,
 useMemo,
 useState,
 type ReactNode,
} from "react";
import { useBranding } from "@/app/providers/BrandingContext";
import {
 applyTheme,
 computeThemeVars,
 DEFAULT_THEME,
 mergeTheme,
 type ThemeConfig,
} from "@/lib/theme";

// Cache key for the pre-React FOUC script in index.html. Kept in sync with the
// literal in that inline script (it can't import from here — it runs before the
// bundle loads).
const THEME_CACHE_KEY = "hrms:theme";

type ThemeContextValue = {
 /** The theme currently applied to the DOM — the saved theme, or a preview draft. */
 theme: ThemeConfig;
 /** The persisted theme, ignoring any active preview. "Reset to Default" target. */
 savedTheme: ThemeConfig;
 /** True while a preview draft is overriding the saved theme. */
 isPreviewing: boolean;
 /** Apply a draft to the CSS variables instantly, without persisting it. */
 previewTheme: (draft: ThemeConfig) => void;
 /** Drop any preview draft and re-apply the saved theme. */
 resetPreview: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Persists the resolved variable maps for BOTH schemes so the inline script in
 * index.html can paint the correct theme before React (or even the CSS bundle)
 * loads on a return visit. Only the SAVED theme is cached — never a live preview,
 * which would otherwise "stick" across a reload.
 */
function cacheTheme(theme: ThemeConfig, primaryColor: string | null | undefined) {
 try {
 localStorage.setItem(
 THEME_CACHE_KEY,
 JSON.stringify({
 mode: theme.mode,
 density: theme.density,
 light: computeThemeVars(theme, primaryColor, "light"),
 dark: computeThemeVars(theme, primaryColor, "dark"),
 }),
 );
 } catch {
 // Private mode / quota exceeded — the static :root/.dark defaults in
 // styles/index.css still cover the first paint. Non-fatal.
 }
}

/**
 * Owns the runtime theme.
 *
 * Mounted INSIDE BrandingProvider (it reads `themeConfig` + `primaryColor` from
 * it) and is the SOLE writer of the design CSS variables — BrandingContext no
 * longer applies the brand colour itself, so the mode-aware values computed here
 * (e.g. a dark active-nav tint) are never clobbered. Because child effects run
 * before parent effects, keeping a single applier here avoids an ordering race.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
 const { branding } = useBranding();

 // Saved theme = DEFAULT_THEME with the admin's stored override merged over it.
 // A null override (no customisation) resolves to exactly DEFAULT_THEME.
 const savedTheme = useMemo(
 () => mergeTheme(DEFAULT_THEME, branding.themeConfig),
 [branding.themeConfig],
 );

 // A live-preview draft from the Appearance screen; null when not previewing.
 const [preview, setPreview] = useState<ThemeConfig | null>(null);
 const theme = preview ?? savedTheme;

 // Apply whenever the effective theme or the brand colour changes.
 useEffect(() => {
 applyTheme(theme, branding.primaryColor);
 }, [theme, branding.primaryColor]);

 // Cache the SAVED theme (not previews) for the next visit's first paint.
 useEffect(() => {
 cacheTheme(savedTheme, branding.primaryColor);
 }, [savedTheme, branding.primaryColor]);

 // While mode === 'system', follow the OS scheme live. applyTheme re-resolves
 // 'system' via matchMedia on each call, so re-applying is all that's needed.
 useEffect(() => {
 if (theme.mode !== "system") return;
 if (typeof window === "undefined" || !window.matchMedia) return;
 const mq = window.matchMedia("(prefers-color-scheme: dark)");
 const onChange = () => applyTheme(theme, branding.primaryColor);
 mq.addEventListener("change", onChange);
 return () => mq.removeEventListener("change", onChange);
 }, [theme, branding.primaryColor]);

 const previewTheme = useCallback((draft: ThemeConfig) => setPreview(draft), []);
 const resetPreview = useCallback(() => setPreview(null), []);

 const value = useMemo<ThemeContextValue>(
 () => ({
 theme,
 savedTheme,
 isPreviewing: preview !== null,
 previewTheme,
 resetPreview,
 }),
 [theme, savedTheme, preview, previewTheme, resetPreview],
 );

 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
 const ctx = useContext(ThemeContext);
 if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
 return ctx;
}
