import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserX } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import ProfessionalForm from "@/modules/professionals/components/ProfessionalForm";
import EmptyState from "@/components/common/EmptyState";
import { professionalsApi, type Professional } from "@/modules/professionals/api/professionalApi";
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

export default function EditProfessionalPage() {
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
    <DashboardLayout title="Edit Professional" activeKey="professionals">
      <div className="mb-5">
        <p className="text-sm text-gray-500">
          {professional ? `Update ${professional.firstName} ${professional.lastName}'s record.` : "Update this professional's record."}
        </p>
      </div>

      {loading ? (
        <FormSkeleton />
      ) : notFound || !professional ? (
        <EmptyState icon={UserX} title="Professional not found" description="This professional record may have been deleted or the link is out of date." />
      ) : (
        <ProfessionalForm mode="edit" professional={professional} onCancel={() => navigate("/professionals")} onSaved={() => navigate("/professionals")} />
      )}
    </DashboardLayout>
  );
}
