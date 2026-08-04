// ============================================================================
// Presentational scaffolding shared by the employee create/edit form.
//
// Split out of EmployeeForm so that file can stay focused on state, validation
// and submission. Nothing here talks to the API or holds form state; every
// piece is a pure function of its props.
// ============================================================================

import type React from "react";
import { AlertCircle } from "lucide-react";
import { FormField } from "@/components/forms/FormField";

/** Marks a control as mandatory for both sighted and assistive-tech users. */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-rose-500" aria-hidden="true">
      *
    </span>
  );
}

/**
 * Text input with an error slot.
 *
 * `FormField` owns the label and password reveal, but has no error affordance —
 * it was built for the auth screens. Wrapping it (rather than changing it)
 * keeps the login/reset flows untouched. The negative margin pulls the message
 * up into the label's own bottom spacing so an invalid field doesn't shift the
 * grid rows around it.
 */
export function Field({
  label,
  error,
  hint,
  requiredMark,
  ...rest
}: React.ComponentProps<typeof FormField> & {
  error?: string;
  hint?: string;
  requiredMark?: boolean;
}) {
  const described = error ? `${String(rest.name ?? label)}-error` : undefined;
  return (
    <div>
      <FormField
        label={
          requiredMark ? (
            <>
              {label}
              <RequiredMark />
            </>
          ) : (
            label
          )
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        {...rest}
      />
      {error && (
        <p id={described} className="-mt-4 mb-5 text-xs text-rose-500">
          {error}
        </p>
      )}
      {!error && hint && <p className="-mt-4 mb-5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/** Native select styled to match `FormField`. */
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  disabled,
  requiredMark,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  requiredMark?: boolean;
}) {
  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">
        {label}
        {requiredMark && <RequiredMark />}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:ring-2 ${
          error ? "ring-2 ring-rose-400" : "focus:ring-brand/60"
        }`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="mt-1.5 block text-xs text-rose-500">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-gray-400">{hint}</span>
      ) : null}
    </label>
  );
}

/** Read-only value display, for fields the server owns (e.g. employee code). */
export function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-5">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">{label}</span>
      <div className="flex min-h-[52px] items-center rounded-lg bg-gray-50 px-4 text-sm text-gray-500 ring-1 ring-inset ring-gray-100">
        {value}
      </div>
      {hint && <span className="mt-1.5 block text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

/** Checkbox with a label, matching the brand focus ring. */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand/60 disabled:opacity-50"
      />
      <span>
        <span className="font-medium text-gray-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  );
}

/** One titled card in the form's vertical stack. */
export function SectionCard({
  id,
  title,
  description,
  icon: Icon,
  children,
  sectionRef,
}: {
  id: string;
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
  sectionRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <section
      id={`section-${id}`}
      ref={sectionRef}
      className="scroll-mt-24 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6"
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Red banner listing how many fields failed validation. */
export function ValidationSummary({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0" />
      <p>
        <span className="font-semibold">
          {count} field{count > 1 ? "s" : ""} need{count === 1 ? "s" : ""} your attention.
        </span>{" "}
        Please review the highlighted fields before saving.
      </p>
    </div>
  );
}

/** Red banner for a failed request (as opposed to client-side validation). */
export function SubmitError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0" /> {message}
    </div>
  );
}

/** Skeleton shown while reference data loads, mirroring the real layout. */
export function EmployeeFormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-xl bg-gray-100"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-5 h-5 w-40 animate-pulse rounded bg-gray-100" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, j) => (
                <div
                  key={j}
                  className="h-12 animate-pulse rounded-lg bg-gray-100"
                  style={{ animationDelay: `${j * 40}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
