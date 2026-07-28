import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand-dark dark:bg-brand/10 dark:text-brand">
        <Icon size={24} />
      </span>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
