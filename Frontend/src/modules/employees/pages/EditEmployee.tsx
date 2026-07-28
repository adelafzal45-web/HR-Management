import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserX } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import EmployeeForm from "@/modules/employees/components/EmployeeForm";
import EmptyState from "@/components/common/EmptyState";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { useToast } from "@/app/providers/ToastContext";

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div className="hidden space-y-2 lg:block">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-5 h-5 w-40 animate-pulse rounded bg-gray-100" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[...Array(4)].map((__, j) => (
                <div key={j} className="h-12 animate-pulse rounded-lg bg-gray-100" style={{ animationDelay: `${j * 40}ms` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EditEmployeePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
    <DashboardLayout title="Edit Employee" activeKey="employees">
      <div className="mb-5">
        <BackButton fallback="/employees" label="Back to Employees" className="mb-3" />
        <p className="text-sm text-gray-500">
          {employee ? `Update ${employee.firstName} ${employee.lastName}'s record.` : "Update this employee's record."}
        </p>
      </div>

      {loading ? (
        <FormSkeleton />
      ) : notFound || !employee ? (
        <EmptyState icon={UserX} title="Employee not found" description="This employee record may have been deleted or the link is out of date." />
      ) : (
        <EmployeeForm mode="edit" employee={employee} onCancel={() => navigate("/employees")} onSaved={() => navigate("/employees")} />
      )}
    </DashboardLayout>
  );
}
