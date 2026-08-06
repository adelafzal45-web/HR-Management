import type { LucideIcon } from "lucide-react";

export type WorkspaceTab<K extends string = string> = {
  key: K;
  label: string;
  icon: LucideIcon;
  /** One line under the bar explaining what this section is for. */
  description?: string;
  /** A count worth acting on (outstanding reviews). Hidden when 0 or absent. */
  badge?: number;
  /** Secondary context on the tab itself, e.g. the form the builder has open. */
  hint?: string;
};

type WorkspaceTabsProps<K extends string> = {
  tabs: ReadonlyArray<WorkspaceTab<K>>;
  active: K;
  onChange: (key: K) => void;
  /** The workspace's own name, shown above the bar. */
  title?: string;
  /** Rendered on the right of the header row — usually a primary action. */
  actions?: React.ReactNode;
};

/**
 * The section bar *inside* one workspace, as opposed to `SectionTabs`, which
 * moves between separate routes.
 *
 * The two are deliberately styled differently. Admin sees both at once — the
 * destination pills (Management / Compare / Team Lead Scope) and then this —
 * and when both were rendered as identical rounded pill bars the screen read as
 * two competing navigations with no way to tell which one owned the page. An
 * underline treatment sits visually *below* the pills, so the hierarchy is
 * legible at a glance instead of having to be inferred from position.
 *
 * These sections are not routes: they are `?tab=` state on one page, so this is
 * a real tablist with buttons rather than links. `aria-selected` plus
 * `role="tab"` is what tells a screen reader this switches a panel in place,
 * where `aria-current="page"` (what SectionTabs uses) would claim a navigation
 * that never happens.
 */
export default function WorkspaceTabs<K extends string>({
  tabs,
  active,
  onChange,
  title,
  actions,
}: WorkspaceTabsProps<K>) {
  const current = tabs.find((tab) => tab.key === active);

  return (
    <div className="mb-5 rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          {title && (
            <h2 className="text-sm font-semibold tracking-tight text-gray-900 sm:text-base">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}

      <div className="border-b border-gray-100 px-2 sm:px-3">
        {/* -mb-px pulls the active underline onto the container's border so the
            two read as one line rather than a double rule. */}
        <div role="tablist" className="scrollbar-hide -mb-px flex gap-0.5 overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon, badge, hint }) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(key)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-colors duration-150 sm:text-sm ${
                  isActive
                    ? "border-brand text-brand-dark"
                    : "border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-800"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                {label}
                {typeof badge === "number" && badge > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {badge}
                  </span>
                )}
                {hint && (
                  <span className="hidden max-w-[10rem] truncate text-xs font-normal text-gray-400 lg:inline">
                    {hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {current?.description && (
        <p className="px-4 py-2.5 text-xs text-gray-500 sm:px-5">{current.description}</p>
      )}
    </div>
  );
}
