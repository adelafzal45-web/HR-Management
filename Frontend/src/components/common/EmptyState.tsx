import type { LucideIcon } from "lucide-react";
import { Button, Card } from "@/components/ui";

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

// Token-driven via the kit `Card` + `Button`, so a saved theme (and dark mode)
// restyles it with no change here. Same footprint as the old hand-rolled
// `rounded-2xl bg-white shadow-sm ring-1 ring-gray-100` shell it replaced.
export default function EmptyState({
 icon: Icon,
 title,
 description,
 actionLabel,
 onAction,
}: EmptyStateProps) {
 return (
 <Card className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
 <span className="flex h-14 w-14 items-center justify-center rounded-card bg-brand-light text-brand-dark">
 <Icon size={24} />
 </span>
 <p className="text-sm font-semibold text-foreground">{title}</p>
 {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
 {actionLabel && onAction && (
 <Button variant="primary" shape="pill" className="mt-1" onClick={onAction}>
 {actionLabel}
 </Button>
 )}
 </Card>
 );
}
