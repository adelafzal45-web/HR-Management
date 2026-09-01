import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type ModalProps = {
 open: boolean;
 title: string;
 description?: string;
 onClose: () => void;
 children: ReactNode;
 maxWidth?: string;
};

// Generic centered modal, rendered via portal (same approach as
// ConfirmDialog) so it always covers the viewport. Used for anything that
// needs more room than a confirm/cancel dialog: the Apply Leave form,
// Payslip breakdown, Appraisal score detail, etc.
export default function Modal({ open, title, description, onClose, children, maxWidth = "max-w-lg" }: ModalProps) {
 if (!open) return null;

 return createPortal(
 <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
 <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
 <div
 role="dialog"
 aria-modal="true"
 className={`relative flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-modal bg-surface shadow-card-lg`}
 >
 <div className="flex items-start justify-between gap-4 border-b border-border-muted px-6 py-5">
 <div>
 <h2 className="text-lg font-semibold text-foreground">{title}</h2>
 {description && <p className="mt-1 text-sm text-muted">{description}</p>}
 </div>
 <button
 type="button"
 onClick={onClose}
 className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
 aria-label="Close"
 >
 <X size={18} />
 </button>
 </div>
 <div className="overflow-y-auto px-6 py-5">{children}</div>
 </div>
 </div>,
 document.body,
 );
}
