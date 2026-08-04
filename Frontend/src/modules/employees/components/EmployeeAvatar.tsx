import { useState } from "react";
import { API_BASE_URL } from "@/lib/apiClient";
import { photoUrl } from "@/modules/employees/types/employee.types";

type EmployeeAvatarProps = {
  firstName?: string;
  lastName?: string;
  /** Stored path (`/uploads/...`), an absolute URL, or a local preview. */
  photo?: string | null;
  /**
   * Stored path of the 128px derivative.
   *
   * Pass this wherever it is available — the component decides whether to use
   * it based on `size`, so call sites do not have to reason about pixel
   * density. Ignored above THUMB_MAX_SIZE, where upscaling would show.
   */
  thumb?: string | null;
  /** Rendered pixel size. Tailwind can't build class names at runtime, so
   *  this drives an inline style rather than an `h-${n}` string. */
  size?: number;
  className?: string;
};

const initialsOf = (first?: string, last?: string) =>
  `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";

/**
 * The thumbnail is 128px, so displaying it above this size means upscaling.
 * A 2x display doubles CSS pixels, so at 64px a thumb supplies exactly 128
 * device pixels — the largest size at which it renders sharp.
 */
const THUMB_MAX_SIZE = 64;

/**
 * Employee photo with an initials fallback.
 *
 * A stored photo can 404 — the file may have been cleared out from under the
 * database row — so a failed load falls back to initials rather than leaving
 * a broken image icon. When a thumbnail is supplied it is tried first and the
 * full photo is the next candidate, which also covers rows saved before
 * thumbnail generation existed and rows whose thumbnail failed to generate.
 */
export default function EmployeeAvatar({
  firstName,
  lastName,
  photo,
  thumb,
  size = 40,
  className = "",
}: EmployeeAvatarProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);

  const candidates = [size <= THUMB_MAX_SIZE ? thumb : null, photo]
    .map((value) => photoUrl(value, API_BASE_URL))
    .filter((value): value is string => Boolean(value));
  const src = candidates.find((candidate) => !failedSources.includes(candidate));
  const dimension = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt={`${firstName ?? ""} ${lastName ?? ""}`.trim() || "Employee photo"}
        style={dimension}
        // Keyed by src so React remounts on fallback: without it the browser
        // keeps the broken image and never retries the next candidate.
        key={src}
        onError={() => setFailedSources((previous) => [...previous, src])}
        className={`shrink-0 rounded-full object-cover ring-1 ring-gray-200 ${className}`}
      />
    );
  }

  return (
    <span
      style={{ ...dimension, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-light font-semibold text-brand-dark ring-1 ring-gray-200 ${className}`}
    >
      {initialsOf(firstName, lastName)}
    </span>
  );
}
