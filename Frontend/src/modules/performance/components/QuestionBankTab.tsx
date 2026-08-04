import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  GripVertical,
  Info,
  Library,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import DataTable, {
  type DataTableColumn,
  type SortDirection,
} from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import StatusBadge from "@/components/common/StatusBadge";
import {
  questionBankApi,
  type BankOptionInput,
  type BankQuestion,
  type BankQuestionInput,
  type QuestionType,
  type QuestionUsage,
} from "@/modules/appraisal/api/appraisalApi";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  TYPE_META,
  TYPE_ORDER,
  YES_NO_DEFAULTS,
  blankOption,
  validate,
} from "@/modules/performance/components/questionTypes";

function QuestionEditor({
  open,
  question,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  question: BankQuestion | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (err: unknown, fallback: string) => void;
}) {
  const [draft, setDraft] = useState<BankQuestionInput>({
    questionText: "",
    questionType: "rating",
    isActive: true,
    options: [],
  });
  const [invalid, setInvalid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens, so a cancelled edit never leaks into the
  // next one.
  useEffect(() => {
    if (!open) return;
    setInvalid(null);
    if (question) {
      setDraft({
        questionText: question.questionText,
        questionType: question.questionType,
        isActive: question.isActive,
        options: question.options.map((o) => ({
          optionId: o.optionId,
          optionText: o.optionText,
          score: o.score,
          displayOrder: o.displayOrder,
        })),
      });
    } else {
      setDraft({ questionText: "", questionType: "rating", isActive: true, options: [] });
    }
  }, [open, question]);

  const meta = TYPE_META[draft.questionType];
  const options = draft.options ?? [];

  const changeType = (questionType: QuestionType) => {
    setInvalid(null);
    setDraft((prev) => ({
      ...prev,
      questionType,
      // Switching type rebuilds the option set rather than carrying stale rows
      // that the new type would reject.
      options:
        questionType === "yes_no"
          ? YES_NO_DEFAULTS.map((o) => ({ ...o }))
          : TYPE_META[questionType].hasOptions
            ? prev.options?.length
              ? prev.options
              : [blankOption(), blankOption()]
            : [],
    }));
  };

  const setOption = (index: number, patch: Partial<BankOptionInput>) =>
    setDraft((prev) => ({
      ...prev,
      options: (prev.options ?? []).map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));

  const addOption = () =>
    setDraft((prev) => ({ ...prev, options: [...(prev.options ?? []), blankOption()] }));

  const removeOption = (index: number) =>
    setDraft((prev) => ({
      ...prev,
      options: (prev.options ?? []).filter((_, i) => i !== index),
    }));

  const save = async () => {
    const problem = validate(draft);
    if (problem) {
      setInvalid(problem);
      return;
    }
    setSaving(true);
    try {
      const payload: BankQuestionInput = {
        ...draft,
        questionText: draft.questionText.trim(),
        options: meta.hasOptions
          ? options.map((o, i) => ({ ...o, optionText: o.optionText.trim(), displayOrder: i + 1 }))
          : [],
      };
      const result = question
        ? await questionBankApi.update(question.questionId, payload)
        : await questionBankApi.create(payload);

      /*
       * Report the blast radius rather than leaving it assumed. Published forms
       * read their publish-time snapshot, so an edit here cannot rewrite what a
       * reviewer already saw — but that is only reassuring if it is said out
       * loud.
       */
      const parts: string[] = [question ? "Question updated." : "Question added to the bank."];
      if (result.affectedDraftForms.length > 0) {
        parts.push(
          `${result.affectedDraftForms.length} draft form(s) will show the new wording.`,
        );
      }
      if (result.unaffectedPublishedForms.length > 0) {
        parts.push(
          `${result.unaffectedPublishedForms.length} published form(s) keep their snapshot and are unchanged.`,
        );
      }
      onSaved(parts.join(" "));
      onClose();
    } catch (err) {
      onError(err, "Could not save the question.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={question ? "Edit Question" : "New Question"}
      description="Questions in the bank can be reused across any number of forms."
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-900">Question</span>
          <textarea
            value={draft.questionText}
            onChange={(e) => setDraft((prev) => ({ ...prev, questionText: e.target.value }))}
            rows={2}
            maxLength={500}
            placeholder="e.g. How consistently did this employee meet deadlines?"
            className="w-full resize-none rounded-lg bg-gray-100 px-3.5 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-900">Type</span>
          <div className="flex flex-wrap gap-2">
            {TYPE_ORDER.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => changeType(type)}
                disabled={Boolean(question)}
                title={
                  question
                    ? "The type cannot change after creation — existing answers are stored against it."
                    : TYPE_META[type].hint
                }
                className={`rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  draft.questionType === type
                    ? "bg-brand-light text-brand-dark"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {TYPE_META[type].label}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
            <Info size={13} className="mt-0.5 shrink-0 text-gray-400" />
            {meta.hint}
          </p>
        </div>

        {meta.hasOptions && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">
                Options{" "}
                <span className="font-normal text-gray-400">
                  ({options.length}
                  {draft.questionType === "yes_no" ? "/2" : `/${MAX_OPTIONS}`})
                </span>
              </span>
              {draft.questionType !== "yes_no" && options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={addOption}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
                >
                  <Plus size={13} />
                  Add option
                </button>
              )}
            </div>

            <div className="space-y-2">
              {options.map((opt, index) => (
                <div key={opt.optionId ?? `new-${index}`} className="flex items-center gap-2">
                  <GripVertical size={14} className="shrink-0 text-gray-300" />
                  <input
                    type="text"
                    value={opt.optionText}
                    onChange={(e) => setOption(index, { optionText: e.target.value })}
                    placeholder={`Option ${index + 1}`}
                    maxLength={500}
                    className="min-w-0 flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
                  />
                  <label className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs text-gray-400">Score</span>
                    <input
                      type="number"
                      value={opt.score}
                      min={0}
                      max={999.99}
                      step={0.01}
                      onChange={(e) => setOption(index, { score: Number(e.target.value) })}
                      className="w-20 rounded-lg bg-gray-100 px-2.5 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                    />
                  </label>
                  {draft.questionType !== "yes_no" && options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label={`Remove option ${index + 1}`}
                      className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              A reviewer's answer is normalised against the highest score here, so the
              scores are relative — 0/5/10 and 0/1/2 grade identically.
            </p>
          </div>
        )}

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={draft.isActive ?? true}
            onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand/60"
          />
          <span className="text-sm text-gray-700">
            Active — inactive questions stay on existing forms but cannot be added to new ones.
          </span>
        </label>

        {invalid && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{invalid}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
          >
            {saving ? "Saving…" : question ? "Save changes" : "Add question"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function UsageDialog({
  usage,
  onClose,
}: {
  usage: QuestionUsage | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(usage)}
      title="Where this question is used"
      description={usage?.questionText}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      {usage && (
        <div className="space-y-4 text-sm">
          <p className="text-gray-500">
            Referenced by <span className="font-semibold text-gray-900">{usage.totalForms}</span>{" "}
            form(s), with{" "}
            <span className="font-semibold text-gray-900">{usage.answerCount}</span> answer(s)
            recorded.
          </p>

          <div>
            <h5 className="mb-2 font-semibold text-gray-900">
              Published — frozen, unaffected by edits ({usage.snapshottedForms.length})
            </h5>
            {usage.snapshottedForms.length === 0 ? (
              <p className="text-gray-400">None.</p>
            ) : (
              <ul className="space-y-1.5">
                {usage.snapshottedForms.map((f) => (
                  <li
                    key={f.formId}
                    className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <span className="truncate text-gray-700">{f.formName}</span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {f.evaluationType} · {f.weightage}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h5 className="mb-2 font-semibold text-gray-900">
              Draft — will show your edits ({usage.liveForms.length})
            </h5>
            {usage.liveForms.length === 0 ? (
              <p className="text-gray-400">None.</p>
            ) : (
              <ul className="space-y-1.5">
                {usage.liveForms.map((f) => (
                  <li
                    key={f.formId}
                    className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2"
                  >
                    <span className="truncate text-gray-700">{f.formName}</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {f.evaluationType} · {f.weightage}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * The reusable question bank.
 *
 * Editing a question that a published form references is allowed on purpose —
 * the publish-time snapshot on `appraisal_form_questions` is what protects
 * history, not a ban on editing. Every save reports which draft forms will pick
 * up the change and which published forms will not, so the reuse is visible
 * rather than surprising.
 */
export default function QuestionBankTab({
  onError,
  onNotice,
}: {
  onError: (err: unknown, fallback: string) => void;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("DESC");
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({
    questionType: "",
    isActive: "",
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [usage, setUsage] = useState<QuestionUsage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    questionBankApi
      .list({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        sortBy: sortKey,
        sortOrder: sortDir,
        questionType: (tableFilters.questionType || undefined) as QuestionType | undefined,
        isActive: tableFilters.isActive || undefined,
      })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch((err) => onError(err, "Could not load the question bank."))
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch, sortKey, sortDir, tableFilters, onError]);

  useEffect(load, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize, sortKey, sortDir, tableFilters]);

  const openUsage = useCallback(
    async (question: BankQuestion) => {
      try {
        setUsage(await questionBankApi.usage(question.questionId));
      } catch (err) {
        onError(err, "Could not load usage for that question.");
      }
    },
    [onError],
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await questionBankApi.remove(pendingDelete.questionId);
      onNotice(result.message);
      setPendingDelete(null);
      load();
    } catch (err) {
      onError(err, "Could not remove that question.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<BankQuestion>[] = useMemo(
    () => [
      {
        key: "questionText",
        label: "Question",
        sortable: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{row.questionText}</p>
            {!row.isScored && (
              <span className="text-xs text-gray-400">Unscored — carries no weight</span>
            )}
          </div>
        ),
      },
      {
        key: "questionType",
        label: "Type",
        sortable: true,
        filterable: true,
        filterOptions: TYPE_ORDER.map((t) => ({ value: t, label: TYPE_META[t].label })),
        filterPlaceholder: "All types",
        render: (row) => (
          <span className="whitespace-nowrap text-gray-600">
            {TYPE_META[row.questionType]?.label ?? row.questionType}
          </span>
        ),
      },
      {
        key: "options",
        label: "Options",
        align: "center",
        hideBelow: "lg",
        render: (row) =>
          TYPE_META[row.questionType]?.hasOptions ? (
            <span className="text-gray-600">{row.options.length}</span>
          ) : (
            <span className="text-gray-300">—</span>
          ),
      },
      {
        key: "usageCount",
        label: "Used In",
        // Not sortable: usage is counted in a second query after pagination, so
        // there is no column for the server to order by.
        align: "center",
        render: (row) =>
          row.usageCount > 0 ? (
            <button
              type="button"
              onClick={() => openUsage(row)}
              className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand-dark transition hover:brightness-95"
            >
              {row.usageCount} form{row.usageCount === 1 ? "" : "s"}
            </button>
          ) : (
            <span className="text-xs text-gray-400">Unused</span>
          ),
      },
      {
        key: "isActive",
        label: "Status",
        filterable: true,
        filterOptions: [
          { value: "true", label: "Active" },
          { value: "false", label: "Inactive" },
        ],
        filterPlaceholder: "All statuses",
        align: "center",
        render: (row) => <StatusBadge status={row.isActive ? "Active" : "Inactive"} />,
      },
    ],
    [openUsage],
  );

  return (
    <div>
      <DataTable<BankQuestion>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.questionId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search questions…"
        emptyIcon={Library}
        emptyTitle="No questions yet"
        emptyDescription="Add a question here and reuse it across any number of evaluation forms."
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
        filters={tableFilters}
        onFiltersChange={setTableFilters}
        unifiedFilter
        sortOptions={[
          { value: "createdAt", label: "Created date" },
          { value: "questionText", label: "Question" },
        ]}
        toolbarRight={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={15} />
            New Question
          </button>
        }
        actions={(row) => (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(row);
                setEditorOpen(true);
              }}
              aria-label="Edit question"
              className="rounded-lg p-2 text-gray-400 transition hover:bg-brand-light/40 hover:text-brand-dark"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(row)}
              aria-label="Remove question"
              className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      <QuestionEditor
        open={editorOpen}
        question={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={(message) => {
          onNotice(message);
          load();
        }}
        onError={onError}
      />

      <UsageDialog usage={usage} onClose={() => setUsage(null)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this question?"
        description={
          pendingDelete?.usageCount
            ? `It is referenced by ${pendingDelete.usageCount} form(s), so it will be deactivated rather than deleted — existing answers and published snapshots are preserved.`
            : "This question is not used by any form and will be deleted."
        }
        confirmLabel="Remove"
        tone="danger"
        icon={<Trash2 size={18} />}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
