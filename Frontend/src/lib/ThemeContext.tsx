import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Scoped, opt-in dark mode — not a full app-wide theme switch. Tailwind's
// `dark:` variant is class-based (see tailwind.config.js), so any subtree
// that renders with a `dark` class on its root reacts to it. We persist the
// preference so it "sticks" per browser, and expose the raw class string so
// portaled pieces (dialogs/toasts rendered via createPortal, which sit
// outside the normal DOM tree) can apply it to their own root explicitly.

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  /** Convenience className to spread on any root node ("dark" | ""). */
  themeClass: string;
};

const STORAGE_KEY = "hrms.employees.theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadInitial(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    // ignore — falls through to system preference
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => loadInitial());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // storage unavailable — preference just won't persist
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === "dark",
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      themeClass: theme === "dark" ? "dark" : "",
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
