// ============================================================================
// Reset Password — consumes a one-time link token and sets a new password.
//
// Three fixes over the previous version:
//
//  1. It posts to POST /auth/reset-password with the real snake_case body
//     `{ token, new_password }`. The old code called `authApi.resetPassword`
//     from @/api/client, which sent a camelCase body — silently stripped by
//     the global ValidationPipe (`whitelist: true`) — and, on failure, fell
//     through `withDemoFallback` to the mock store and navigated to /login as
//     though the password had changed. It had not.
//
//  2. The token is validated on mount. An expired, used, or superseded link
//     now says so before the form is drawn, instead of after the user has
//     typed a new password twice.
//
//  3. The "I agree to all Terms and Conditions" gate is gone. Consent is
//     collected at signup; blocking a locked-out user's password reset behind
//     a second acceptance stops a recovery flow for no benefit.
// ============================================================================

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, LinkIcon, ShieldAlert } from "lucide-react";

import AuthLayout from "@/app/layouts/AuthLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import { PASSWORD_MESSAGE, PASSWORD_REGEX, passwordApi } from "@/modules/auth/api";

type TokenState =
  | { phase: "checking" }
  | { phase: "valid"; email?: string }
  | { phase: "invalid"; reason: string };

const MISSING_TOKEN_REASON =
  "This page needs a reset link to work. Open the most recent link from your email, or request a new one.";

export default function ResetPassword() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { showSuccess } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenState, setTokenState] = useState<TokenState>({ phase: "checking" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState({ phase: "invalid", reason: MISSING_TOKEN_REASON });
      return;
    }

    const controller = new AbortController();
    setTokenState({ phase: "checking" });

    void (async () => {
      try {
        const result = await passwordApi.validateResetToken(token, controller.signal);
        if (controller.signal.aborted) return;
        setTokenState(
          result.valid
            ? { phase: "valid", email: result.email }
            : {
                phase: "invalid",
                reason: result.reason ?? "This reset link is no longer usable.",
              },
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        // A network or server failure is NOT a verdict on the token. Showing
        // "this link has expired" here would send a user with a perfectly good
        // link off to request another one that will fail the same way.
        setTokenState({
          phase: "invalid",
          reason:
            err instanceof ApiError
              ? err.message
              : "We couldn't check this reset link. Please try again in a moment.",
        });
      }
    })();

    return () => controller.abort();
  }, [token]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError(null);

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (!PASSWORD_REGEX.test(password)) {
        setError(PASSWORD_MESSAGE);
        return;
      }

      setLoading(true);
      try {
        await passwordApi.resetPassword(token, password);
        setDone(true);
        setPassword("");
        setConfirmPassword("");
        showSuccess("Password updated.", "Sign in with your new password.");
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setError("Too many attempts. Please wait an hour before trying again.");
        } else {
          // The backend rejects reuse of the last 5 passwords and re-checks
          // token validity at submit time; both come back as readable
          // messages, so pass them through rather than flattening to a generic
          // "could not reset" the user can't act on.
          setError(
            err instanceof ApiError ? err.message : "Could not reset the password.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [confirmPassword, password, showSuccess, token],
  );

  if (done) {
    return (
      <AuthLayout heading={"All set"}>
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" strokeWidth={1.75} />
          </span>
          <h2 className="mb-2 text-[26px] font-bold text-gray-900 xs:text-[28px] sm:text-[32px]">
            Password updated
          </h2>
          <p className="mb-8 max-w-sm text-[15px] leading-relaxed text-gray-500">
            Your password has been changed and this reset link is now used up. Any other
            sessions signed in as you have been ended.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-brand to-brand-dark py-3.5 text-[15px] font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            Go to Sign In
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (tokenState.phase === "checking") {
    return (
      <AuthLayout heading={"One moment"}>
        <LoadingOverlay show label="Checking your reset link…" />
        <div className="flex items-center gap-3 text-[15px] text-gray-500">
          <LinkIcon size={18} className="text-gray-400" />
          Checking your reset link…
        </div>
      </AuthLayout>
    );
  }

  if (tokenState.phase === "invalid") {
    return (
      <AuthLayout heading={"Good to see you"}>
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <ShieldAlert className="h-8 w-8 text-amber-600" strokeWidth={1.75} />
          </span>
          <h2 className="mb-2 text-[26px] font-bold text-gray-900 xs:text-[28px] sm:text-[32px]">
            This link won't work
          </h2>
          <p className="mb-8 max-w-sm text-[15px] leading-relaxed text-gray-500">
            {tokenState.reason}
          </p>
          <Link
            to="/forget-password"
            className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-brand to-brand-dark py-3.5 text-[15px] font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            Request a new link
          </Link>
          <Link
            to="/login"
            className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-gray-200 py-3.5 text-[15px] font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading={"Good to see you"}>
      <LoadingOverlay show={loading} label="Resetting your password…" />
      <h2 className="mb-1 text-[26px] font-bold text-gray-900 xs:text-[28px] sm:text-[32px]">
        Reset Password
      </h2>
      <p className="mb-8 text-[15px] text-gray-500">
        {tokenState.email
          ? `Choose a new password for ${tokenState.email}.`
          : "Choose a new password for your account."}
      </p>

      <BackendStatusBanner status={status} />

      <form onSubmit={handleSubmit}>
        <FormField
          label="New Password"
          type="password"
          autoComplete="new-password"
          placeholder="Type your password here"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <FormField
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          placeholder="Type your password again"
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

        <PrimaryButton type="submit" loading={loading}>
          Reset
        </PrimaryButton>

        <Link
          to="/login"
          className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-gray-200 py-3.5 text-[15px] font-medium text-gray-600 transition hover:bg-gray-50"
        >
          Back to Sign In
        </Link>
      </form>
    </AuthLayout>
  );
}
