import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Image as ImageIcon } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import ImageUploadField from "@/modules/settings/components/ImageUploadField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useBranding } from "@/app/providers/BrandingContext";
import type { BrandingSettings } from "@/modules/settings/api/settingsApi";
import { DEFAULT_PRIMARY_COLOR, derivePalette, parseHexColor } from "@/lib/theme";

const hex = ({ r, g, b }: { r: number; g: number; b: number }) =>
 `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

export default function BrandingPage() {
 const status = useBackendStatus();
 const toast = useToast();
 const { branding, loading, updateBranding } = useBranding();

 const [form, setForm] = useState<BrandingSettings>(branding);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [logoError, setLogoError] = useState(false);
 const [logoCollapsedError, setLogoCollapsedError] = useState(false);
 const [faviconError, setFaviconError] = useState(false);

 // Preview only. The real theme is applied by BrandingContext once the save
 // succeeds — previewing by writing the CSS variables on every keystroke would
 // repaint the whole app mid-edit, and leave it wrongly themed if you cancel.
 const preview = useMemo(() => {
 const parsed = parseHexColor(form.primaryColor || "");
 return parsed ? derivePalette(parsed) : null;
 }, [form.primaryColor]);

 // Keep the form in sync once branding finishes loading (or is refetched).
 useEffect(() => {
 setForm(branding);
 }, [branding]);

 const handleChange = (field: keyof BrandingSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
 setForm((f) => ({ ...f, [field]: e.target.value }));

 /**
  * Set an image field from the upload control.
  *
  * The upload itself already stored the file and pointed the settings row at
  * it, so this only keeps the form and its preview in step. Clearing a field
  * here is not applied until Save — that is what makes "remove" undoable by
  * navigating away.
  */
 const setImage = (field: keyof BrandingSettings) => (url: string) => {
 setForm((f) => ({ ...f, [field]: url }));
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!form.companyName.trim()) {
 setError("Company name is required.");
 return;
 }
 if (!parseHexColor(form.primaryColor || "")) {
 setError("Primary colour must be a hex value like #F1B344.");
 return;
 }
 setSaving(true);
 setError(null);
 try {
 // Live update: applied immediately (sidebar logo, browser favicon and the
 // brand colour across every screen) as soon as the save succeeds.
 await updateBranding(form);
 toast.showSuccess("Branding updated — logo, favicon and theme applied.");
 } catch (err) {
 setError(err instanceof Error ? err.message : "Couldn't save branding.");
 } finally {
 setSaving(false);
 }
 };

 return (
 <SettingsLayout activeTab="/settings/branding">
 <BackendStatusBanner status={status} />

 <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-7">
 {loading ? (
 <div className="space-y-4">
 {[...Array(6)].map((_, i) => (
 <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : (
 <form onSubmit={handleSubmit}>
 <FormField label="Company Name" value={form.companyName} onChange={handleChange("companyName")} required />
 <ImageUploadField
 label="Company Logo"
 kind="logo"
 value={form.logoUrl}
 onChange={(url) => {
 setLogoError(false);
 setImage("logoUrl")(url);
 }}
 hint="Shown in the sidebar, on payslips and on certificates"
 />
 <ImageUploadField
 label="Collapsed Sidebar Logo"
 kind="logo-collapsed"
 value={form.logoCollapsedUrl}
 onChange={(url) => {
 setLogoCollapsedError(false);
 setImage("logoCollapsedUrl")(url);
 }}
 hint="Square mark for the collapsed sidebar; falls back to the main logo"
 previewHeight={64}
 />
 <ImageUploadField
 label="Company Favicon"
 kind="favicon"
 value={form.faviconUrl}
 onChange={(url) => {
 setFaviconError(false);
 setImage("faviconUrl")(url);
 }}
 hint="Browser tab icon"
 previewHeight={64}
 />
 <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
 <FormField label="Company Email" type="email" value={form.email} onChange={handleChange("email")} />
 <FormField label="Company Phone" value={form.phone} onChange={handleChange("phone")} />
 </div>
 <FormField label="Company Address" value={form.address} onChange={handleChange("address")} />
 <FormField label="Website" type="url" placeholder="https://…" value={form.website} onChange={handleChange("website")} />

 <div className="mb-5">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Primary Colour</span>
 <div className="flex items-center gap-3">
 {/* Native picker and a text field over the same value: the picker for
 browsing, the text field so an exact brand hex can be pasted. */}
 <input
 type="color"
 aria-label="Pick primary colour"
 value={parseHexColor(form.primaryColor || "") ? form.primaryColor : DEFAULT_PRIMARY_COLOR}
 onChange={handleChange("primaryColor")}
 className="h-12 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
 />
 <input
 value={form.primaryColor}
 onChange={handleChange("primaryColor")}
 placeholder={DEFAULT_PRIMARY_COLOR}
 spellCheck={false}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 font-mono text-sm uppercase text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 <button
 type="button"
 onClick={() => setForm((f) => ({ ...f, primaryColor: DEFAULT_PRIMARY_COLOR }))}
 className="shrink-0 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
 >
 Reset
 </button>
 </div>
 <p className="mt-2 text-xs text-gray-500">
 Applied across the entire app — buttons, links, active navigation and highlights. The hover and tint
 shades are derived automatically.
 </p>
 </div>

 {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

 <div className="max-w-xs">
 <PrimaryButton type="submit" loading={saving}>
 Save Branding
 </PrimaryButton>
 </div>
 </form>
 )}
 </div>

 {/* Live preview — reflects exactly what the sidebar/browser tab will show */}
 <div className="space-y-4">
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Sidebar Logo Preview</p>
 <div className="flex h-20 items-center justify-center rounded-xl bg-gray-50">
 {form.logoUrl && !logoError ? (
 <img
 src={form.logoUrl}
 alt="Logo preview"
 className="max-h-16 max-w-[85%] object-contain"
 onError={() => setLogoError(true)}
 />
 ) : (
 <span className="flex items-center gap-2 text-xs text-gray-400">
 <ImageIcon size={16} /> {logoError ? "Couldn't load that URL" : "No logo set"}
 </span>
 )}
 </div>
 </div>
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Collapsed Logo Preview</p>
 <div className="flex h-20 items-center justify-center rounded-xl bg-gray-50">
 {form.logoCollapsedUrl && !logoCollapsedError ? (
 <img
 src={form.logoCollapsedUrl}
 alt="Collapsed logo preview"
 className="h-12 w-12 object-contain"
 onError={() => setLogoCollapsedError(true)}
 />
 ) : (
 <span className="flex items-center gap-2 text-xs text-gray-400">
 <ImageIcon size={16} /> {logoCollapsedError ? "Couldn't load that URL" : "Falls back to main logo"}
 </span>
 )}
 </div>
 </div>
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Favicon Preview</p>
 <div className="flex h-20 items-center justify-center rounded-xl bg-gray-50">
 {form.faviconUrl && !faviconError ? (
 <img
 src={form.faviconUrl}
 alt="Favicon preview"
 className="h-8 w-8 object-contain"
 onError={() => setFaviconError(true)}
 />
 ) : (
 <span className="flex items-center gap-2 text-xs text-gray-400">
 <ImageIcon size={16} /> {faviconError ? "Couldn't load that URL" : "No favicon set"}
 </span>
 )}
 </div>
 </div>
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Colour Palette Preview</p>
 {preview ? (
 <div className="space-y-2.5">
 <div className="flex items-center gap-2.5">
 <div className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-gray-200" style={{ backgroundColor: hex(preview.brand) }} />
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-gray-900">Brand</p>
 <p className="font-mono text-[11px] text-gray-500">{hex(preview.brand)}</p>
 </div>
 </div>
 <div className="flex items-center gap-2.5">
 <div className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-gray-200" style={{ backgroundColor: hex(preview.brandDark) }} />
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-gray-900">Hover</p>
 <p className="font-mono text-[11px] text-gray-500">{hex(preview.brandDark)}</p>
 </div>
 </div>
 <div className="flex items-center gap-2.5">
 <div className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-gray-200" style={{ backgroundColor: hex(preview.brandLight) }} />
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-gray-900">Tint</p>
 <p className="font-mono text-[11px] text-gray-500">{hex(preview.brandLight)}</p>
 </div>
 </div>
 <div className="flex items-center gap-2.5">
 <div className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-gray-200" style={{ backgroundColor: hex(preview.brandContrast) }} />
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium text-gray-900">Contrast</p>
 <p className="font-mono text-[11px] text-gray-500">{hex(preview.brandContrast)}</p>
 </div>
 </div>
 </div>
 ) : (
 <p className="text-xs text-gray-500">Enter a valid hex colour to preview the derived palette.</p>
 )}
 </div>
 </div>
 </div>
 </SettingsLayout>
 );
}
