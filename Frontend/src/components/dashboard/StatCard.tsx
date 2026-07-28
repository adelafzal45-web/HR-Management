import { TrendingUp, UserCheck, UserX, FileCheck2, Users, UserMinus } from "lucide-react";
import type { StatCardData } from "../../lib/dashboardMockData";

const ICONS = {
  "trending-up": TrendingUp,
  "user-check": UserCheck,
  "user-x": UserX,
  "file-check": FileCheck2,
  users: Users,
  "user-minus": UserMinus,
};

const TONES: Record<StatCardData["tone"], { bg: string; text: string }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-500" },
  blue: { bg: "bg-sky-50", text: "text-sky-500" },
  red: { bg: "bg-rose-50", text: "text-rose-500" },
  mint: { bg: "bg-teal-50", text: "text-teal-500" },
  sky: { bg: "bg-blue-50", text: "text-blue-400" },
  rose: { bg: "bg-red-50", text: "text-red-400" },
};

export default function StatCard({ value, label, icon, tone }: StatCardData) {
  const Icon = ICONS[icon];
  const toneClasses = TONES[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xl font-semibold tracking-tight text-brand-dark xs:text-2xl sm:text-3xl">
          {value}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${toneClasses.bg} ${toneClasses.text}`}
        >
          <Icon size={18} className="sm:hidden" />
          <Icon size={20} className="hidden sm:block" />
        </span>
      </div>
      <p className="mt-2.5 text-xs font-medium leading-snug text-gray-500 sm:mt-3.5 sm:text-sm">{label}</p>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand to-brand-dark" />
    </div>
  );
}
