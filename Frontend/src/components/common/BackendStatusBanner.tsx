import { Info, Loader2 } from "lucide-react";
import type { BackendStatus } from "@/hooks/useBackendStatus";
import { DEMO_CREDENTIALS } from "@/modules/auth/mocks/authMockData";

export default function BackendStatusBanner({ status }: { status: BackendStatus }) {
 if (status === "online") return null;

 if (status === "checking") {
 return (
 <div className="mb-5 flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-500">
 <Loader2 size={16} className="animate-spin" />
 Checking connection to server…
 </div>
 );
 }

 return (
 <div className="mb-5 flex items-start gap-2 rounded-lg border border-brand/40 bg-brand-light/50 px-4 py-3 text-sm text-gray-700">
 <Info size={16} className="mt-0.5 shrink-0 text-brand-dark" />
 <span>
 Backend isn't connected — you're in <strong>demo mode</strong> using hardcoded sample
 data, so the form still works. Try{" "}
 <strong>
 {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
 </strong>{" "}
 (a Team Lead account, so the Team Lead workspace in the sidebar is visible too), or{" "}
 <strong>admin@technocues.com / Admin@1234</strong> (an Administrator account, to see the
 Settings workspace) to log in, or sign up with any new details.
 </span>
 </div>
 );
}
