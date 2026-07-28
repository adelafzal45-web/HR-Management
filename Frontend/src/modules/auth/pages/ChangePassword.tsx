import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { authApi } from "@/api/client";

// UC-3 (Change Password) — used inside the authenticated app, reached from
// the Edit Profile page. Rendered inside DashboardLayout (sidebar + header)
// so it stays visually consistent with the rest of the signed-in app instead
// of dropping into the marketing-style auth screens.
//
// Tries the real backend first (POST /auth/change-password); if the backend
// is unreachable it transparently falls back to demo mode so the flow can
// still be clicked through end-to-end (see authApi.changePassword in lib/api.ts).
export default function ChangePassword() {
  const status = useBackendStatus();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Current password is incorrect.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Change Password" activeKey="profile">
      <LoadingOverlay show={loading} label="Updating your password…" />
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={() => navigate("/edit-profile")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={15} />
          Back to Profile
        </button>

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
              placeholder="Type your current password here"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <FormField
              label="New Password"
              type="password"
              placeholder="Type your new password here"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <FormField
              label="Confirm New Password"
              type="password"
              placeholder="Type your new password again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
            {success && (
              <p className="mb-4 text-sm text-green-600">Password updated successfully.</p>
            )}

            <PrimaryButton type="submit" loading={loading}>
              Update Password
            </PrimaryButton>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
