// ============================================================================
// Forgot Password — requests a one-time reset link.
//
// Calls POST /auth/forgot-password through `passwordApi`, not the
// demo-fallback client this page used to use: that one pointed at
// `/auth/forget-password` (a route that has never existed here) and, because
// every call in it is wrapped in `withDemoFallback`, the 404 fell through to
// the mock store and this screen showed "Check your inbox" for a mail that was
// never sent.
//
// The success screen is shown for ANY accepted request, including one for an
// address with no account. That is intentional and matches the backend, which
// returns the same 200 either way: a "no account with that email" message here
// would let anyone test addresses against the employee directory.
// ============================================================================

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck, ExternalLink, RotateCcw, LogIn } from "lucide-react";
import AuthLayout from "@/app/layouts/AuthLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { ApiError } from "@/lib/apiClient";
import { passwordApi } from "@/modules/auth/api";

// Maps a submitted address to its provider's webmail inbox so "Open Email"
// can deep-link straight there; unrecognized domains fall back to a plain
// mailto: link, which still opens whatever mail client is configured.
function getOpenEmailUrl(email: string) {
 const domain = email.split("@")[1]?.toLowerCase().trim() ?? "";

 if (domain.includes("gmail") || domain.includes("googlemail")) {
 return { href: "https://mail.google.com/mail/u/0/#inbox", external: true };
 }
 if (
 domain.includes("outlook") ||
 domain.includes("hotmail") ||
 domain.includes("live.com") ||
 domain.includes("msn.com")
 ) {
 return { href: "https://outlook.live.com/mail/0/inbox", external: true };
 }
 if (domain.includes("yahoo")) {
 return { href: "https://mail.yahoo.com/", external: true };
 }
 if (domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com")) {
 return { href: "https://www.icloud.com/mail", external: true };
 }
 return { href: `mailto:${email}`, external: false };
}

export default function ForgetPassword() {
 const status = useBackendStatus();

 const [email, setEmail] = useState("");
 const [error, setError] = useState<string | null>(null);
 const [sent, setSent] = useState(false);
 const [loading, setLoading] = useState(false);

 const sendResetLink = async () => {
 setError(null);
 setLoading(true);
 try {
 await passwordApi.forgotPassword(email.trim());
 setSent(true);
 } catch (err) {
 // 429 is the rate limiter (5/hr per email+IP) and is the one failure a
 // user can act on, so it gets its own wording — "could not send" would
 // invite exactly the retries the limit exists to stop.
 if (err instanceof ApiError && err.status === 429) {
 setError(
 "Too many reset requests for this address. Wait an hour before trying again, or contact HR.",
 );
 } else {
 setError(err instanceof Error ? err.message : "Could not send the reset link.");
 }
 } finally {
 setLoading(false);
 }
 };

 const handleSubmit = (e: FormEvent) => {
 e.preventDefault();
 void sendResetLink();
 };

 if (sent) {
 const emailUrl = getOpenEmailUrl(email);

 return (
 <AuthLayout heading={"Almost there"}>
 <LoadingOverlay show={loading} label="Sending reset link…" />
 <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
 <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
 <MailCheck className="h-8 w-8 text-green-600" strokeWidth={1.75} />
 </span>

 <h2 className="mb-2 text-[26px] font-bold text-gray-900 xs:text-[28px] sm:text-[32px]">
 Check your inbox
 </h2>
 <p className="max-w-sm text-[15px] leading-relaxed text-gray-500">
 We've sent a password reset link to
 </p>
 <p className="mb-8 mt-1 max-w-sm break-all text-[15px] font-semibold text-gray-900">
 {email}
 </p>

 <div className="flex w-full flex-col gap-3">
 <a
 href={emailUrl.href}
 target={emailUrl.external ? "_blank" : undefined}
 rel={emailUrl.external ? "noreferrer" : undefined}
 className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3.5 text-[15px] font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 <ExternalLink size={17} />
 Open Email
 </a>
 <button
 type="button"
 onClick={() => {
 setSent(false);
 setError(null);
 }}
 className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 py-3.5 text-[15px] font-medium text-gray-600 transition hover:bg-gray-50"
 >
 <RotateCcw size={16} />
 Use a different email
 </button>
 <Link
 to="/login"
 className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 py-3.5 text-[15px] font-medium text-gray-600 transition hover:bg-gray-50"
 >
 <LogIn size={16} />
 Back to Login
 </Link>
 </div>

 <p className="mt-8 text-[15px] text-gray-500">
 Didn't get anything? Check your spam folder, or{" "}
 <button
 type="button"
 disabled={loading}
 onClick={() => void sendResetLink()}
 className="font-medium text-brand-dark hover:underline disabled:cursor-not-allowed disabled:opacity-50"
 >
 resend the link
 </button>
 .
 </p>
 </div>
 </AuthLayout>
 );
 }

 return (
 <AuthLayout heading={"Good to see you"}>
 <LoadingOverlay show={loading} label="Sending reset link…" />
 <h2 className="mb-1 text-[26px] xs:text-[28px] sm:text-[32px] font-bold text-gray-900">Forget Password?</h2>
 <p className="mb-8 text-[15px] text-gray-500">
 Enter your email and we'll send you a link to reset your password.
 </p>

 <BackendStatusBanner status={status} />

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

 <p className="text-[15px] text-gray-500">
 Remembered your password?{" "}
 <Link to="/login" className="font-medium text-brand-dark">
 Back to Login
 </Link>
 </p>
 </AuthLayout>
 );
}
