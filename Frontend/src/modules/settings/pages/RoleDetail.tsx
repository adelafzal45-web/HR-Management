// ============================================================================
// Roles & Permissions — create / edit / view, as a page rather than a dialog.
//
// This used to be a `max-w-2xl` modal on the Roles list with the permission
// matrix crammed into a 288px scroll box. That is the wrong container for the
// most consequential form in the app: assigning permissions means reading
// dozens of capabilities across every module, and a reader who has to scroll a
// box inside a box to do it will miss things.
//
// One component serves three routes, because they are the same form in three
// postures — the only differences are whether an id is loaded and whether the
// fieldset is disabled:
//
//   /settings/roles/new        → create
//   /settings/roles/:roleId/edit → edit
//   /settings/roles/:roleId      → view (read-only)
//
// Nothing new is asked of the API: `rolesApi.create` / `.update` already
// reconcile the role-permissions join table on the caller's behalf.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, ShieldCheck } from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackButton from "@/components/common/BackButton";
import EmptyState from "@/components/common/EmptyState";
import { FormField } from "@/components/forms/FormField";
import { useToast } from "@/app/providers/ToastContext";
import {
  rolesApi,
  permissionsApi,
  type Role,
  type Permission,
} from "@/modules/settings/api/settingsApi";

type FormState = {
  name: string;
  description: string;
  status: "active" | "inactive";
  permissionIds: string[];
};

const EMPTY_FORM: FormState = { name: "", description: "", status: "active", permissionIds: [] };

/**
 * Checkbox with a real indeterminate state.
 *
 * `indeterminate` is a DOM property, not an HTML attribute — React won't set it
 * from JSX, so it has to be written through a ref. Without this a partially
 * selected module would render as plain unchecked and look identical to a
 * module with nothing selected at all.
 */
function TriStateCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      // aria-checked="mixed" is what actually conveys the partial state to
      // screen readers; the visual dash alone is not announced.
      aria-checked={indeterminate ? "mixed" : checked}
      className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand disabled:opacity-50"
    />
  );
}

