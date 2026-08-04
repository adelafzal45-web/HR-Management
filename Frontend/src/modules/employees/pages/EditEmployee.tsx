import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserX } from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import EmptyState from "@/components/common/EmptyState";
import { ApiError } from "@/lib/apiClient";

import EmployeeForm from "@/modules/employees/components/EmployeeForm";
import { EmployeeFormSkeleton } from "@/modules/employees/components/EmployeeFormShell";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";

export default function EditEmployeePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setEmployee(await employeeService.get(employeeId));
    } catch (error) {
      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Couldn't load this employee record.",
      );
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="Edit Employee" activeKey="employees">
      <div className="mb-5">
        <BackButton fallback="/employees" label="Back to Employees" className="mb-3" />
        <p className="text-sm text-gray-500">
          {employee
            ? `Update ${fullName(employee)}'s record (${employee.employee_code}).`
            : "Update this employee's record."}
        </p>
      </div>

      {loading ? (
        <EmployeeFormSkeleton />
      ) : loadError || !employee ? (
        <EmptyState
          icon={UserX}
          title="Employee not found"
          description={
            loadError ??
            "This employee record may have been deleted, or the link is out of date."
          }
          actionLabel="Back to Employees"
          onAction={() => navigate("/employees")}
        />
      ) : (
        <EmployeeForm
          mode="edit"
          employee={employee}
          onCancel={() => navigate(`/employees/${employee.user_id}`)}
          onSaved={(saved) => navigate(`/employees/${saved.user_id}`)}
        />
      )}
    </DashboardLayout>
  );
}
