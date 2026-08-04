import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Info, RotateCcw } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import InfoTip from "@/components/common/InfoTip";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
 departmentsApi,
 designationsApi,
 workingDaysApi,
 type Department,
 type Designation,
 type ResolvedWeek,
 type WorkingDayScope,
} from "@/modules/settings/api/settingsApi";

// ISO-8601 numbering (1 = Monday ... 7 = Sunday), matching Postgres
// EXTRACT(ISODOW FROM date) so a day number means the same thing on both sides.
const DAYS: { value: number; label: string; short: string }[] = [
 { value: 1, label: "Monday", short: "Mon" },
 { value: 2, label: "Tuesday", short: "Tue" },
 { value: 3, label: "Wednesday", short: "Wed" },
 { value: 4, label: "Thursday", short: "Thu" },
 { value: 5, label: "Friday", short: "Fri" },
 { value: 6, label: "Saturday", short: "Sat" },
 { value: 7, label: "Sunday", short: "Sun" },
];

const ALL_WORKING: Record<number, boolean> = Object.fromEntries(DAYS.map((d) => [d.value, false]));

const sameWeek = (a: Record<number, boolean>, b: Record<number, boolean>) =>
 DAYS.every((d) => !!a[d.value] === !!b[d.value]);

const SCOPE_LABEL: Record<ResolvedWeek["scope"], string> = {
 global: "the company default",
 department: "a department override",
 designation: "a designation override",
};

