import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { brandingApi, type BrandingSettings } from "@/modules/settings/api/settingsApi";
import { useAuth } from "@/app/providers/AuthContext";
import { applyPrimaryColor, DEFAULT_PRIMARY_COLOR } from "@/lib/theme";

type BrandingContextValue = {
 branding: BrandingSettings;
 loading: boolean;
 error: string | null;
 refresh: () => void;
 updateBranding: (payload: BrandingSettings) => Promise<BrandingSettings>;
};

const EMPTY_BRANDING: BrandingSettings = {
 companyName: "",
 logoUrl: "",
 logoCollapsedUrl: "",
 faviconUrl: "",
 email: "",
 phone: "",
 address: "",
 website: "",
 // Matches the :root fallback in index.css, so the placeholder state and the
 // first paint agree instead of briefly disagreeing on the brand colour.
 primaryColor: DEFAULT_PRIMARY_COLOR,
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

// Keeps the browser tab favicon in sync with the Branding settings.
// Falls back silently to the bundled favicon.svg (already linked in
// index.html) whenever no custom favicon is set or the URL fails to load.
function applyFavicon(url: string | undefined) {
 if (typeof document === "undefined") return;
 if (!url) return;
 let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
 if (!link) {
 link = document.createElement("link");
 link.rel = "icon";
 document.head.appendChild(link);
 }
 link.href = url;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
 const { isAuthenticated } = useAuth();
 const [branding, setBranding] = useState<BrandingSettings>(EMPTY_BRANDING);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [tick, setTick] = useState(0);

 const refresh = () => setTick((t) => t + 1);

 useEffect(() => {
 let active = true;
 setLoading(true);
 brandingApi
 .get()
 .then((data) => {
 if (!active) return;
 setBranding(data);
 setError(null);
 })
 .catch((err) => {
 if (active) setError(err instanceof Error ? err.message : "Couldn't load branding.");
 })
 .finally(() => {
 if (active) setLoading(false);
 });
 return () => {
 active = false;
 };
 // Re-fetch whenever auth state flips (branding is public-ish, but the
 // real backend may 404 pre-login) or a settings page calls refresh().
 }, [isAuthenticated, tick]);

 useEffect(() => {
 applyFavicon(branding.faviconUrl);
 if (branding.companyName) {
 document.title = `${branding.companyName} — HR Management`;
 }
 }, [branding.faviconUrl, branding.companyName]);

 // Push the primary colour into the CSS custom properties every `bg-brand`,
 // `text-brand-dark` and `focus:ring-brand/60` utility in the app resolves
 // against. Doing it here rather than in the Branding page is what makes the
 // colour global: saving on Settings updates `branding`, this effect re-runs,
 // and the whole tree re-themes without a reload or a single component change.
 useEffect(() => {
 applyPrimaryColor(branding.primaryColor);
 }, [branding.primaryColor]);

 const updateBranding = async (payload: BrandingSettings) => {
 const saved = await brandingApi.update(payload);
 setBranding(saved);
 return saved;
 };

 const value = useMemo<BrandingContextValue>(
 () => ({ branding, loading, error, refresh, updateBranding }),
 [branding, loading, error],
 );

 return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
 const ctx = useContext(BrandingContext);
 if (!ctx) throw new Error("useBranding must be used within BrandingProvider");
 return ctx;
}
