import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function FormField({ label, type = "text", ...rest }: FormFieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">{label}</span>
      <span className="relative block">
        <input
          {...rest}
          type={isPassword ? (show ? "text" : "password") : type}
          className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </span>
    </label>
  );
}

export function PrimaryButton({
  children,
  disabled,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className="w-full rounded-full bg-gradient-to-r from-brand to-brand-dark py-3.5 text-[15px] font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
