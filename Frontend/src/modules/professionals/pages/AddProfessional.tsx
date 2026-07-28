import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import ProfessionalForm from "@/modules/professionals/components/ProfessionalForm";

export default function AddProfessionalPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout title="Add Professional" activeKey="professionals">
      <div className="mb-5">
        <p className="text-sm text-gray-500">Create a new professional record — organized into personal, employment, and account details.</p>
      </div>
      <ProfessionalForm mode="create" onCancel={() => navigate("/professionals")} onSaved={() => navigate("/professionals")} />
    </DashboardLayout>
  );
}
