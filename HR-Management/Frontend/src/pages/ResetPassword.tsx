import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import LoadingOverlay from "../components/LoadingOverlay";
import { FormField, PrimaryButton } from "../components/FormField";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { authApi } from "../lib/api";

export default function ResetPassword() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the Terms and Conditions to continue.");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password, confirmPassword);
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout heading={"Good\nto see you"}>
      <LoadingOverlay show={loading} label="Resetting your password…" />
      <h2 className="mb-1 text-[26px] xs:text-[28px] sm:text-[32px] font-bold text-gray-900">Reset Password</h2>
      <p className="mb-8 text-[15px] text-gray-500">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-brand-dark">
          Register Now!
        </Link>
      </p>

      <BackendStatusBanner status={status} />

      <form onSubmit={handleSubmit}>
        <FormField
          label="Password"
          type="password"
          placeholder="Type your password here"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <FormField
          label="Confirm Password"
          type="password"
          placeholder="Type your password again"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <label className="mb-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand"
          />
          I agree to all{" "}
          <a href="#" className="font-medium text-brand-dark">
            Terms and Conditions
          </a>
        </label>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <PrimaryButton type="submit" loading={loading}>
          Reset
        </PrimaryButton>
      </form>
    </AuthLayout>
  );
}
