import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-gray-100">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand-dark">
        <Icon size={24} />
      </span>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-500">{description}</p>}
    </div>
  );
}
