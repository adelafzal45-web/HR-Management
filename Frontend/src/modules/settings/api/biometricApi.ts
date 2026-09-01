// Biometric device administration client for the Settings workspace.
//
// Talks to the real /biometric controller through the shared transport in
// lib/apiClient — same JWT bearer, refresh replay and timeout as the rest of
// the app, and the same rule as settingsApi: NO demo/mock fallback. A failed
// request surfaces as an ApiError the Biometric screen renders as its own error
// state; inventing rows here would hide exactly the failures HR needs to see.
//
// The device connection (ip/port/timeout) and the company-wide attendance mode
// are NOT owned here — they are company_settings columns driven through
// `attendancePolicyApi` in ./settingsApi. This client owns only the employee ↔
// device-ID mappings and the two device operations (test, reconnect).
//
// Field naming: the backend DTOs are snake_case (device_user_id, user_id); this
// module converts at the request/response boundary so the rest of the frontend
// works in camelCase, exactly like the sibling modules in settingsApi.
import { apiRequest, normalizeListResult } from "@/lib/apiClient";
import type { BiometricDeviceConfig } from "./settingsApi";

// ---- Frontend shapes -------------------------------------------------------

/** One employee ↔ device-ID mapping, flattened for the table and forms. */
export type BiometricMapping = {
  biometricUserId: string;
  deviceUserId: string;
  active: boolean;
  userId: string;
  employeeName: string;
  employeeCode: string;
  email: string;
  createdAt: string;
};

/** Result of a "Test connection" call. `info` is opaque device passthrough. */
export type DeviceTestResult = {
  connected: boolean;
  deviceIp: string;
  devicePort: number;
  info: unknown;
};

// ---- Wire shapes (snake_case, as returned by the controller) ---------------

type ApiBiometricUser = {
  biometric_user_id: string;
  device_user_id: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  user?: {
    user_id?: string;
    employee_code?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
};

type ApiDeviceTestResult = {
  connected?: boolean;
  device_ip?: string;
  device_port?: number;
  info?: unknown;
};

const fromApiMapping = (raw: ApiBiometricUser): BiometricMapping => ({
  biometricUserId: raw.biometric_user_id,
  deviceUserId: raw.device_user_id,
  active: raw.active ?? true,
  userId: raw.user?.user_id ?? "",
  employeeName:
    [raw.user?.first_name, raw.user?.last_name].filter(Boolean).join(" ").trim() ||
    "—",
  employeeCode: raw.user?.employee_code ?? "",
  email: raw.user?.email ?? "",
  createdAt: raw.created_at ?? "",
});

const fromApiTestResult = (raw: ApiDeviceTestResult): DeviceTestResult => ({
  connected: raw.connected ?? false,
  deviceIp: raw.device_ip ?? "",
  devicePort: raw.device_port ?? 0,
  info: raw.info ?? null,
});

export const biometricApi = {
  // GET /biometric — every mapping, newest first, each with its employee.
  listMappings: () =>
    apiRequest<unknown>("/biometric").then((raw) =>
      normalizeListResult<ApiBiometricUser>(raw).data.map(fromApiMapping),
    ),

  // GET /biometric/user/:userId — the one mapping for an employee, or null.
  // Used by the employee form to prefill the device-ID field.
  getByUser: (userId: string) =>
    apiRequest<ApiBiometricUser | null>(
      `/biometric/user/${encodeURIComponent(userId)}`,
    ).then((raw) => (raw ? fromApiMapping(raw) : null)),

  // POST /biometric — map an employee to a device user ID.
  createMapping: (input: { userId: string; deviceUserId: string }) =>
    apiRequest<ApiBiometricUser>("/biometric", {
      method: "POST",
      body: { user_id: input.userId, device_user_id: input.deviceUserId },
    }).then(fromApiMapping),

  // PATCH /biometric/:id — change the device ID (and/or the employee) on a map.
  updateMapping: (id: string, input: { deviceUserId?: string; userId?: string }) =>
    apiRequest<ApiBiometricUser>(`/biometric/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: {
        device_user_id: input.deviceUserId,
        user_id: input.userId,
      },
    }).then(fromApiMapping),

  // PATCH /biometric/:id/deactivate — keep the row, stop it accepting punches.
  deactivateMapping: (id: string) =>
    apiRequest<{ message: string }>(
      `/biometric/${encodeURIComponent(id)}/deactivate`,
      { method: "PATCH" },
    ),

  // DELETE /biometric/:id — remove the mapping entirely.
  deleteMapping: (id: string) =>
    apiRequest<{ message: string }>(`/biometric/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // POST /biometric/device/test — no override tests the currently saved device;
  // an override validates an unsaved ip/port/timeout before HR commits it.
  testDevice: (override?: BiometricDeviceConfig) =>
    apiRequest<ApiDeviceTestResult>("/biometric/device/test", {
      method: "POST",
      body: override ?? {},
    }).then(fromApiTestResult),

  // POST /biometric/device/reconnect — re-read the saved config and restart the
  // real-time listener (call after saving a new device IP/port).
  reconnect: () =>
    apiRequest<{ message: string }>("/biometric/device/reconnect", {
      method: "POST",
    }),
};
