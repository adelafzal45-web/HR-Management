import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import LoadingOverlay from "../components/LoadingOverlay";
import { FormField, PrimaryButton } from "../components/FormField";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { useAuth } from "../lib/AuthContext";
import { profileApi } from "../lib/api";

// Edit Profile — used inside the authenticated app.
// On mount, fetches the current profile: tries GET /profile/me on the real
// backend first, and transparently falls back to the signed-in demo user's
// hardcoded data if the backend can't be reached (see profileApi in lib/api.ts).
// Saving follows the same real-backend-first / demo-fallback pattern, and
// syncs the result back into AuthContext so the header updates immediately.
export default function EditProfile() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");

  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await profileApi.getProfile();
        if (!active) return;
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setEmail(profile.email);
        setPhone(profile.phone ?? "");
        setJobTitle(profile.jobTitle ?? "");
      } catch {
        // Keep whatever we already have from AuthContext (e.g. from login) if the fetch fails.
      } finally {
        if (active) setInitialLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const updated = await profileApi.updateProfile({ firstName, lastName, phone, jobTitle });
      updateUser(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const initials = ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "A";

  return (
    <DashboardLayout title="Edit Profile" activeKey="profile">
      <LoadingOverlay show={loading} label="Saving your changes…" />
      <div className="mx-auto w-full max-w-2xl">
        <BackendStatusBanner status={status} />

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 xs:p-8">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-light text-xl font-semibold text-brand-dark">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {firstName || lastName ? `${firstName} ${lastName}`.trim() : "Your profile"}
              </h2>
              <p className="text-sm text-gray-500">{jobTitle || "Update your account details"}</p>
            </div>
          </div>

          {initialLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Loading profile…
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <FormField
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <FormField
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <FormField
                label="Email"
                type="email"
                value={email}
                disabled
                title="Email can't be changed here"
              />

              <div className="grid gap-x-4 sm:grid-cols-2">
                <FormField
                  label="Phone Number"
                  type="tel"
                  placeholder="e.g. +92 300 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <FormField
                  label="Job Title"
                  placeholder="e.g. HR Manager"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
              {success && (
                <p className="mb-4 text-sm text-green-600">Profile updated successfully.</p>
              )}

              <PrimaryButton type="submit" loading={loading}>
                Save Changes
              </PrimaryButton>

              <button
                type="button"
                onClick={() => navigate("/change-password")}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <KeyRound size={16} />
                Change Password
              </button>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
