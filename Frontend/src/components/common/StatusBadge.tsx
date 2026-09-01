// Small colored pill used across Attendance / Leave / Payroll / Appraisal /
// Notifications for status text (Present, Pending, Approved, Rejected, etc.).
// Centralized here so every module gets consistent colors instead of each
// page inventing its own tone mapping.

// Composes the kit `Badge`. The restrained palette is intentional: a single
// accent (brand) for "good"/active states, a solid brand chip for anything that
// needs attention, a strong inverted chip for negatives, and neutral for the
// rest — meaning comes from the label + solid-vs-soft weight, not hue variety.
// Retargeted from literal grays to Badge tones so it themes (incl. dark mode).
import { Badge, type BadgeTone, type BadgeVariant } from "@/components/ui";

type BadgeStyle = { tone: BadgeTone; variant: BadgeVariant };

const STYLE_BY_STATUS: Record<string, BadgeStyle> = {
 present: { tone: "brand", variant: "soft" },
 approved: { tone: "brand", variant: "soft" },
 completed: { tone: "brand", variant: "soft" },
 generated: { tone: "brand", variant: "soft" },
 paid: { tone: "brand", variant: "soft" },
 active: { tone: "brand", variant: "soft" },

 late: { tone: "brand", variant: "solid" },
 pending: { tone: "brand", variant: "solid" },

 absent: { tone: "neutral", variant: "solid" },
 rejected: { tone: "neutral", variant: "solid" },
 unpaid: { tone: "neutral", variant: "solid" },
 inactive: { tone: "neutral", variant: "solid" },

 leave: { tone: "neutral", variant: "soft" },
 "on leave": { tone: "neutral", variant: "soft" },
 holiday: { tone: "neutral", variant: "soft" },
 "half-day": { tone: "neutral", variant: "soft" },
};

const DEFAULT_STYLE: BadgeStyle = { tone: "neutral", variant: "soft" };

// "on leave" / "in progress"-style statuses arrive with spaces or mixed
// case; normalize to Title Case so the label always looks intentional
// regardless of how the source data is cased.
function toTitleCase(value: string) {
 return value
 .split(" ")
 .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
 .join(" ");
}

export default function StatusBadge({ status }: { status: string }) {
 const style = STYLE_BY_STATUS[status.toLowerCase()] ?? DEFAULT_STYLE;
 return (
 <Badge tone={style.tone} variant={style.variant}>
 {toTitleCase(status)}
 </Badge>
 );
}
