// ============================================================================
// Change Password (UC-3) — the authenticated self-service password change.
//
// Posts to POST /users/me/change-password with **snake_case** keys. This
// previously called `authApi.changePassword` from @/api/client, which was wrong
// twice over: the route `/auth/change-password` did not exist, and the body was
// camelCase, which the global ValidationPipe (`whitelist: true`) strips rather
// than rejects. Because that client wraps every call in `withDemoFallback`, an
// unreachable route fell through to the mock store and the page reported
// success — the user believed their password had changed when nothing had.
// A failed password change must surface as an error, so there is no fallback
// here: `myProfileService` talks to the real API or throws.
// ============================================================================

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import { myProfileService } from "@/modules/employees/api/employeeService";

/**
 * Mirrors PASSWORD_REGEX in Backend/src/users/dto/validation.constants.ts.
 *
 * Checked here only to fail fast with a readable message; the backend enforces
 * the same rule plus the reuse-history check, which the client cannot do.
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_MESSAGE =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

export default function ChangePassword() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from your current one.");
      return;
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      setError(PASSWORD_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      await myProfileService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showSuccess("Password updated.", "Use your new password next time you sign in.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't update your password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Change Password" activeKey="profile">
      <LoadingOverlay show={loading} label="Updating your password…" />

      <div className="mx-auto w-full max-w-lg">
        <div className="mb-4">
          <BackButton fallback="/profile" label="Back to Profile" />
        </div>

        <BackendStatusBanner status={status} />

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 xs:p-8">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
              <KeyRound size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Change Password</h2>
              <p className="text-sm text-gray-500">Update the password on your account.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <FormField
              label="Current Password"
              type="password"
              autoComplete="current-password"
              placeholder="Type your current password here"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <FormField
              label="New Password"
              type="password"
              autoComplete="new-password"
              placeholder="Type your new password here"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <FormField
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              placeholder="Type your new password again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <p className="mb-4 text-xs text-gray-400">{PASSWORD_MESSAGE}</p>

            {error && (
              <p role="alert" className="mb-4 text-sm text-red-500">
                {error}
              </p>
            )}
            {success && (
              <p className="mb-4 text-sm text-green-600">Password updated successfully.</p>
            )}

            <PrimaryButton type="submit" loading={loading}>
              Update Password
            </PrimaryButton>

            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Back to Profile
            </button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
