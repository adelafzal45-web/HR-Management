// ============================================================================
// Certificate signatures — who signs an employment or experience certificate.
//
// Two independent signatories (CEO, Co-Founder), each a name plus an uploaded
// signature image. Everything here is optional, and that is load-bearing rather
// than lax: a certificate with neither configured still generates, printing the
// generic "Authorised Signatory" block it printed before this screen existed.
// So the empty state is a supported configuration, not a setup step to finish.
//
// Certificates only. Payslips and ID cards do not carry a signature.
// ============================================================================

import { useEffect, useState, type FormEvent } from "react";
import { Info, PenLine } from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import ImageUploadField from "@/modules/settings/components/ImageUploadField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import {
  signatoriesApi,
  type CertificateSignatories,
} from "@/modules/settings/api/settingsApi";

const EMPTY: CertificateSignatories = {
  ceoName: "",
  ceoSignatureUrl: "",
  cofounderName: "",
  cofounderSignatureUrl: "",
};

export default function CertificateSignaturesPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [form, setForm] = useState<CertificateSignatories>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    signatoriesApi
      .get()
      .then((loaded) => {
        if (active) setForm(loaded);
      })
      .catch(() => {
        if (active) setError("Couldn't load the current signatories.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const set =
    (field: keyof CertificateSignatories) =>
    (value: string) =>
      setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await signatoriesApi.update(form);
      setForm(saved);
      toast.showSuccess("Certificate signatories saved.");
    } catch (saveError) {
      const message =
        saveError instanceof ApiError
          ? saveError.message
          : "Couldn't save the signatories. Please try again.";
      setError(message);
      toast.showError(message);
    } finally {
      setSaving(false);
    }
  };

  const configured = [form.ceoName, form.cofounderName].filter((n) => n.trim()).length;

  return (
    <SettingsLayout activeTab="/settings/certificate-signatures">
      <BackendStatusBanner status={status} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6"
      >
        <div className="mb-1 flex items-center gap-2">
          <PenLine size={18} className="text-brand" />
          <h2 className="text-lg font-semibold text-gray-900">Certificate Signatures</h2>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          Printed at the foot of employment and experience certificates. Both signatories are
          optional — leave them blank and certificates sign off as “Authorised Signatory”.
        </p>

        {/* Says out loud what the layout does, so nobody has to generate a
            certificate to discover that filling in one name is a valid choice. */}
        <div className="mb-6 flex gap-2.5 rounded-xl bg-blue-50 p-3.5 text-sm text-blue-800 ring-1 ring-blue-100">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            {configured === 2
              ? "Both signatories will print, side by side."
              : configured === 1
                ? "One signatory is set — it will print as a single block on the right."
                : "No signatories set. Certificates will print the generic “Authorised Signatory” block."}{" "}
            A transparent PNG reproduces best.
          </p>
        </div>

        {loading ? (
          <p className="py-6 text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <fieldset className="mb-6 rounded-xl border border-gray-100 p-4">
              <legend className="px-1.5 text-sm font-semibold text-gray-700">CEO</legend>
              <FormField
                label="CEO Name"
                placeholder="e.g. Ayesha Malik"
                value={form.ceoName}
                onChange={(e) => set("ceoName")(e.target.value)}
              />
              <ImageUploadField
                label="CEO Signature"
                kind="ceo-signature"
                value={form.ceoSignatureUrl}
                onChange={set("ceoSignatureUrl")}
                hint="Transparent PNG works best"
                previewHeight={64}
              />
            </fieldset>

            <fieldset className="mb-6 rounded-xl border border-gray-100 p-4">
              <legend className="px-1.5 text-sm font-semibold text-gray-700">Co-Founder</legend>
              <FormField
                label="Co-Founder Name"
                placeholder="e.g. Bilal Ahmed"
                value={form.cofounderName}
                onChange={(e) => set("cofounderName")(e.target.value)}
              />
              <ImageUploadField
                label="Co-Founder Signature"
                kind="cofounder-signature"
                value={form.cofounderSignatureUrl}
                onChange={set("cofounderSignatureUrl")}
                hint="Transparent PNG works best"
                previewHeight={64}
              />
            </fieldset>

            {error && (
              <p role="alert" className="mb-4 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <div className="flex justify-end">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Signatories"}
              </PrimaryButton>
            </div>
          </>
        )}
      </form>
    </SettingsLayout>
  );
}
