import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
 icon: LucideIcon;
 title: string;
 description?: string;
 /**
  * Optional call to action. Both must be supplied for the button to render —
  * a label with no handler would be a dead control.
  */
 actionLabel?: string;
 onAction?: () => void;
};

export default function EmptyState({
 icon: Icon,
 title,
 description,
 actionLabel,
 onAction,
}: EmptyStateProps) {
 return (
 <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-gray-100">
 <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand-dark">
 <Icon size={24} />
 </span>
 <p className="text-sm font-semibold text-gray-900">{title}</p>
 {description && <p className="max-w-sm text-sm text-gray-500">{description}</p>}
 {actionLabel && onAction && (
 <button
 type="button"
 onClick={onAction}
 className="mt-1 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 {actionLabel}
 </button>
 )}
 </div>
 );
}
