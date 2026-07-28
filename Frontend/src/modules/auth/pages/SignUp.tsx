import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "@/app/layouts/AuthLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { authApi } from "@/api/client";

export default function SignUp() {
  const status = useBackendStatus();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agreed) {
      setError("Please agree to the Terms and Conditions to continue.");
      return;
    }

    setLoading(true);
    try {
      await authApi.signUp({ firstName, lastName, email, password });
      navigate("/signup-success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout heading={"Welcome"}>
      <LoadingOverlay show={loading} label="Creating your account…" />
      <h2 className="mb-1 text-[26px] xs:text-[28px] sm:text-[32px] font-bold text-gray-900">Create account</h2>
      <p className="mb-8 text-[15px] text-gray-500">
        Already a member?{" "}
        <Link to="/login" className="font-medium text-brand-dark">
          Login here!
        </Link>
      </p>

      <BackendStatusBanner status={status} />

      <form onSubmit={handleSubmit}>
        <FormField
          label="First Name"
          placeholder="Type your first name here"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <FormField
          label="Last Name"
          placeholder="Type your last name here"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
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
          Sign Up
        </PrimaryButton>
      </form>
    </AuthLayout>
  );
}
