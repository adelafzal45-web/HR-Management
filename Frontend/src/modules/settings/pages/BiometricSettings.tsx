// ============================================================================
// /settings/biometric — attendance mode, the ZKTeco device connection, and the
// employee ↔ device-ID mappings. One screen, three concerns, all backed by the
// REAL /company-settings and /biometric APIs (no mock/demo data — a failed call
// surfaces as an error state, never invented rows).
//
// 1. Attendance mode — a company-wide Device | Manual switch. In Device mode the
//    terminal records attendance and employee self check-in is disabled; in
//    Manual mode employees check themselves in from the web app and the device
//    is ignored. It is a company_settings column driven through
//    `attendancePolicyApi` (the authenticated GET/PATCH /company-settings), never
//    the public branding endpoint — the device IP must not be public.
//
// 2. Device connection — IP / port / timeout for the machine, with a "Test
//    connection" button that validates the not-yet-saved values against the
//    device before HR commits them (the pattern from SmtpSettings). Saving a
//    connection also reconnects the real-time listener, so a new IP takes effect
//    without a server restart.
//
// 3. Mappings — the biometric_users table (employee ↔ device user ID), the thing
//    that actually lets a given employee punch. The endpoint returns every
//    mapping at once, so the parent-controlled DataTable is fed an
//    already-filtered, already-paged window (client-side), cloning the CRUD-list
//    shape from Departments.
//
// Everything that writes is gated on `company-settings.update`; the route itself
// is gated on HR_ADMIN_ROLES. A viewer without update sees the values read-only.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Cpu, Fingerprint, Plus, Pencil, Trash2, Wifi, Loader2, Check, Lock } from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import SearchableSelect, { type SelectOption } from "@/components/common/SearchableSelect";
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader } from "@/components/ui";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import { describeError } from "@/lib/describeError";
import { cn } from "@/lib/cn";
import {
  attendancePolicyApi,
  type AttendanceMode,
  type AttendancePolicy,
  type BiometricDeviceConfig,
} from "@/modules/settings/api/settingsApi";
import {
  biometricApi,
  type BiometricMapping,
  type DeviceTestResult,
} from "@/modules/settings/api/biometricApi";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";

// ---- pure helpers ----------------------------------------------------------

const MODE_OPTIONS: { value: AttendanceMode; label: string }[] = [
  { value: "Manual", label: "Manual" },
  { value: "Device", label: "Device" },
];

// Sensible editable defaults shown when no device has been configured yet; they
// match the ZKTeco factory defaults and the backend's own fallback.
const DEFAULT_PORT = "4370";
const DEFAULT_TIMEOUT = "10000";

const isValidPort = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
};

const isValidTimeout = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1000 && n <= 60000;
};