export default function WorkingDaysPage() {
 const status = useBackendStatus();
 const toast = useToast();

 const [departments, setDepartments] = useState<Department[]>([]);
 const [designations, setDesignations] = useState<Designation[]>([]);
 const [scopesLoading, setScopesLoading] = useState(true);

 // Which scope is being edited. Empty strings mean "the global default".
 const [departmentId, setDepartmentId] = useState("");
 const [designationId, setDesignationId] = useState("");

 const [week, setWeek] = useState<Record<number, boolean>>(ALL_WORKING);
 const [baseline, setBaseline] = useState<Record<number, boolean>>(ALL_WORKING);
 // Whether this exact scope has its own stored row, as opposed to inheriting.
 const [hasOwnOverride, setHasOwnOverride] = useState(false);
 const [inheritedFrom, setInheritedFrom] = useState<ResolvedWeek["scope"]>("global");

 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [clearTarget, setClearTarget] = useState(false);
 const [clearing, setClearing] = useState(false);

 const scope: WorkingDayScope = useMemo(
 () => ({ departmentId: departmentId || undefined, designationId: designationId || undefined }),
 [departmentId, designationId],
 );

 const isGlobal = !departmentId && !designationId;

 // Load the scope pickers once. Page size is generous on purpose: these are
 // dropdowns, and a paginated dropdown that silently omits a department would
 // make that department unconfigurable.
 useEffect(() => {
 let active = true;
 Promise.all([
 departmentsApi.list({ pageSize: 500 }),
 designationsApi.list({ pageSize: 500 }),
 ])
 .then(([depts, desigs]) => {
 if (!active) return;
 setDepartments(depts.data);
 setDesignations(desigs.data);
 })
 .catch(() => active && toast.showError("Couldn't load departments and designations."))
 .finally(() => active && setScopesLoading(false));
 return () => {
 active = false;
 };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 const loadScope = useCallback(() => {
 setLoading(true);
 setError(null);
 // Both calls matter: `resolve` gives the effective week to show, `getScope`
 // says whether that week is this scope's own or inherited — which decides
 // between "Save override" and "Reset to inherited".
 Promise.all([workingDaysApi.resolve(scope), workingDaysApi.getScope(scope)])
 .then(([resolved, own]) => {
 const days = { ...ALL_WORKING, ...resolved.days };
 setWeek(days);
 setBaseline(days);
 setHasOwnOverride(own.length > 0);
 setInheritedFrom(resolved.scope);
 })
 .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the working day schedule."))
 .finally(() => setLoading(false));
 }, [scope]);

 useEffect(() => {
 loadScope();
 }, [loadScope]);

 // A designation override is scoped to a department+designation pair, so the
 // designation list is filtered and a department switch clears a now-invalid
 // designation rather than silently sending a mismatched pair.
 const scopedDesignations = useMemo(
 () => (departmentId ? designations.filter((d) => d.departmentId === departmentId) : []),
 [departmentId, designations],
 );

 const handleDepartmentChange = (value: string) => {
 setDepartmentId(value);
 setDesignationId("");
 };

 const dirty = !sameWeek(week, baseline);
 const workingCount = DAYS.filter((d) => week[d.value]).length;

 const handleSave = async () => {
 setSaving(true);
 setError(null);
 try {
 await workingDaysApi.setWeek(scope, week);
 toast.showSuccess(isGlobal ? "Company working days saved." : "Override saved.");
 loadScope();
 } catch (err) {
 setError(err instanceof Error ? err.message : "Couldn't save the working day schedule.");
 } finally {
 setSaving(false);
 }
 };

 const handleClear = async () => {
 setClearing(true);
 try {
 await workingDaysApi.clearScope(scope);
 toast.showSuccess("Override removed — this scope now inherits.");
 setClearTarget(false);
 loadScope();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't remove the override.");
 } finally {
 setClearing(false);
 }
 };

 const scopeName = designationId
 ? scopedDesignations.find((d) => d.designationId === designationId)?.name
 : departments.find((d) => d.departmentId === departmentId)?.name;

 return (
 <SettingsLayout activeTab="/settings/working-days">
 <BackendStatusBanner status={status} />

 <p className="mb-4 flex items-start gap-1.5 text-sm text-gray-500">
 <span>Set the company-wide default working week, then override it per department or designation.</span>
 <InfoTip
 side="bottom"
 label="How working days are used"
 text="A designation override wins over its department's, which wins over the company default. Any day not marked as working counts as a weekend or holiday — attendance excludes those days from absences and shades them in reports."
 />
 </p>

 <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-7">
 {/* Scope pickers */}
 <div className="mb-6 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Department</span>
 <select
 value={departmentId}
 onChange={(e) => handleDepartmentChange(e.target.value)}
 disabled={scopesLoading}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
 >
 <option value="">All departments (company default)</option>
 {departments.map((d) => (
 <option key={d.departmentId} value={d.departmentId}>
 {d.name}
 </option>
 ))}
 </select>
 </label>
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Designation</span>
 <select
 value={designationId}
 onChange={(e) => setDesignationId(e.target.value)}
 disabled={scopesLoading || !departmentId}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
 >
 <option value="">All designations in this department</option>
 {scopedDesignations.map((d) => (
 <option key={d.designationId} value={d.designationId}>
 {d.name}
 </option>
 ))}
 </select>
 {!departmentId && (
 <span className="mt-2 block text-xs text-gray-500">Pick a department first.</span>
 )}
 </label>
 </div>

 {loading ? (
 <div className="space-y-3">
 {[...Array(7)].map((_, i) => (
 <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : (
 <>
 {/* Inheritance notice — says plainly whether edits here create a new
 override or modify one that already exists. */}
 {!isGlobal && (
 <div className="mb-5 flex gap-2.5 rounded-xl bg-brand-light/60 px-4 py-3 text-sm text-gray-700">
 <Info size={16} className="mt-0.5 shrink-0 text-brand-dark" />
 <span>
 {hasOwnOverride ? (
 <>
 <span className="font-medium text-gray-900">{scopeName}</span> has its own schedule. Changes
 here affect only this scope.
 </>
 ) : (
 <>
 Currently inheriting from{" "}
 <span className="font-medium text-gray-900">{SCOPE_LABEL[inheritedFrom]}</span>. Saving
 creates an override for{" "}
 <span className="font-medium text-gray-900">{scopeName ?? "this scope"}</span>.
 </>
 )}
 </span>
 </div>
 )}

 <div className="mb-5 space-y-2">
 {DAYS.map((day) => (
 <label
 key={day.value}
 className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100"
 >
 <span className="flex items-center gap-3">
 <input
 type="checkbox"
 checked={!!week[day.value]}
 onChange={(e) => setWeek((w) => ({ ...w, [day.value]: e.target.checked }))}
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 <span className="text-sm font-medium text-gray-900">{day.label}</span>
 </span>
 <span
 className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
 week[day.value] ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-600"
 }`}
 >
 {week[day.value] ? "Working" : "Weekend / Holiday"}
 </span>
 </label>
 ))}
 </div>

 {workingCount === 0 && (
 <p className="mb-4 text-sm text-amber-600">
 No working days selected — every day will count as a weekend for this scope.
 </p>
 )}

 {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

 <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
 {!isGlobal && hasOwnOverride && (
 <button
 type="button"
 onClick={() => setClearTarget(true)}
 className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
 >
 <RotateCcw size={15} /> Reset to inherited
 </button>
 )}
 <div className="sm:max-w-xs sm:flex-1">
 <PrimaryButton type="button" onClick={handleSave} loading={saving} disabled={!dirty}>
 {dirty ? "Save Working Days" : "No Changes"}
 </PrimaryButton>
 </div>
 </div>
 </>
 )}
 </div>

 {/* Week summary */}
 <div className="space-y-4">
 <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Week Summary</p>
 <div className="mb-4 flex flex-wrap gap-1.5">
 {DAYS.map((day) => (
 <span
 key={day.value}
 className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
 week[day.value] ? "bg-brand text-brand-contrast" : "bg-gray-100 text-gray-400"
 }`}
 >
 {day.short}
 </span>
 ))}
 </div>
 <p className="flex items-center gap-2 text-sm text-gray-600">
 <CalendarDays size={15} className="text-gray-400" />
 {workingCount} working {workingCount === 1 ? "day" : "days"} per week
 </p>
 <p className="mt-1 text-xs text-gray-500">
 Applies to {isGlobal ? "everyone without an override" : (scopeName ?? "this scope")}.
 </p>
 </div>
 </div>
 </div>

 <ConfirmDialog
 open={clearTarget}
 title="Remove this override?"
 description={`${scopeName ?? "This scope"} will go back to inheriting its working days from the level above.`}
 confirmLabel="Remove Override"
 tone="danger"
 loading={clearing}
 onConfirm={handleClear}
 onCancel={() => setClearTarget(false)}
 />
 </SettingsLayout>
 );
}
