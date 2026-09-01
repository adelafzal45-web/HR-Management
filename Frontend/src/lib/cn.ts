/**
 * Joins class names, dropping falsy entries — a dependency-free stand-in for
 * `clsx`, enough for the conditional-class needs of the UI kit. Deliberately NOT
 * `tailwind-merge`: it does no conflict resolution, so components put their base
 * classes first and the caller's `className` last, letting later source order win
 * for the handful of overrides callers actually pass (margins, width). Keep those
 * overrides non-conflicting rather than relying on merge magic.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