// Binary Device | Manual toggle — the same token-driven segmented control the
// Appearance page uses, so it themes with the rest of the kit.
function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: AttendanceMode;
  onChange: (mode: AttendanceMode) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="Attendance mode" className="inline-flex rounded-control bg-surface-muted p-1">
      {MODE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-9 rounded-control px-5 py-2 text-sm font-semibold transition",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function BiometricSettingsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const canView = hasPermission("company-settings.view");
  const canManage = hasPermission("company-settings.update");

  // ---- Attendance mode + device connection ---------------------------------
  const [mode, setMode] = useState<AttendanceMode>("Manual");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [timeout_, setTimeout_] = useState(DEFAULT_TIMEOUT);
  const [savedPolicy, setSavedPolicy] = useState<AttendancePolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DeviceTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const applyPolicy = useCallback((policy: AttendancePolicy) => {
    setMode(policy.mode);
    setIp(policy.device?.ip ?? "");
    setPort(policy.device ? String(policy.device.port) : DEFAULT_PORT);
    setTimeout_(policy.device?.timeout != null ? String(policy.device.timeout) : DEFAULT_TIMEOUT);
    setSavedPolicy(policy);
  }, []);

  const loadPolicy = useCallback(() => {
    setLoadingPolicy(true);
    setPolicyError(null);
    attendancePolicyApi
      .get()
      .then(applyPolicy)
      .catch((err) => setPolicyError(describeError(err)))
      .finally(() => setLoadingPolicy(false));
  }, [applyPolicy]);

  useEffect(() => {
    if (canView) loadPolicy();
    else setLoadingPolicy(false);
  }, [canView, loadPolicy]);

  // Compare the current form against the last-saved policy so Save only lights
  // up on a real change. A blank IP means "no device configured", which is why
  // the saved port/timeout collapse to the defaults for the comparison.
  const savedIp = savedPolicy?.device?.ip ?? "";
  const savedPort = savedPolicy?.device ? String(savedPolicy.device.port) : DEFAULT_PORT;
  const savedTimeout =
    savedPolicy?.device?.timeout != null ? String(savedPolicy.device.timeout) : DEFAULT_TIMEOUT;
  const dirty =
    savedPolicy != null &&
    (mode !== savedPolicy.mode ||
      ip.trim() !== savedIp ||
      port.trim() !== savedPort ||
      timeout_.trim() !== savedTimeout);

  const handleSave = async () => {
    // Validate the connection only when one is actually being configured — a
    // blank IP clears the device (Manual mode needs no terminal).
    if (ip.trim()) {
      if (!isValidPort(port)) {
        toast.showError("Invalid port", "Enter a port between 1 and 65535.");
        return;
      }
      if (timeout_.trim() && !isValidTimeout(timeout_)) {
        toast.showError("Invalid timeout", "Enter a timeout between 1000 and 60000 ms.");
        return;
      }
    }

    const device: BiometricDeviceConfig | null = ip.trim()
      ? {
          ip: ip.trim(),
          port: Number(port),
          ...(timeout_.trim() ? { timeout: Number(timeout_) } : {}),
        }
      : null;

    setSaving(true);
    try {
      const updated = await attendancePolicyApi.update({ mode, device });
      applyPolicy(updated);

      // A new IP/port only reaches the live listener once it re-reads the
      // config, so refresh it. Non-fatal: the supervised listener also retries
      // on its own, so a failure here is a soft warning, not a save failure.
      let reconnectFailed = false;
      if (device) {
        try {
          await biometricApi.reconnect();
        } catch {
          reconnectFailed = true;
        }
      }

      if (reconnectFailed) {
        toast.showError(
          "Saved — but the device listener didn't restart",
          "The connection will retry automatically. Use Test connection to verify the device.",
        );
      } else {
        toast.showSuccess("Attendance settings saved");
      }
    } catch (err) {
      toast.showError(
        "Couldn't save attendance settings",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canTest = canManage && !testing && (Boolean(ip.trim()) || Boolean(savedPolicy?.device));

  const handleTest = async () => {
    // Forward the not-yet-saved connection when it's complete, otherwise test
    // the device currently saved on company_settings.
    let override: BiometricDeviceConfig | undefined;
    const ipTrim = ip.trim();
    if (ipTrim && isValidPort(port)) {
      override = {
        ip: ipTrim,
        port: Number(port),
        ...(timeout_.trim() && isValidTimeout(timeout_) ? { timeout: Number(timeout_) } : {}),
      };
    }

    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const result = await biometricApi.testDevice(override);
      setTestResult(result);
      if (result.connected) {
        toast.showSuccess("Device reachable", `Connected to ${result.deviceIp}:${result.devicePort}.`);
      } else {
        toast.showError("Device not reachable", "The request completed but the device reported no connection.");
      }
    } catch (err) {
      // Show the server's own message verbatim — "connection refused" and a
      // read timeout call for different fixes.
      const message = err instanceof ApiError ? err.message : "The biometric device could not be reached.";
      setTestError(message);
      toast.showError("Device connection failed", message);
    } finally {
      setTesting(false);
    }
  };

  // ---- Employee ↔ device-ID mappings ---------------------------------------
  const [mappings, setMappings] = useState<BiometricMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [mappingsError, setMappingsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BiometricMapping | null>(null);
  const [formUserId, setFormUserId] = useState("");
  const [formDeviceUserId, setFormDeviceUserId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<BiometricMapping | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Employees for the "add" picker are loaded lazily the first time the modal
  // opens (see openAdd), then cached — the page is often used just to flip the
  // mode, and there's no reason to page the whole directory for that.
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  const loadMappings = useCallback(() => {
    setLoadingMappings(true);
    setMappingsError(null);
    biometricApi
      .listMappings()
      .then((rows) => setMappings(rows))
      .catch((err) => setMappingsError(describeError(err)))
      .finally(() => setLoadingMappings(false));
  }, []);

  useEffect(() => {
    if (canView) loadMappings();
    else setLoadingMappings(false);
  }, [canView, loadMappings]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter(
      (m) =>
        m.employeeName.toLowerCase().includes(q) ||
        m.employeeCode.toLowerCase().includes(q) ||
        m.deviceUserId.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [mappings, search]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Keep the page in range after a delete/filter shrinks the result set.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page, pageSize]);

  // A user can hold at most one mapping (the backend 409s on a second), so the
  // "add" picker hides everyone already mapped, active or not.
  const mappedUserIds = useMemo(
    () => new Set(mappings.map((m) => m.userId).filter(Boolean)),
    [mappings],
  );

  const employeeOptions = useMemo<SelectOption[]>(
    () =>
      employees
        .filter((e) => e.status && !mappedUserIds.has(e.user_id))
        .map((e) => ({ value: e.user_id, label: fullName(e) || e.email, hint: e.employee_code }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [employees, mappedUserIds],
  );

  const ensureEmployees = async () => {
    if (employeesLoaded || employeesLoading) return;
    setEmployeesLoading(true);
    try {
      const all: Employee[] = [];
      let current = 1;
      // The list endpoint caps `limit` at 100, so page through until every
      // employee is loaded — the picker filters client-side.
      for (;;) {
        const res = await employeeService.list({ page: current, limit: 100 });
        all.push(...res.data);
        if (res.data.length === 0 || current >= res.totalPages || current > 200) break;
        current += 1;
      }
      setEmployees(all);
      setEmployeesLoaded(true);
    } catch (err) {
      toast.showError("Couldn't load employees", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setEmployeesLoading(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setFormUserId("");
    setFormDeviceUserId("");
    setFormError(null);
    setModalOpen(true);
    void ensureEmployees();
  };

  const openEdit = (m: BiometricMapping) => {
    setEditing(m);
    setFormUserId(m.userId);
    setFormDeviceUserId(m.deviceUserId);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const deviceId = formDeviceUserId.trim();
    if (!editing && !formUserId) {
      setFormError("Select an employee.");
      return;
    }
    if (!deviceId) {
      setFormError("Enter the device user ID.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        // The employee is fixed while editing; only the device ID changes.
        await biometricApi.updateMapping(editing.biometricUserId, { deviceUserId: deviceId });
        toast.showSuccess("Mapping updated");
      } else {
        await biometricApi.createMapping({ userId: formUserId, deviceUserId: deviceId });
        toast.showSuccess("Employee mapped to device");
      }
      setModalOpen(false);
      loadMappings();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Please try again.";
      setFormError(message);
      toast.showError(editing ? "Couldn't update mapping" : "Couldn't create mapping", message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await biometricApi.deleteMapping(deleteTarget.biometricUserId);
      toast.showSuccess("Mapping removed");
      setDeleteTarget(null);
      loadMappings();
    } catch (err) {
      toast.showError("Couldn't remove mapping", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<BiometricMapping>[] = [
    {
      key: "employee",
      label: "Employee",
      render: (m) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{m.employeeName}</div>
          {m.employeeCode && <div className="text-xs text-muted">{m.employeeCode}</div>}
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      hideBelow: "md",
      render: (m) => <span className="text-muted">{m.email || "—"}</span>,
    },
    {
      key: "deviceUserId",
      label: "Device user ID",
      render: (m) => <span className="font-mono text-sm text-foreground">{m.deviceUserId}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (m) => <Badge tone={m.active ? "success" : "neutral"}>{m.active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  if (!canView) {
    return (
      <SettingsLayout activeTab="/settings/biometric">
        <Alert tone="warning" title="No access" icon={<Lock size={18} />}>
          You don't have permission to view biometric settings.
        </Alert>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout activeTab="/settings/biometric">
      <div className="space-y-6">
        {canView && !canManage && (
          <Alert tone="info">
            You can view these settings but need the <span className="font-medium">company-settings.update</span>{" "}
            permission to change the mode, device, or mappings.
          </Alert>
        )}

        {/* Section 1 — attendance mode + device connection */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-brand" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Attendance mode &amp; device</h2>
                <p className="text-sm text-muted">Choose how attendance is captured and connect the terminal.</p>
              </div>
            </div>
          </CardHeader>

          <CardBody>
            {loadingPolicy ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted">
                <Loader2 size={16} className="animate-spin" />
                Loading settings…
              </div>
            ) : policyError ? (
              <Alert tone="error" title="Couldn't load settings">
                <div className="flex flex-col gap-3">
                  <span>{policyError}</span>
                  <Button variant="outline" size="sm" onClick={loadPolicy} className="self-start">
                    Retry
                  </Button>
                </div>
              </Alert>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="mb-2 text-[15px] font-medium text-foreground">Attendance mode</div>
                  <ModeToggle value={mode} onChange={setMode} disabled={!canManage || saving} />
                  <p className="mt-2 text-sm text-muted">
                    {mode === "Device"
                      ? "Attendance is recorded on the biometric terminal. Employee self check-in is disabled company-wide."
                      : "Employees check themselves in and out from the web app. The biometric device is ignored."}
                  </p>
                </div>

                <div>
                  <div className="mb-2 text-[15px] font-medium text-foreground">Device connection</div>
                  <div className="grid gap-x-4 sm:grid-cols-3">
                    <FormField
                      label="IP address"
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      placeholder="192.168.100.73"
                      disabled={!canManage}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <FormField
                      label="Port"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder={DEFAULT_PORT}
                      disabled={!canManage}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <FormField
                      label="Timeout (ms)"
                      value={timeout_}
                      onChange={(e) => setTimeout_(e.target.value)}
                      placeholder={DEFAULT_TIMEOUT}
                      disabled={!canManage}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </div>

                  {mode === "Device" && !ip.trim() && (
                    <Alert tone="warning" className="mt-1">
                      No device IP is set — the server will fall back to its default terminal. Enter the device's IP
                      so punches are read from your machine.
                    </Alert>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      leftIcon={<Wifi size={16} />}
                      loading={testing}
                      disabled={!canTest}
                      onClick={handleTest}
                    >
                      Test connection
                    </Button>
                    {testResult?.connected && (
                      <span className="text-sm font-medium text-success">
                        Connected to {testResult.deviceIp}:{testResult.devicePort}
                      </span>
                    )}
                  </div>

                  {testError && (
                    <Alert tone="error" title="Device connection failed" className="mt-3">
                      <span className="font-mono text-xs">{testError}</span>
                    </Alert>
                  )}
                </div>
              </div>
            )}
          </CardBody>

          {canManage && !loadingPolicy && !policyError && (
            <CardFooter>
              <Button
                variant="primary"
                leftIcon={<Check size={16} />}
                loading={saving}
                disabled={!dirty}
                onClick={handleSave}
              >
                Save changes
              </Button>
            </CardFooter>
          )}
        </Card>

        {/* Section 2 — employee ↔ device-ID mappings */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Fingerprint size={18} className="text-brand" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Device mappings</h2>
              <p className="text-sm text-muted">
                Link each employee to their ID on the terminal so their punches are recorded against them.
              </p>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(m) => m.biometricUserId}
            loading={loadingMappings}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, code, email or device ID…"
            emptyIcon={Fingerprint}
            emptyTitle="No device mappings"
            emptyDescription={
              canManage ? "Map an employee to their device ID to get started." : "No employees are mapped yet."
            }
            error={mappingsError}
            onRetry={loadMappings}
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            actions={
              canManage
                ? (m) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        aria-label={`Edit mapping for ${m.employeeName}`}
                        className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(m)}
                        aria-label={`Remove mapping for ${m.employeeName}`}
                        className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-error-tint hover:text-error"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                : undefined
            }
            toolbarRight={
              canManage ? (
                <Button variant="primary" size="sm" leftIcon={<Plus size={16} />} onClick={openAdd}>
                  Add mapping
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Add / edit mapping */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit device mapping" : "Add device mapping"}
        description={
          editing
            ? "Update the device user ID for this employee."
            : "Link an employee to their user ID on the biometric terminal."
        }
      >
        <form onSubmit={handleSubmit}>
          {editing ? (
            <div className="mb-5">
              <span className="mb-2 block text-[15px] font-medium text-foreground">Employee</span>
              <div className="rounded-control bg-surface-muted px-4 py-3 text-sm">
                <div className="font-medium text-foreground">{editing.employeeName}</div>
                {editing.employeeCode && <div className="text-xs text-muted">{editing.employeeCode}</div>}
              </div>
            </div>
          ) : (
            <div className="mb-5">
              <span className="mb-2 block text-[15px] font-medium text-foreground">Employee</span>
              <SearchableSelect
                options={employeeOptions}
                value={formUserId}
                onChange={setFormUserId}
                placeholder={employeesLoading ? "Loading employees…" : "Select an employee"}
                searchPlaceholder="Search employees…"
                disabled={employeesLoading}
                emptyMessage={employeesLoading ? "Loading…" : "No unmapped employees"}
              />
            </div>
          )}

          <FormField
            label="Device user ID"
            value={formDeviceUserId}
            onChange={(e) => setFormDeviceUserId(e.target.value)}
            placeholder="e.g. 58"
            autoComplete="off"
          />

          {formError && <p className="-mt-2 mb-4 text-sm text-error">{formError}</p>}

          <div className="mt-2 flex gap-3">
            <Button type="button" variant="secondary" size="lg" shape="pill" fullWidth onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <PrimaryButton loading={submitting}>{editing ? "Save changes" : "Add mapping"}</PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Remove mapping confirmation */}
      <ConfirmDialog
        open={deleteTarget != null}
        title="Remove device mapping"
        description={
          deleteTarget
            ? `${deleteTarget.employeeName} will no longer be recognised by the terminal until re-mapped.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        icon={<Trash2 size={20} className="text-error" />}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SettingsLayout>
  );
}
