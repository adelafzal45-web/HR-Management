// ============================================================================
// /profile/edit — self-service profile editing (spec sections 3, 9).
//
// The form covers exactly the fields in Backend/src/users/dto/update-own-profile.dto.ts
// and nothing else. HR-controlled data (department, salary, role, shift, employee
// code, joining date, designation, permissions, team lead, employment type) is
// shown read-only for reference: the backend discards those keys even if sent, so
// rendering them as inputs would offer an edit that silently does nothing.
//
// `email` is special — the backend applies it only when the caller holds
// `employees.profile.email.edit`, so the field is disabled without that permission
// and omitted from the payload when unchanged.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2, Lock } from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError, API_BASE_URL } from "@/lib/apiClient";

import PhotoUpload from "@/modules/employees/components/PhotoUpload";
import { myProfileService } from "@/modules/employees/api/employeeService";
import {
  fullName,
  photoUrl,
  type Employee,
  type UpdateOwnProfilePayload,
} from "@/modules/employees/types/employee.types";

/** Mirrors PHONE_REGEX in Backend/src/users/dto/validation.constants.ts. */
const PHONE_REGEX = /^\+?[\d][\d\s().-]{5,25}$/;
const PHONE_MESSAGE = "Enter a valid phone number (7–20 digits, optional leading +).";

/** Mirrors POSTAL_CODE_REGEX in the same file. */
const POSTAL_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s-]{1,18}$/;
const POSTAL_CODE_MESSAGE =
  "Enter a valid postal code (2–20 letters, digits, spaces or hyphens).";

/** The self-editable text fields, in form order. */
type FormState = {
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
};

const EMPTY_FORM: FormState = {
  email: "",
  phone: "",
  street_address: "",
  city: "",
  state_province: "",
  postal_code: "",
  country: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
};

const toForm = (employee: Employee): FormState => ({
  email: employee.email ?? "",
  phone: employee.phone ?? "",
  street_address: employee.street_address ?? "",
  city: employee.city ?? "",
  state_province: employee.state_province ?? "",
  postal_code: employee.postal_code ?? "",
  country: employee.country ?? "",
  emergency_contact_name: employee.emergency_contact_name ?? "",
  emergency_contact_relationship: employee.emergency_contact_relationship ?? "",
  emergency_contact_phone: employee.emergency_contact_phone ?? "",
});

