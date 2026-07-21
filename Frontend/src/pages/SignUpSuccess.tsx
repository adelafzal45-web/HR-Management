import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";

export default function SignUpSuccess() {
  return (
    <AuthLayout heading={"Welcome\naboard"}>
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
        <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-9 w-9 text-green-600" strokeWidth={1.75} />
        </span>

        <h2 className="mb-2 text-[28px] font-bold text-gray-900 sm:text-[32px]">
          Account created successfully!
        </h2>
        <p className="mb-8 max-w-sm text-[15px] text-gray-500">
          Your account is ready to go. Sign in with your new credentials to get
          started.
        </p>

        <Link
          to="/login"
          className="w-full rounded-full bg-gradient-to-r from-brand to-brand-dark py-3.5 text-center text-[15px] font-semibold text-gray-900 shadow-sm transition hover:brightness-95 sm:w-auto sm:px-10"
        >
          Continue to Login
        </Link>
      </div>
    </AuthLayout>
  );
}
