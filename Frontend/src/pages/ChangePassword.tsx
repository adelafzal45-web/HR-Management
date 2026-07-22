import { useState, type FormEvent } from "react";
import AuthLayout from "../components/AuthLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import { FormField, PrimaryButton } from "../components/FormField";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { apiRequest, BackendUnavailableError } from "../lib/api";

// UC-3 (Change Password) — used inside the authenticated app, e.g. from the profile page.
export default function ChangePassword() {
  const status = useBackendStatus();

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
    if (status === "offline") {
      setError("Backend isn't connected — demo mode doesn't support changing a password yet.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword, confirmPassword },
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        setError("Backend is not connected. Please try again once the API is running.");
      } else {
        setError(err instanceof Error ? err.message : "Current password is incorrect.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout heading={"Stay\nsecure"}>
      <h2 className="mb-1 text-[32px] font-bold text-gray-900">Change Password</h2>
      <p className="mb-8 text-[15px] text-gray-500">Update the password on your account.</p>

      <BackendStatusBanner status={status} />

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
          label="Conform New Password"
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
    </AuthLayout>
  );
}
