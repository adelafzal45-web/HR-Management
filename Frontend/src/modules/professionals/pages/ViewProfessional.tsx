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
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import { useToast } from "@/app/providers/ToastContext";
import { professionalsApi, type Professional } from "@/modules/professionals/api/professionalApi";

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

export default function ViewProfessionalPage() {
  const { professionalId } = useParams<{ professionalId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [professional, setProfessional] = useState<Professional | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!professionalId) return;
    setLoading(true);
    setNotFound(false);
    professionalsApi
      .getById(professionalId)
      .then((emp) => setProfessional(emp))
      .catch(() => {
        setNotFound(true);
        toast.showError("Couldn't load that professional.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalId]);

  return (
    <DashboardLayout title="Professional Details" activeKey="professionals">
      <div className="mb-5 flex items-center justify-between gap-3">
        <BackButton fallback="/professionals" label="Back to Professionals" />
        {professional && (
          <button
            type="button"
            onClick={() => navigate(`/professionals/${professional.professionalId}/edit`)}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {loading ? (
        <DetailSkeleton />
      ) : notFound || !professional ? (
        <EmptyState icon={UserX} title="Professional not found" description="This professional record may have been deleted or the link is out of date." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <EmployeeAvatar
                firstName={professional.firstName}
                lastName={professional.lastName}
                photo={professional.profileImageUrl}
                thumb={professional.profileImageThumbUrl}
                size={64}
              />
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {professional.firstName} {professional.lastName}
                </p>
                <p className="text-sm text-gray-400">{professional.professionalCode}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {professional.designationName} · {professional.departmentName}
                </p>
              </div>
            </div>
            <StatusBadge status={professional.status} />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Contact & Personal</h3>
            <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
              <DetailRow icon={Mail} label="Email" value={professional.email} />
              <DetailRow icon={Phone} label="Phone" value={professional.phone} />
              <DetailRow
                icon={Cake}
                label="Date of Birth"
                value={`${new Date(professional.dateOfBirth).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })} · ${professional.gender}`}
              />
              <DetailRow icon={MapPin} label="Address" value={professional.address} />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Employment</h3>
            <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
              <DetailRow icon={Building2} label="Department" value={professional.departmentName} />
              <DetailRow icon={IdCard} label="Designation" value={professional.designationName} />
              <DetailRow icon={UserCog} label="Reports To" value={professional.managerName} />
              <DetailRow icon={Tags} label="Job Category / Type" value={`${professional.jobCategoryName} · ${EMPLOYMENT_TYPE_LABEL[professional.employmentType]}`} />
              <DetailRow icon={Clock} label="Shift" value={professional.shiftName} />
              <DetailRow
                icon={Cake}
                label="Joined"
                value={new Date(professional.joiningDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Payroll & Access</h3>
            <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
              <DetailRow
                icon={Wallet}
                label="Salary"
                value={`${professional.salary.toLocaleString()} / month${professional.overtimeAllowed ? " · OT allowed" : ""}`}
              />
              <DetailRow icon={ShieldAlert} label="Role" value={professional.roleName} />
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
