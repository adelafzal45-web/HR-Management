import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  Pause,
  Play,
  Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import {
  formsApi,
  type AppraisalForm,
  type FormStatus,
} from "@/modules/appraisal/api/appraisalApi";

/**
 * One lifecycle move, as offered on a form row.
 *
 * `blockedReason` is carried rather than the action being dropped from the
 * list: a Publish option that silently disappears reads as a missing feature,
 * whereas a disabled one with "weights must total 100%" on it explains what to
 * do next. Only moves that make no sense for the current state at all — Archive
 * on an already-archived form — are omitted.
 */
type StatusAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: "brand" | "danger";
  /** Confirmation copy. The form name is appended by the dialog. */
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  payload: { status?: FormStatus; isActive?: boolean };
  /** Set when the move is visible but not currently allowed. */
  blockedReason?: string;
};

/**
 * The moves available from a form's current state.
 *
 * Publish is gated on the same rule the server enforces (active scored weights
 * totalling 100%), checked here only to explain the block before the request —
 * the server remains the authority and re-checks on every call.
 *
 * Unpublish disappears entirely once evaluations exist, because the server
 * refuses it unconditionally there: reviews are scored against the frozen
 * question snapshots, and reopening them would change what a submitted score
 * meant. Duplicating the form is the supported way to rework it.
 */
export function statusActionsFor(form: AppraisalForm): StatusAction[] {
  const actions: StatusAction[] = [];
  const publishReady = form.questionCount > 0 && form.activeWeightTotal === 100;

  if (form.status === "Draft") {
    actions.push({
      id: "publish",
      label: "Publish",
      icon: CheckCircle2,
      tone: "brand",
      confirmTitle: "Publish this form?",
      confirmBody:
        "Publishing freezes the current questions, weights and options onto the form so submitted evaluations stay consistent. The form starts generating evaluations on its schedule.",
      confirmLabel: "Publish",
      payload: { status: "Published", isActive: true },
      blockedReason: publishReady
        ? undefined
        : form.questionCount === 0
          ? "Add at least one active question first."
          : `Active scored weights total ${form.activeWeightTotal}% — they must total exactly 100%.`,
    });
  }

  if (form.status === "Published" && form.reviewCount === 0) {
    actions.push({
      id: "unpublish",
      label: "Move back to Draft",
      icon: Undo2,
      tone: "brand",
      confirmTitle: "Move this form back to Draft?",
      confirmBody:
        "The questions become editable again and the form stops generating evaluations until it is republished. No evaluations reference it yet, so nothing is lost.",
      confirmLabel: "Move to Draft",
      payload: { status: "Draft" },
    });
  }

  if (form.status === "Published") {
    actions.push(
      form.isActive
        ? {
            id: "deactivate",
            label: "Deactivate",
            icon: Pause,
            tone: "brand",
            confirmTitle: "Deactivate this form?",
            confirmBody:
              "No new evaluations will be generated. The form keeps its questions and history and can be reactivated at any time — this is the reversible alternative to archiving.",
            confirmLabel: "Deactivate",
            payload: { isActive: false },
          }
        : {
            id: "activate",
            label: "Activate",
            icon: Play,
            tone: "brand",
            confirmTitle: "Activate this form?",
            confirmBody:
              "The form resumes generating evaluations on its schedule for everyone in its audience.",
            confirmLabel: "Activate",
            payload: { isActive: true },
          },
    );
  }

  if (form.status === "Archived") {
    actions.push({
      id: "restore",
      label: "Restore from archive",
      icon: ArchiveRestore,
      tone: "brand",
      confirmTitle: "Restore this form?",
      confirmBody:
        "The form returns as a Draft so its questions can be reviewed before it goes live again. It will not generate evaluations until it is published.",
      confirmLabel: "Restore",
      payload: { status: "Draft", isActive: true },
    });
  } else {
    actions.push({
      id: "archive",
      label: "Archive",
      icon: Archive,
      tone: "danger",
      confirmTitle: "Archive this form?",
      confirmBody:
        "The form is retired: it generates no new evaluations and stops appearing as an option. Existing evaluations keep resolving against it. It can be restored later.",
      confirmLabel: "Archive",
      payload: { status: "Archived" },
    });
  }

  return actions;
}

/**
 * Status transitions for one form row, as an anchored menu plus a confirmation.
 *
 * Every move is confirmed rather than applied on click. These change what the
 * scheduler generates and what a whole department sees, and the trigger sits in
 * a dense row of icon buttons where a mis-click is easy.
 */
export default function FormStatusMenu({
  form,
  disabled,
  onDone,
  onError,
  onNotice,
}: {
  form: AppraisalForm;
  disabled?: boolean;
  onDone: () => void | Promise<void>;
  onError: (err: unknown, msg: string) => void;
  onNotice: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [saving, setSaving] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const actions = statusActionsFor(form);
  if (actions.length === 0) return null;

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await formsApi.changeStatus(form.formId, pending.payload);
      onNotice(`${pending.label} — "${form.formName}".`);
      setPending(null);
      await onDone();
    } catch (err) {
      onError(err, `Could not ${pending.label.toLowerCase()} that form.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div ref={anchorRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Change status"
          aria-label={`Change status of ${form.formName}`}
          className="flex items-center gap-0.5 rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
        >
          <Play size={14} />
          <ChevronDown size={12} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  disabled={Boolean(action.blockedReason)}
                  title={action.blockedReason}
                  onClick={() => {
                    setOpen(false);
                    setPending(action);
                  }}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    action.tone === "danger"
                      ? "text-red-600 hover:bg-red-50"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={15} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-medium">{action.label}</span>
                    {action.blockedReason && (
                      <span className="mt-0.5 block text-xs leading-snug text-gray-500">
                        {action.blockedReason}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.confirmTitle ?? ""}
        description={
          pending ? `"${form.formName}" — ${pending.confirmBody}` : undefined
        }
        confirmLabel={pending?.confirmLabel ?? "Confirm"}
        tone={pending?.tone ?? "brand"}
        loading={saving}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
