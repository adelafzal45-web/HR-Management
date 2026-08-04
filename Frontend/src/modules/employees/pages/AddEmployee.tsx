import { useNavigate } from "react-router-dom";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import EmployeeForm from "@/modules/employees/components/EmployeeForm";

export default function AddEmployeePage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout title="Add Employee" activeKey="employees">
      <div className="mb-5">
        <BackButton fallback="/employees" label="Back to Employees" className="mb-3" />
        <p className="text-sm text-gray-500">
          Create a new employee record — personal details, employment, leave and
          account access.
        </p>
      </div>

      <EmployeeForm
        mode="create"
        onCancel={() => navigate("/employees")}
        // Land on the new employee rather than the list: the code was generated
        // server-side, so this is the first chance to actually see it.
        onSaved={(employee) => navigate(`/employees/${employee.user_id}`)}
      />
    </DashboardLayout>
  );
}
