import { useEffect, useState, type FormEvent } from "react";
import SettingsLayout from "./SettingsLayout";
import { FormField, PrimaryButton } from "../../components/FormField";
import BackendStatusBanner from "../../components/BackendStatusBanner";
import { useBackendStatus } from "../../hooks/useBackendStatus";
import { useToast } from "../../lib/ToastContext";
import { companyDetailsApi, type CompanyDetails } from "../../lib/settingsApi";

const EMPTY: CompanyDetails = { legalName: "", registrationNumber: "", industry: "", timezone: "", currency: "" };

export default function CompanyDetailsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [form, setForm] = useState<CompanyDetails>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    companyDetailsApi
      .get()
      .then((data) => active && setForm(data))
      .catch(() => active && toast.showError("Couldn't load company details."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.legalName.trim()) {
      setError("Legal company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await companyDetailsApi.update(form);
      setForm(saved);
      toast.showSuccess("Company details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save company details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout activeTab="/settings/company">
      <BackendStatusBanner status={status} />

      <div className="max-w-2xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-7">
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField
                label="Legal Company Name"
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                required
              />
              <FormField
                label="Registration Number"
                value={form.registrationNumber}
                onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
              />
              <FormField label="Industry" value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
              <label className="mb-5 block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Timezone</span>
                <input
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  placeholder="e.g. Asia/Karachi"
                  className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="mb-5 block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Currency</span>
                <input
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  placeholder="e.g. PKR"
                  className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
                />
              </label>
            </div>

            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

            <div className="max-w-xs">
              <PrimaryButton type="submit" loading={saving}>
                Save Changes
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </SettingsLayout>
  );
}
