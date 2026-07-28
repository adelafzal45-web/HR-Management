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
        <p className="text-sm text-gray-500">Create a new employee record — organized into personal, employment, and account details.</p>
      </div>
      <EmployeeForm mode="create" onCancel={() => navigate("/employees")} onSaved={() => navigate("/employees")} />
    </DashboardLayout>
  );
}