/** Labelled text input. Local to this page so the read-only variant can share it. */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {label}
        {disabled && <Lock size={12} className="text-gray-400" />}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 ${
          error
            ? "border-rose-300 bg-rose-50/40 focus:ring-rose-300/60"
            : "border-gray-200 bg-white focus:ring-brand/60"
        } disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500`}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-rose-600">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>
      )}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ProfileEdit() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { hasPermission, updateUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const canEditEmail = hasPermission("employees.profile.email.edit");

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initial, setInitial] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const profile = await myProfileService.get();
      setEmployee(profile);
      setForm(toForm(profile));
      setInitial(toForm(profile));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = useCallback((key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear the field's error as soon as it is touched: keeping a stale message
    // under a field the user is actively fixing reads as unresponsive.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const dirty = useMemo(
    () => (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== initial[k]),
    [form, initial],
  );

  /** Client-side mirror of the DTO's validators — the server re-checks all of it. */
  const validate = useCallback((): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (form.phone.trim() && !PHONE_REGEX.test(form.phone.trim())) {
      next.phone = PHONE_MESSAGE;
    }
    if (form.postal_code.trim() && !POSTAL_CODE_REGEX.test(form.postal_code.trim())) {
      next.postal_code = POSTAL_CODE_MESSAGE;
    }
    if (
      form.emergency_contact_phone.trim() &&
      !PHONE_REGEX.test(form.emergency_contact_phone.trim())
    ) {
      next.emergency_contact_phone = PHONE_MESSAGE;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  /**
   * Sends only what changed.
   *
   * Two reasons: an unchanged email would otherwise be rejected as an
   * unauthorised email change for a user without `employees.profile.email.edit`,
   * and a diffed body keeps the audit log's before/after meaningful.
   */
  const buildPayload = useCallback((): UpdateOwnProfilePayload => {
    // Accumulated as a string map and cast once: every FormState key is a
    // string-valued field of UpdateOwnProfilePayload, but a keyed write through
    // the union of those keys is not something TypeScript can narrow per key.
    const diff: Record<string, string> = {};
    for (const key of Object.keys(form) as (keyof FormState)[]) {
      const value = form[key].trim();
      if (value === (initial[key] ?? "").trim()) continue;
      if (key === "email" && !canEditEmail) continue;
      diff[key] = value;
    }
    return diff as UpdateOwnProfilePayload;
  }, [form, initial, canEditEmail]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) {
      showError("Please fix the highlighted fields.");
      return;
    }

    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      showSuccess("Nothing to save.", "No changes were made.");
      return;
    }

    setSaving(true);
    try {
      const updated = await myProfileService.update(payload);
      setEmployee(updated);
      setForm(toForm(updated));
      setInitial(toForm(updated));
      // Keep the navbar in step: it reads name/email/avatar from AuthContext,
      // which would otherwise show the pre-edit values until the next login.
      updateUser({
        email: updated.email,
        phone: updated.phone,
        avatarUrl: photoUrl(updated.profile_image, API_BASE_URL),
        avatarThumbUrl: photoUrl(updated.profile_image_thumb, API_BASE_URL),
      });
      showSuccess("Profile updated.");
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : "Couldn't update your profile.",
        "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  /** Photo routes write immediately, so refresh from the response they return. */
  const handlePhotoUploaded = useCallback(async () => {
    try {
      const refreshed = await myProfileService.get();
      setEmployee(refreshed);
      updateUser({
        avatarUrl: photoUrl(refreshed.profile_image, API_BASE_URL),
        avatarThumbUrl: photoUrl(refreshed.profile_image_thumb, API_BASE_URL),
      });
    } catch {
      // The upload itself already succeeded; a failed refresh only means the
      // navbar avatar lags until the next navigation, which is not worth an error.
    }
  }, [updateUser]);

  return (
    <DashboardLayout title="Edit Profile" activeKey="profile">
      <LoadingOverlay show={saving} label="Saving your changes…" />

      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4">
          <BackButton fallback="/profile" label="Back to Profile" />
        </div>

        <BackendStatusBanner status={status} />

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white p-10 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
            <Loader2 size={16} className="animate-spin" />
            Loading your profile…
          </div>
        ) : loadError || !employee ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
          >
            {loadError ?? "Couldn't load your profile."}{" "}
            <button
              type="button"
              onClick={() => void load()}
              className="font-semibold underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ---- Photo ---- */}
            <Card title="Profile Photo">
              <PhotoUpload
                self
                currentUrl={photoUrl(employee.profile_image, API_BASE_URL)}
                onUploaded={() => void handlePhotoUploaded()}
                size={128}
              />
            </Card>

            {/* ---- Contact ---- */}
            <Card title="Contact">
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(v) => set("email", v)}
                  disabled={!canEditEmail}
                  error={errors.email}
                  hint={
                    canEditEmail
                      ? undefined
                      : "Your HR team manages this address."
                  }
                />
                <Field
                  label="Phone"
                  type="tel"
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  placeholder="e.g. +92 300 1234567"
                  error={errors.phone}
                />
              </div>
            </Card>

            {/* ---- Address ---- */}
            <Card title="Address">
              <Field
                label="Street Address"
                value={form.street_address}
                onChange={(v) => set("street_address", v)}
                error={errors.street_address}
              />
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field
                  label="City"
                  value={form.city}
                  onChange={(v) => set("city", v)}
                  error={errors.city}
                />
                <Field
                  label="State / Province"
                  value={form.state_province}
                  onChange={(v) => set("state_province", v)}
                  error={errors.state_province}
                />
                <Field
                  label="Postal Code"
                  value={form.postal_code}
                  onChange={(v) => set("postal_code", v)}
                  error={errors.postal_code}
                />
                <Field
                  label="Country"
                  value={form.country}
                  onChange={(v) => set("country", v)}
                  error={errors.country}
                />
              </div>
            </Card>

            {/* ---- Emergency contact ---- */}
            <Card title="Emergency Contact">
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field
                  label="Name"
                  value={form.emergency_contact_name}
                  onChange={(v) => set("emergency_contact_name", v)}
                  error={errors.emergency_contact_name}
                />
                <Field
                  label="Relationship"
                  value={form.emergency_contact_relationship}
                  onChange={(v) => set("emergency_contact_relationship", v)}
                  placeholder="e.g. Spouse"
                  error={errors.emergency_contact_relationship}
                />
                <Field
                  label="Phone"
                  type="tel"
                  value={form.emergency_contact_phone}
                  onChange={(v) => set("emergency_contact_phone", v)}
                  error={errors.emergency_contact_phone}
                />
              </div>
            </Card>

            {/* ---- HR-controlled, read-only ---- */}
            <Card title="Employment (managed by HR)">
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field label="Employee Code" value={employee.employee_code} disabled />
                <Field label="Full Name" value={fullName(employee)} disabled />
                <Field
                  label="Department"
                  value={employee.department?.department_name ?? "—"}
                  disabled
                />
                <Field
                  label="Designation"
                  value={employee.designation?.title ?? "—"}
                  disabled
                />
                <Field label="Employment Type" value={employee.employee_type ?? "—"} disabled />
                <Field label="Shift" value={employee.shift?.shift_name ?? "—"} disabled />
                <Field label="Joining Date" value={employee.joining_date ?? "—"} disabled />
                <Field label="Role" value={employee.role?.role_name ?? "—"} disabled />
              </div>
              <p className="text-xs text-gray-400">
                These fields can only be changed by HR. Contact your HR team if something
                needs updating.
              </p>
            </Card>

            {/* ---- Actions ---- */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => navigate("/change-password")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <KeyRound size={15} />
                Change Password
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/profile")}
                  className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-6 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
