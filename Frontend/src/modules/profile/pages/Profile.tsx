// ============================================================================
// /profile — the signed-in employee's own record, read-only (spec sections 9, 10).
//
// Every field here comes from GET /users/me/profile, which needs no `employees.*`
// permission: an employee may always read their own record. The page deliberately
// shows HR-controlled data (department, designation, salary, shift, joining date)
// alongside the self-editable fields, but only the latter are reachable from the
// Edit button — seeing your own employment details and being able to change them
// are different things, and the backend allow-list enforces the difference.
//
// "My Team" renders only for someone who actually leads people; GET /users/me/team
// returns an empty page for everyone else, so there is no role check here.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Building2,
  Cake,
  CalendarDays,
  Clock,
  Droplet,
  IdCard,
  KeyRound,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
  Tags,
  UserRound,
  Users,
} from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";

import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import { myProfileService } from "@/modules/employees/api/employeeService";
import {
  fullName,
  type Employee,
  type LeaveBalance,
} from "@/modules/employees/types/employee.types";

/** Long-form date. Invalid or absent values collapse to an em dash upstream. */
function formatDate(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Joins the structured address, falling back to the legacy free-text column.
 *
 * Records created before the structured fields existed only have `address`, so
 * ignoring it would show "—" for employees whose address is on file.
 */
function formatAddress(employee: Employee): string {
  const parts = [
    employee.street_address,
    employee.city,
    employee.state_province,
    employee.postal_code,
    employee.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : (employee.address ?? "");
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="break-words text-sm font-medium text-gray-800">{value || "—"}</p>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="h-20 w-20 animate-pulse rounded-full bg-gray-100" />
        <div className="space-y-2">
          <div className="h-4 w-44 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-28 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4 h-4 w-32 animate-pulse rounded bg-gray-100" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                className="h-10 animate-pulse rounded-lg bg-gray-100"
                style={{ animationDelay: `${j * 40}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { showError } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [team, setTeam] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The profile is the only required call. Leave balances and team are
      // supporting panels: settled separately so a failure in either leaves
      // the profile itself rendered rather than blanking the whole page.
      const profile = await myProfileService.get();
      setEmployee(profile);

      const [balanceResult, teamResult] = await Promise.allSettled([
        myProfileService.leaveBalances(),
        myProfileService.team({ page: 1, limit: 50 }),
      ]);
      setBalances(balanceResult.status === "fulfilled" ? balanceResult.value : []);
      setTeam(teamResult.status === "fulfilled" ? teamResult.value.data : []);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Couldn't load your profile.";
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="My Profile" activeKey="profile">
      <BackendStatusBanner status={status} />

      {loading ? (
        <ProfileSkeleton />
      ) : error || !employee ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
        >
          {error ?? "Couldn't load your profile."}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ---- Identity header ---- */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <EmployeeAvatar
                  firstName={employee.first_name}
                  lastName={employee.last_name}
                  photo={employee.profile_image}
                  thumb={employee.profile_image_thumb}
                  size={80}
                />
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-semibold text-gray-900">
                    {fullName(employee)}
                  </h1>
                  <p className="truncate text-sm text-gray-500">
                    {employee.designation?.title ?? "—"}
                    {employee.department?.department_name
                      ? ` · ${employee.department.department_name}`
                      : ""}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <IdCard size={13} />
                    {employee.employee_code}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/profile/edit")}
                  className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                >
                  <Pencil size={14} />
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/change-password")}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  <KeyRound size={14} />
                  Change Password
                </button>
              </div>
            </div>
          </section>

          {/* ---- Contact ---- */}
          <Card title="Contact">
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailRow icon={Mail} label="Email" value={employee.email} />
              <DetailRow icon={Phone} label="Phone" value={employee.phone} />
              <DetailRow icon={MapPin} label="Address" value={formatAddress(employee)} />
            </div>
          </Card>

          {/* ---- Personal ---- */}
          <Card title="Personal">
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailRow
                icon={Cake}
                label="Date of Birth"
                value={formatDate(employee.date_of_birth)}
              />
              <DetailRow icon={UserRound} label="Gender" value={employee.gender} />
              <DetailRow icon={Droplet} label="Blood Group" value={employee.blood_group} />
            </div>
          </Card>

          {/* ---- Emergency contact ---- */}
          <Card title="Emergency Contact">
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailRow
                icon={ShieldAlert}
                label="Name"
                value={employee.emergency_contact_name}
              />
              <DetailRow
                icon={Users}
                label="Relationship"
                value={employee.emergency_contact_relationship}
              />
              <DetailRow
                icon={Phone}
                label="Phone"
                value={employee.emergency_contact_phone}
              />
            </div>
          </Card>

          {/* ---- Employment: HR-controlled, shown but not editable here ---- */}
          <Card title="Employment">
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DetailRow
                icon={Building2}
                label="Department"
                value={employee.department?.department_name}
              />
              <DetailRow
                icon={Briefcase}
                label="Designation"
                value={employee.designation?.title}
              />
              <DetailRow icon={Tags} label="Employment Type" value={employee.employee_type} />
              <DetailRow
                icon={CalendarDays}
                label="Joining Date"
                value={formatDate(employee.joining_date)}
              />
              <DetailRow icon={Clock} label="Shift" value={employee.shift?.shift_name} />
              <DetailRow
                icon={Users}
                label="Team Lead"
                value={employee.teamLead ? fullName(employee.teamLead) : ""}
              />
            </div>
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400">
              These details are maintained by HR. Contact your HR team if something looks
              wrong.
            </p>
          </Card>

          {/* ---- Leave balances ---- */}
          {balances.length > 0 && (
            <Card title="Leave Balances">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-2 font-medium">Leave Type</th>
                      <th className="pb-2 text-right font-medium">Allocated</th>
                      <th className="pb-2 text-right font-medium">Used</th>
                      <th className="pb-2 text-right font-medium">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {balances.map((balance) => (
                      <tr key={balance.user_leave_balance_id}>
                        <td className="py-2.5 font-medium text-gray-800">
                          {balance.leaveType?.name ?? "Leave"}
                        </td>
                        <td className="py-2.5 text-right text-gray-600">
                          {balance.allocated_days}
                        </td>
                        <td className="py-2.5 text-right text-gray-600">
                          {balance.used_days}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-brand-dark">
                          {balance.remaining_days}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ---- My Team: present only for someone who leads people ---- */}
          {team.length > 0 && (
            <Card title={`My Team (${team.length})`}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {team.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 rounded-xl bg-gray-50 p-3"
                  >
                    <EmployeeAvatar
                      firstName={member.first_name}
                      lastName={member.last_name}
                      photo={member.profile_image}
                      thumb={member.profile_image_thumb}
                      size={40}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {fullName(member)}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {member.designation?.title ?? member.employee_code}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
