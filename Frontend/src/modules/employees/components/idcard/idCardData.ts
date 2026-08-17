// ============================================================================
// Employee ID card — the data shape both faces render from.
//
// The legacy Backend/TechnoCues_ID_Card.html bound a flat `CARD_DATA` object
// onto `data-field` attributes. That flat shape is kept here (it maps cleanly
// onto the printed card, which really is just a list of labelled values), but
// it is built from the live `Employee` record and Branding settings rather
// than hand-edited, and every field that the HRMS does not capture resolves to
// undefined so the card can omit the row instead of printing a placeholder.
//
// Fields the legacy template had that this data model genuinely does not
// carry, and which are therefore absent by design rather than blank:
//   - CNIC / national ID: no column exists on `users` (verified against
//     Backend/src/users/user.entity.ts). The back face drops the CNIC line.
//   - Card expiry: not a stored field. Derived below from the issue date so
//     the printed card still carries a validity window, with the rule stated
//     in one place instead of being invented per-caller.
// ============================================================================

import type { Employee } from "@/modules/employees/types/employee.types";
import { photoUrl } from "@/modules/employees/types/employee.types";
import type { BrandingSettings } from "@/modules/settings/api/settingsApi";

/**
 * How long a printed card stays valid. The legacy sample showed a two-year
 * window (03 Feb 2026 -> 02 Feb 2028); keeping that as an explicit constant
 * means the rule is reviewable rather than buried in a date expression.
 */
export const CARD_VALIDITY_YEARS = 2;

export type IdCardData = {
  employeeName: string;
  designation?: string;
  department?: string;
  employeeCode: string;
  bloodGroup?: string;
  issueDate?: string;
  expiryDate?: string;
  cellNumber?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  /** Free-text address; any newlines the operator typed render as separate rows. */
  employeeAddress?: string;
  /** Resolved absolute URL of the full-size photo, or undefined for the icon. */
  photoUrl?: string;
  /** Encoded into both QR codes. */
  verifyUrl: string;
  company: {
    name: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
};

/** `03 Feb 2026` — the compact form the printed card uses. */
export function formatCardDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Issue date + CARD_VALIDITY_YEARS, minus a day so the window reads as
 * inclusive (03 Feb 2026 -> 02 Feb 2028) rather than overlapping its renewal.
 */
function expiryFrom(joiningDate?: string): string | undefined {
  if (!joiningDate) return undefined;
  const date = new Date(joiningDate);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setFullYear(date.getFullYear() + CARD_VALIDITY_YEARS);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The single free-text `address` (the structured street/city/state/postal/
 * country columns were merged into it). Returned as-is; the card renders any
 * newlines the operator typed as separate rows rather than letting a long
 * address run off the edge.
 */
function addressLines(employee: Employee): string | undefined {
  return employee.address?.trim() || undefined;
}

/**
 * Builds the verification URL encoded into both QR codes.
 *
 * Points at this deployment's own origin rather than a hardcoded domain (the
 * legacy file hardcoded technocues.com), so a card printed from a staging or
 * self-hosted instance scans back to the instance that issued it.
 */
export function verifyUrlFor(employeeCode: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}/verify?id=${encodeURIComponent(employeeCode)}`;
}

/**
 * Maps a live employee record plus company branding onto the printed card.
 *
 * `apiBaseUrl` is the API base the server-relative `/uploads/...` photo path
 * resolves against — passed in rather than imported so this stays a pure
 * function and the PDF generator can reuse it off-screen. The full-size photo
 * is used, never the 128px thumbnail: at 20mm on a 300dpi card the thumb
 * would visibly upscale.
 */
export function buildIdCardData(
  employee: Employee,
  branding: BrandingSettings,
  apiBaseUrl: string,
): IdCardData {
  return {
    employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
    designation: employee.designation?.title,
    department: employee.department?.department_name,
    employeeCode: employee.employee_code,
    bloodGroup: employee.blood_group,
    issueDate: formatCardDate(employee.joining_date),
    expiryDate: formatCardDate(expiryFrom(employee.joining_date)),
    cellNumber: employee.phone,
    emergencyName: employee.emergency_contact_name,
    emergencyPhone: employee.emergency_contact_phone,
    emergencyRelation: employee.emergency_contact_relationship,
    employeeAddress: addressLines(employee),
    photoUrl: photoUrl(employee.profile_image, apiBaseUrl),
    verifyUrl: verifyUrlFor(employee.employee_code),
    company: {
      name: branding.companyName || "Company",
      logoUrl: branding.logoUrl || undefined,
      address: branding.address || undefined,
      phone: branding.phone || undefined,
      email: branding.email || undefined,
      website: branding.website || undefined,
    },
  };
}
