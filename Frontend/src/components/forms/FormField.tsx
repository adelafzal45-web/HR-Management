import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";

type FormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "label"> & {
 /**
  * ReactNode rather than string so callers can append a required marker or
  * other inline adornment. Plain strings — every existing caller — are
  * unaffected.
  */
 label: ReactNode;
};

// Labelled text field. Composes the token-driven `Input` primitive and keeps its
// own concern — the label and the password reveal toggle — so every existing
// caller (auth, payroll, settings, …) keeps the same public props.
export function FormField({ label, type = "text", className, ...rest }: FormFieldProps) {
 const [show, setShow] = useState(false);
 const isPassword = type === "password";

 return (
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-foreground">{label}</span>
 <span className="relative block">
 <Input
 {...rest}
 type={isPassword ? (show ? "text" : "password") : type}
 className={cn(isPassword && "pr-12", className)}
 />
 {isPassword && (
 <button
 type="button"
 onClick={() => setShow((s) => !s)}
 className="absolute right-1.5 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-muted"
 tabIndex={-1}
 aria-label={show ? "Hide password" : "Show password"}
 >
 {show ? <EyeOff size={18} /> : <Eye size={18} />}
 </button>
 )}
 </span>
 </label>
 );
}

// The full-width pill submit button used by every form. Now a thin wrapper over
// the kit `Button` (primary / lg / pill / full-width). Two behaviours are
// preserved deliberately: it defaults to `type="submit"` (the original had no
// explicit type, so a bare button in a form submitted), and it swaps the label
// for "Please wait…" while loading rather than showing a spinner — dozens of
// callers rely on both.
export function PrimaryButton({
 children,
 disabled,
 loading,
 type = "submit",
 ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
 return (
 <Button {...rest} type={type} variant="primary" size="lg" shape="pill" fullWidth disabled={disabled || loading}>
 {loading ? "Please wait…" : children}
 </Button>
 );
}