export default function RoleDetail({ mode }: { mode: "create" | "edit" | "view" }) {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const readOnly = mode === "view";
  const isCreate = mode === "create";

  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The permission catalogue is needed in every mode — a read-only view still
  // has to render the boxes it is showing as ticked.
  useEffect(() => {
    permissionsApi
      .listAll()
      .then(setPermissions)
      .catch(() => toast.showError("Couldn't load the permission list."));
    // The toast helpers are stable; re-running on their identity would refetch
    // the catalogue on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isCreate || !roleId) return;
    let cancelled = false;

    setLoading(true);
    rolesApi
      .getById(roleId)
      .then((result) => {
        if (cancelled) return;
        setRole(result);
        setForm({
          name: result.name,
          description: result.description,
          status: result.status,
          permissionIds: result.permissionIds,
        });
      })
      .catch(() => {
        if (!cancelled) toast.showError("Couldn't load that role.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, isCreate]);

  const permissionsByModule = useMemo(
    () =>
      permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
        (acc[permission.module] ??= []).push(permission);
        return acc;
      }, {}),
    [permissions],
  );

  // Selection is stored as a flat id list, so the header checkboxes derive their
  // state from it rather than tracking their own — that way toggling a single
  // permission can't leave a "Select All" box out of sync with reality.
  const selectedSet = useMemo(() => new Set(form.permissionIds), [form.permissionIds]);

  const moduleState = (perms: Permission[]) => {
    const selected = perms.filter((p) => selectedSet.has(p.permissionId)).length;
    return {
      all: selected === perms.length && perms.length > 0,
      some: selected > 0 && selected < perms.length,
      selected,
    };
  };

  const totalState = {
    all: permissions.length > 0 && selectedSet.size === permissions.length,
    some: selectedSet.size > 0 && selectedSet.size < permissions.length,
  };

  const toggleModule = (perms: Permission[]) => {
    if (readOnly) return;
    const { all } = moduleState(perms);
    const ids = perms.map((p) => p.permissionId);
    setForm((f) => ({
      ...f,
      // Partial counts as "not all", so the first click on an indeterminate
      // module completes it instead of clearing it — the less destructive move.
      permissionIds: all
        ? f.permissionIds.filter((id) => !ids.includes(id))
        : [...new Set([...f.permissionIds, ...ids])],
    }));
  };

  const toggleAll = () => {
    if (readOnly) return;
    setForm((f) => ({
      ...f,
      permissionIds: totalState.all ? [] : permissions.map((p) => p.permissionId),
    }));
  };

  const togglePermission = (id: string) => {
    if (readOnly) return;
    setForm((f) => ({
      ...f,
      permissionIds: f.permissionIds.includes(id)
        ? f.permissionIds.filter((p) => p !== id)
        : [...f.permissionIds, id],
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    if (!form.name.trim()) {
      setFormError("Role name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (isCreate) {
        await rolesApi.create(form);
        toast.showSuccess("Role created.");
      } else {
        await rolesApi.update(roleId!, form);
        toast.showSuccess("Role updated.");
      }
      navigate("/settings/roles");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const heading = isCreate ? "Add Role" : readOnly ? role?.name || "Role" : `Edit ${role?.name ?? "Role"}`;
  const subheading = isCreate
    ? "Define a role and assign the permissions it should grant."
    : readOnly
      ? "Viewing the permissions assigned to this role."
      : "Change what this role is called and what it grants.";

  return (
    <SettingsLayout activeTab="/settings/roles">
      <BackButton fallback="/settings/roles" label="Back to roles" className="mb-4" />

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ---------------- Identity ---------------- */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
                <p className="mt-0.5 text-sm text-gray-500">{subheading}</p>
              </div>
              {/* View mode is a document, so the way out of it is an explicit
                  switch to the editing route rather than a live form. */}
              {readOnly && roleId && (
                <button
                  type="button"
                  onClick={() => navigate(`/settings/roles/${roleId}/edit`)}
                  className="flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark"
                >
                  <Pencil size={15} /> Edit
                </button>
              )}
            </div>

            <fieldset disabled={readOnly} className="contents">
              <div className="grid grid-cols-1 gap-x-5 lg:grid-cols-2">
                <FormField
                  label="Role Name"
                  placeholder="e.g. HR Manager"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
                <label className="mb-5 block">
                  <span className="mb-2 block text-[15px] font-medium text-gray-900">
                    Description
                  </span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What is this role responsible for?"
                    rows={2}
                    className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
                  />
                </label>
              </div>
            </fieldset>
          </section>

          {/* ---------------- Permission matrix ---------------- */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900">Permissions</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  Every capability this role grants, grouped by module.
                </p>
              </div>
              {permissions.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-900">{selectedSet.size}</span> of{" "}
                    {permissions.length} selected
                  </span>
                  {!readOnly && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark">
                      <TriStateCheckbox
                        checked={totalState.all}
                        indeterminate={totalState.some}
                        onChange={toggleAll}
                        aria-label="Select all permissions"
                      />
                      Select all
                    </label>
                  )}
                </div>
              )}
            </div>

            {permissions.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No permissions defined"
                description="There are no capabilities to assign yet."
              />
            ) : (
              /* The whole point of leaving the modal: modules sit side by side
                 at width instead of stacking inside a 288px scroll box. */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(permissionsByModule).map(([module, perms]) => {
                  const state = moduleState(perms);
                  return (
                    <div
                      key={module}
                      className="rounded-xl border border-gray-100 bg-gray-50/60 p-3"
                    >
                      <label
                        className={`mb-2.5 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${
                          readOnly ? "" : "cursor-pointer"
                        }`}
                      >
                        <TriStateCheckbox
                          checked={state.all}
                          indeterminate={state.some}
                          onChange={() => toggleModule(perms)}
                          disabled={readOnly}
                          aria-label={`Select all ${module} permissions`}
                        />
                        <span className="min-w-0 truncate">{module}</span>
                        <span className="ml-auto shrink-0 font-normal normal-case tracking-normal text-gray-400">
                          {state.selected}/{perms.length}
                        </span>
                      </label>

                      <div className="space-y-2">
                        {perms.map((permission) => (
                          <label
                            key={permission.permissionId}
                            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                              selectedSet.has(permission.permissionId)
                                ? "border-brand bg-brand-light/60"
                                : "border-gray-200 bg-white"
                            } ${readOnly ? "" : "cursor-pointer hover:border-brand"}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSet.has(permission.permissionId)}
                              onChange={() => togglePermission(permission.permissionId)}
                              disabled={readOnly}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-gray-800">
                                {permission.name}
                              </span>
                              {permission.description && (
                                <span className="block text-xs text-gray-500">
                                  {permission.description}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {formError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {formError}
            </p>
          )}

          {/* Sticky footer — the matrix is long enough that a footer pinned to
              the bottom of the document would sit far below the fold. */}
          <div className="sticky bottom-0 flex flex-col-reverse gap-2.5 rounded-2xl border-t border-gray-100 bg-white/95 p-4 shadow-sm ring-1 ring-gray-100 backdrop-blur xs:flex-row xs:justify-end">
            <button
              type="button"
              onClick={() => navigate("/settings/roles")}
              className="min-h-11 rounded-full border border-gray-200 px-6 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              {readOnly ? "Back to roles" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="min-h-11 rounded-full bg-gradient-to-r from-brand to-brand-dark px-6 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Please wait…" : isCreate ? "Create Role" : "Save Changes"}
              </button>
            )}
          </div>
        </form>
      )}
    </SettingsLayout>
  );
}
