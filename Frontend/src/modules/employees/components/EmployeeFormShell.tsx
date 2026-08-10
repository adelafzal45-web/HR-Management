// ============================================================================
// Presentational scaffolding shared by the employee create/edit form.
//
// Split out of EmployeeForm so that file can stay focused on state, validation
// and submission. Nothing here talks to the API or holds form state; every
// piece is a pure function of its props.
// ============================================================================

import type React from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import {
  COUNTRIES,
  countryByCode,
  countryForDial,
  joinPhone,
  splitPhone,
} from "@/modules/employees/data/geo";

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

/**
 * Phone entry as a dial-code select plus a national-number input.
 *
 * The two halves are joined back into one string for the caller (and the
 * backend column) rather than stored apart, so nothing downstream has to learn
 * about a split representation. Typing a number that already carries a `+` code
 * re-splits it into the select instead of producing a doubled prefix, which is
 * what happens when someone pastes a full international number.
 */
export function PhoneField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  requiredMark,
  defaultDial,
  placeholder = "300 1234567",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  requiredMark?: boolean;
  /** Dial code used when the value carries none — the form's default country. */
  defaultDial: string;
  placeholder?: string;
}) {
  const { dial, national } = splitPhone(value, defaultDial);
  const country = countryForDial(dial);
  const described = error ? `${name}-error` : undefined;

  const handleNational = (next: string) => {
    // A pasted `+…` number carries its own code; honour it rather than
    // prefixing the current one a second time.
    if (next.trim().startsWith("+")) {
      const parsed = splitPhone(next, dial);
      onChange(joinPhone(parsed.dial, parsed.national));
      return;
    }
    onChange(joinPhone(dial, next));
  };

  return (
    <div className="mb-5">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">
        {label}
        {requiredMark && <RequiredMark />}
      </span>

      <div
        className={`flex items-stretch overflow-hidden rounded-lg bg-gray-100 focus-within:ring-2 ${
          error ? "ring-2 ring-rose-400" : "focus-within:ring-brand/60"
        }`}
      >
        <div className="relative flex shrink-0 items-center gap-1.5 border-r border-gray-200 pl-3.5 pr-2 text-sm text-gray-700">
          <span aria-hidden="true">{country?.flag ?? "🌐"}</span>
          <span className="font-medium tabular-nums">{dial}</span>
          <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
          <select
            value={country?.code ?? ""}
            onChange={(e) => {
              const next = countryByCode(e.target.value);
              if (next) onChange(joinPhone(next.dial, national));
            }}
            aria-label={`${label} country code`}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.dial})
              </option>
            ))}
          </select>
        </div>

        <input
          type="tel"
          name={name}
          value={national}
          onChange={(e) => handleNational(e.target.value)}
          placeholder={placeholder}
          autoComplete="tel-national"
          inputMode="tel"
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className="w-full bg-transparent px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
      </div>

      {error ? (
        <p id={described} className="mt-1.5 text-xs text-rose-500">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Switch-style boolean control.
 *
 * Same contract as `Checkbox`, rendered as a track-and-knob toggle with the
 * current state spelled out in words next to it. It stays a real
 * `<input type="checkbox">` under a `sr-only` class so keyboard focus, the
 * space key and screen-reader semantics come for free; `peer-*` classes drive
 * the visual state off the input rather than off React state.
 */
export function Toggle({
  label,
  checked,
  onChange,
  disabled,
  description,
  onText = "Enabled",
  offText = "Disabled",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
  onText?: string;
  offText?: string;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-xl bg-gray-50 p-4 ring-1 ring-inset ring-gray-100 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>

      <span className="flex shrink-0 items-center gap-2.5">
        <span
          className={`text-xs font-semibold ${checked ? "text-brand-dark" : "text-gray-400"}`}
          aria-hidden="true"
        >
          {checked ? onText : offText}
        </span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            role="switch"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 peer-focus-visible:ring-offset-2" />
          <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
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
