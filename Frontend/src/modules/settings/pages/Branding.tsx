import { useEffect, useState, type FormEvent } from "react";
import { Image as ImageIcon } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useBranding } from "@/app/providers/BrandingContext";
import type { BrandingSettings } from "@/modules/settings/api/settingsApi";

export default function BrandingPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { branding, loading, updateBranding } = useBranding();

  const [form, setForm] = useState<BrandingSettings>(branding);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  // Keep the form in sync once branding finishes loading (or is refetched).
  useEffect(() => {
    setForm(branding);
  }, [branding]);

  const handleChange = (field: keyof BrandingSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Live update: applied immediately (sidebar logo + browser favicon)
      // as soon as the save succeeds, no reload needed.
      await updateBranding(form);
      toast.showSuccess("Branding updated — logo and favicon applied.");
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
              <FormField
                label="Company Logo URL"
                type="url"
                placeholder="https://…/logo.png"
                value={form.logoUrl}
                onChange={(e) => {
                  setLogoError(false);
                  handleChange("logoUrl")(e);
                }}
              />
              <FormField
                label="Company Favicon URL"
                type="url"
                placeholder="https://…/favicon.svg"
                value={form.faviconUrl}
                onChange={(e) => {
                  setFaviconError(false);
                  handleChange("faviconUrl")(e);
                }}
              />
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <FormField label="Company Email" type="email" value={form.email} onChange={handleChange("email")} />
                <FormField label="Company Phone" value={form.phone} onChange={handleChange("phone")} />
              </div>
              <FormField label="Company Address" value={form.address} onChange={handleChange("address")} />
              <FormField label="Website" type="url" placeholder="https://…" value={form.website} onChange={handleChange("website")} />

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
        </div>
      </div>
    </SettingsLayout>
  );
}
