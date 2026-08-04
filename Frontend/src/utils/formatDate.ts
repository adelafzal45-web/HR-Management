// Formats a date value for display, defaulting to today's date when the
// value is missing or isn't a valid date. Several Settings DTOs
// (Departments/Designations/Job Categories) don't return a `created_at`
// field yet on this backend — see the notes in settingsApi.ts — so the
// frontend defaults that field to "" until the backend adds it. Without
// this guard, `new Date("").toLocaleDateString()` renders "Invalid Date"
// in those tables.
export function formatDisplayDate(
 value: string | null | undefined,
 options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
 const parsed = value ? new Date(value) : null;
 const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
 return date.toLocaleDateString(undefined, options);
}
