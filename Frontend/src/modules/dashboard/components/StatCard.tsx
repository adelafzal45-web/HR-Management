import { TrendingUp, UserCheck, UserX, FileCheck2, Users, UserMinus, Building2, ClipboardCheck } from "lucide-react";
import type { StatCardData } from "@/modules/dashboard/mocks/dashboardMockData";

const ICONS = {
  "trending-up": TrendingUp,
  "user-check": UserCheck,
  "user-x": UserX,
  "file-check": FileCheck2,
  users: Users,
  "user-minus": UserMinus,
  building: Building2,
  "clipboard-check": ClipboardCheck,
};

// One accent color for every card (the brand color), so the dashboard reads
// as a single coherent set of KPIs rather than a rainbow of unrelated hues.
// "Needs attention" values (e.g. Absent, Late, Pending Approvals) are still
// distinguishable — not through a different hue, but through a solid brand
// chip instead of the soft tint everything else uses, which draws the eye
// without adding a new color to the palette.
const ATTENTION_TONES: ReadonlySet<StatCardData["tone"]> = new Set(["red", "rose", "amber"]);

export default function StatCard({ value, label, icon, tone }: StatCardData) {
  const Icon = ICONS[icon];
  const needsAttention = ATTENTION_TONES.has(tone);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xl font-semibold tracking-tight text-gray-900 xs:text-2xl sm:text-3xl">
          {value}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${
            needsAttention ? "bg-brand text-white" : "bg-brand-light text-brand-dark"
          }`}
        >
          <Icon size={18} className="sm:hidden" />
          <Icon size={20} className="hidden sm:block" />
        </span>
      </div>
      <p className="mt-2.5 text-xs font-medium leading-snug text-gray-500 sm:mt-3.5 sm:text-sm">{label}</p>
      <span className={`absolute inset-x-0 bottom-0 h-1 ${needsAttention ? "bg-brand-dark" : "bg-brand-light"}`} />
    </div>
  );
}
