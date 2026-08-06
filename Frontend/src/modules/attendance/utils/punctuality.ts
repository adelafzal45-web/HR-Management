// Turns the backend's punctuality verdicts (check_in/out_punctuality +
// variance minutes) into small human-readable badges for the Status column.
//
// The variance is signed minutes relative to the assigned shift: negative is
// before the shift boundary, positive is after. So for check-in, "late" means
// arrived after start + grace, "early" means well before start; for check-out,
// "early" means left before the shift ended, "late" means stayed past it.

import type { AdminAttendanceRecord } from "@/modules/settings/api/adminOpsApi";

export type PunctualityTone = "warn" | "info" | "muted";

export type PunctualityBadge = {
 label: string;
 title: string; // tooltip with the exact minutes
 tone: PunctualityTone;
};

const fmtMins = (n: number) => {
 const abs = Math.abs(n);
 if (abs < 60) return `${abs} min`;
 const h = Math.floor(abs / 60);
 const m = abs % 60;
 return m ? `${h}h ${m}m` : `${h}h`;
};

export function punctualityBadges(row: AdminAttendanceRecord): PunctualityBadge[] {
 const badges: PunctualityBadge[] = [];

 if (row.checkInPunctuality === "late") {
 const by = row.checkInVarianceMinutes != null ? ` by ${fmtMins(row.checkInVarianceMinutes)}` : "";
 badges.push({ label: "Late arrival", title: `Checked in late${by}`, tone: "warn" });
 } else if (row.checkInPunctuality === "early") {
 const by = row.checkInVarianceMinutes != null ? ` by ${fmtMins(row.checkInVarianceMinutes)}` : "";
 badges.push({ label: "Early check-in", title: `Checked in early${by}`, tone: "info" });
 }

 if (row.checkOutPunctuality === "early") {
 const by = row.checkOutVarianceMinutes != null ? ` by ${fmtMins(row.checkOutVarianceMinutes)}` : "";
 badges.push({ label: "Early checkout", title: `Left before shift end${by}`, tone: "warn" });
 } else if (row.checkOutPunctuality === "late") {
 const by = row.checkOutVarianceMinutes != null ? ` by ${fmtMins(row.checkOutVarianceMinutes)}` : "";
 badges.push({ label: "Late checkout", title: `Stayed past shift end${by}`, tone: "info" });
 }

 return badges;
}

// Short text form for CSV export — e.g. "Late arrival; Early checkout".
export function punctualityText(row: AdminAttendanceRecord): string {
 return punctualityBadges(row)
 .map((b) => b.label)
 .join("; ");
}
