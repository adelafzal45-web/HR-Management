import { useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Pencil,
  Mail,
  Phone,
  MapPin,
  Cake,
  Wallet,
  Building2,
  IdCard,
  Clock,
  Tags,
  UserCog,
  UserX,
  ShieldAlert,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import EmployeeAttendanceTab from "@/modules/employees/components/EmployeeAttendanceTab";
import EmployeeLeaveTab from "@/modules/employees/components/EmployeeLeaveTab";
import EmployeePayrollTab from "@/modules/employees/components/EmployeePayrollTab";
import { useToast } from "@/app/providers/ToastContext";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";

type TabKey = "profile" | "attendance" | "leave" | "payroll";

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  intern: "Intern",
};

function DetailRow({ icon: Icon, label, value }: { icon: ElementType; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="truncate text-sm font-medium text-gray-800">{value || "—"}</p>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="h-16 w-16 animate-pulse rounded-full bg-gray-100" />
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4 h-4 w-32 animate-pulse rounded bg-gray-100" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...Array(4)].map((__, j) => (
              <div key={j} className="h-10 animate-pulse rounded-lg bg-gray-100" style={{ animationDelay: `${j * 40}ms` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ViewEmployeePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>("profile");

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    setNotFound(false);
    employeesApi
      .getById(employeeId)
      .then((emp) => setEmployee(emp))
      .catch(() => {
        setNotFound(true);
        toast.showError("Couldn't load that employee.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <DashboardLayout title="Employee Details" activeKey="employees">
      <div className="mb-5 flex items-center justify-between gap-3">
        <BackButton fallback="/employees" label="Back to Employees" />
        {employee && (
          <button
            type="button"
            onClick={() => navigate(`/employees/${employee.employeeId}/edit`)}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {loading ? (
        <DetailSkeleton />
      ) : notFound || !employee ? (
        <EmptyState icon={UserX} title="Employee not found" description="This employee record may have been deleted or the link is out of date." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-light text-xl font-semibold text-brand-dark">
                {employee.firstName[0]}
                {employee.lastName[0]}
              </span>
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {employee.firstName} {employee.lastName}
                </p>
                <p className="text-sm text-gray-400">{employee.employeeCode}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {employee.designationName} · {employee.departmentName}
                </p>
              </div>
            </div>
            <StatusBadge status={employee.status} />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1 sm:w-fit">
            <button
              type="button"
              onClick={() => setTab("profile")}
              className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
                tab === "profile" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => setTab("attendance")}
              className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
                tab === "attendance" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Attendance
            </button>
            <button
              type="button"
              onClick={() => setTab("leave")}
              className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
                tab === "leave" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Leave
            </button>
            <button
              type="button"
              onClick={() => setTab("payroll")}
              className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
                tab === "payroll" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Payroll
            </button>
          </div>

          {tab === "attendance" ? (
            <EmployeeAttendanceTab employeeId={employee.employeeId} />
          ) : tab === "leave" ? (
            <EmployeeLeaveTab employeeId={employee.employeeId} />
          ) : tab === "payroll" ? (
            <EmployeePayrollTab employee={employee} />
          ) : (
          <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Contact & Personal</h3>
            <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
              <DetailRow icon={Mail} label="Email" value={employee.email} />
              <DetailRow icon={Phone} label="Phone" value={employee.phone} />
              <DetailRow
                icon={Cake}
                label="Date of Birth"
                value={`${new Date(employee.dateOfBirth).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })} · ${employee.gender}`}
              />
              <DetailRow icon={MapPin} label="Address" value={employee.address} />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Employment</h3>
            <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
              <DetailRow icon={Building2} label="Department" value={employee.departmentName} />
              <DetailRow icon={IdCard} label="Designation" value={employee.designationName} />
              <DetailRow icon={UserCog} label="Reports To" value={employee.managerName} />
              <DetailRow icon={Tags} label="Job Category / Type" value={`${employee.jobCategoryName} · ${EMPLOYMENT_TYPE_LABEL[employee.employmentType]}`} />
              <DetailRow icon={Clock} label="Shift" value={employee.shiftName} />
              <DetailRow
                icon={Cake}
                label="Joined"
                value={new Date(employee.joiningDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Payroll & Access</h3>
            <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
              <DetailRow
                icon={Wallet}
                label="Salary"
                value={`${employee.salary.toLocaleString()} / month${employee.overtimeAllowed ? " · OT allowed" : ""}`}
              />
              <DetailRow icon={ShieldAlert} label="Role" value={employee.roleName} />
            </div>
          </div>
          </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
