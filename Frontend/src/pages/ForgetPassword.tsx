import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import { FormField, PrimaryButton } from "../components/FormField";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { authApi } from "../lib/api";

export default function ForgetPassword() {
  const status = useBackendStatus();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    setLoading(true);
    try {
      await authApi.forgetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout heading={"Good\nto see you"}>
      <h2 className="mb-1 text-[32px] font-bold text-gray-900">Forget Password?</h2>
      <p className="mb-8 text-[15px] text-gray-500">
        Enter the link below to receive a password reset link.
      </p>

      <BackendStatusBanner status={status} />

      {sent ? (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          If an account exists for {email}, a reset link has been sent.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <FormField
            label="Your Email"
            type="email"
            placeholder="Type your email here"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

          <div className="mb-6">
            <PrimaryButton type="submit" loading={loading}>
              Reset password
            </PrimaryButton>
          </div>
        </form>
      )}

      <p className="text-[15px] text-gray-500">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-brand-dark">
          Register Now!
        </Link>
      </p>
    </AuthLayout>
  );
}
