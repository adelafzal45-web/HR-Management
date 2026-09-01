/**
 * Company-wide attendance policy + biometric device connection.
 *
 * `attendance_mode` is the org-level switch between manual attendance (employees
 * clock in/out themselves; HR may mark/correct) and device attendance (a physical
 * ZKTeco terminal records punches and self check-in is disabled). It is a scalar
 * column with a DB CHECK, mirroring `attendance/attendance-source.ts`.
 *
 * `BiometricDeviceConfig` is the connection the real-time listener dials, stored
 * as one nullable jsonb blob on `company_settings.biometric_device` (mirroring
 * `theme_config`). Null means "not configured yet" and the biometric service
 * falls back to its built-in defaults. It is deliberately NOT part of the public
 * branding payload — a device address is internal.
 *
 * Validation of an incoming object lives in `dto/biometric-device.dto.ts`; this
 * file is the read-side type used by the entity and service.
 */

export const ATTENDANCE_MODES = ['Device', 'Manual'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

/**
 * Manual by default: applying this to an existing install changes no behaviour —
 * employees keep clocking in themselves until HR opts into Device on the
 * Biometric settings screen.
 */
export const DEFAULT_ATTENDANCE_MODE: AttendanceMode = 'Manual';

export interface BiometricDeviceConfig {
  /** Device IP address on the local network, e.g. 192.168.100.73. */
  ip: string;
  /** TCP port the ZKTeco SDK connects on (device default is 4370). */
  port: number;
  /** Socket timeout in ms; optional — the service default applies when omitted. */
  timeout?: number;
}
