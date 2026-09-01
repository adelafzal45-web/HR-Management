import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

// Blocker breakdown for the thing being deleted. Both Departments and
// Designations feed this the counts the server gave them, so the dialog can
// never disagree with the 409 that would follow.
export type ReassignBlocker = { label: string; detail?: string };

export type ReassignTarget = { id: string; label: string };

type ReassignDeleteDialogProps = {
 open: boolean;
 title: string;
 // Null while the impact request is still in flight. Rendering "Blocked by:"
 // over stale counts from the previously-opened row is worse than a spinner.
 blockers: ReassignBlocker[] | null;
 loadingImpact?: boolean;
 // Empty when nothing is attached — the dialog then collapses to a plain
 // confirm, because there is nothing to move.
 targets: ReassignTarget[];
 targetLabel: string;
 // Copy shown when there is nothing blocking the delete.
 emptyDescription: string;
 submitting?: boolean;
 error?: string | null;
 onConfirm: (targetId: string | null) => void;
 onCancel: () => void;
};

// Companion to ConfirmDialog for deletes that are blocked by rows pointing at
// the record. Rather than refusing and leaving HR to hunt down 40 employees by
// hand, it names what is attached and offers somewhere to move it, then lets
// the server do both in one transaction.
//
// Deliberately a separate component rather than more props on ConfirmDialog:
// that one is a two-button yes/no and is used in a dozen places where a select
// element would be nonsense.
export default function ReassignDeleteDialog({
 open,
 title,
 blockers,
 loadingImpact = false,
 targets,
 targetLabel,
 emptyDescription,
 submitting = false,
 error = null,
 onConfirm,
 onCancel,
}: ReassignDeleteDialogProps) {
 const [mounted, setMounted] = useState(false);
 const [visible, setVisible] = useState(false);
 const [targetId, setTargetId] = useState("");

 useEffect(() => {
  if (open) {
   setMounted(true);
   const raf = requestAnimationFrame(() => setVisible(true));
   return () => cancelAnimationFrame(raf);
  }
  setVisible(false);
  const timeout = setTimeout(() => setMounted(false), 180);
  return () => clearTimeout(timeout);
 }, [open]);

 // Reset per open, not per targets change — otherwise a late-arriving impact
 // response would wipe a choice the user had already made.
 useEffect(() => {
  if (open) setTargetId("");
 }, [open]);

 useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === "Escape") onCancel();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
 }, [open, onCancel]);

 if (!mounted) return null;

 const isBlocked = !!blockers && blockers.length > 0;
 // Nowhere to move things to (the only other department was this one) — the
 // move can't be offered, so say why instead of showing an empty dropdown.
 const noTargets = isBlocked && targets.length === 0;
 const canSubmit = !submitting && !loadingImpact && (!isBlocked || (!!targetId && !noTargets));

 return createPortal(
  <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:px-6">
   <div
    className={`absolute inset-0 bg-gray-900/50 backdrop-blur-[2px] transition-opacity duration-200 ${
     visible ? "opacity-100" : "opacity-0"
    }`}
    onClick={onCancel}
    aria-hidden
   />

   <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="reassign-dialog-title"
    className={`relative w-full max-w-[92vw] overflow-hidden rounded-modal bg-surface p-6 text-left shadow-card-lg transition-all duration-200 xs:max-w-md ${
     visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
    }`}
   >
    <h2 id="reassign-dialog-title" className="text-base font-semibold text-foreground">
     {title}
    </h2>

    {loadingImpact && <p className="mt-3 text-sm text-muted">Checking what's attached…</p>}

    {!loadingImpact && !isBlocked && (
     <p className="mt-2 text-sm leading-relaxed text-muted">{emptyDescription}</p>
    )}

    {!loadingImpact && isBlocked && (
     <>
      <div className="mt-4 rounded-card border border-warning/30 bg-warning-tint p-4">
       <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertTriangle size={15} className="shrink-0 text-warning" />
        Blocked by:
       </div>
       <ul className="mt-2 space-y-1 pl-6">
        {blockers.map((b) => (
         <li key={b.label} className="list-disc text-sm text-foreground">
          {b.label}
          {b.detail && <span className="text-muted"> {b.detail}</span>}
         </li>
        ))}
       </ul>
      </div>

      {noTargets ? (
       <p className="mt-4 text-sm leading-relaxed text-muted">
        There is nowhere to move them to — create another {targetLabel.toLowerCase()} first, or reassign
        them individually.
       </p>
      ) : (
       <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-foreground">Move them to</span>
        <select
         value={targetId}
         onChange={(e) => setTargetId(e.target.value)}
         className="w-full rounded-control bg-surface-muted px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
        >
         <option value="" disabled>
          Select a {targetLabel.toLowerCase()}
         </option>
         {targets.map((t) => (
          <option key={t.id} value={t.id}>
           {t.label}
          </option>
         ))}
        </select>
       </label>
      )}
     </>
    )}

    {error && <p className="mt-4 text-sm text-error">{error}</p>}

    <div className="mt-6 flex flex-col-reverse gap-2.5 xs:flex-row xs:gap-3">
     <button
      type="button"
      onClick={onCancel}
      className="min-h-11 flex-1 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-background"
     >
      Cancel
     </button>
     <button
      type="button"
      onClick={() => onConfirm(isBlocked ? targetId : null)}
      disabled={!canSubmit}
      className="min-h-11 flex-1 rounded-full bg-error px-4 py-2 text-sm font-semibold text-error-contrast shadow-card transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
     >
      {submitting ? "Please wait…" : isBlocked ? "Move & Delete" : "Delete"}
     </button>
    </div>
   </div>
  </div>,
  document.body,
 );
}
