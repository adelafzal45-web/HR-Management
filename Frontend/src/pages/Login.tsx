import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import LoadingOverlay from "../components/LoadingOverlay";
import { FormField, PrimaryButton } from "../components/FormField";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { authApi } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { DEV_LOGIN_ACCOUNTS } from "../lib/devBypass";

export default function Login() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    setLoading(true);
    try {
      const result = await authApi.login(email, password);
      login({ token: result.token, user: result.user });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout heading={"Good\nto see you"}>
      <LoadingOverlay show={loading} label="Signing you in…" />
      <h2 className="mb-1 text-[26px] xs:text-[28px] sm:text-[32px] font-bold text-gray-900">Login</h2>
      <p className="mb-8 text-[15px] text-gray-500">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-brand-dark">
          Register Now!
        </Link>
      </p>

      <BackendStatusBanner status={status} />

      {import.meta.env.DEV && (
        <div className="mb-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-amber-700">
            Dev only — skip login while the real backend is in progress
          </p>
          <div className="flex flex-wrap gap-2">
            {DEV_LOGIN_ACCOUNTS.map((account) => (
              <button
                key={account.label}
                type="button"
                onClick={() => {
                  login(account.session);
                  navigate("/dashboard");
                }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <FormField
          label="Email"
          type="email"
          placeholder="Type your email here"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          label="Password"
          type="password"
          placeholder="Type your password here"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand"
            />
            Remember
          </label>
          <Link to="/forget-password" className="text-sm font-medium text-brand-dark">
            Forgot Password
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <PrimaryButton type="submit" loading={loading}>
          Login
        </PrimaryButton>
      </form>
    </AuthLayout>
  );
}
