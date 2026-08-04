import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type SectionTab = {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
};

type SectionTabsProps = {
  tabs: SectionTab[];
  active: string;
};

/**
 * A compact, wrapping tab bar rendered at the top of a page's content.
 * Used to give a single sidebar entry (e.g. "Leave", "Attendance") a
 * tabbed sub-navigation instead of a nested sidebar dropdown — each tab
 * is a real route, so deep-linking and the browser back button still work.
 *
 * Renders nothing if there's only one (or zero) tabs available to the
 * current user, since a tab bar with a single option is just noise.
 */
export default function SectionTabs({ tabs, active }: SectionTabsProps) {
  const navigate = useNavigate();

  if (tabs.length <= 1) return null;

  return (
    <div className="mb-5 flex flex-wrap gap-1.5 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100 xs:gap-2">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => !isActive && navigate(tab.path)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 xs:gap-2 xs:px-4 xs:py-2.5 xs:text-sm ${
              isActive ? "bg-brand-light text-brand-dark" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <tab.icon size={16} className="shrink-0" />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
