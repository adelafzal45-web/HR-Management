import { Info, Loader2 } from "lucide-react";
import type { BackendStatus } from "@/hooks/useBackendStatus";

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
 <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
 <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
 <span>
 Can't reach the server right now — some data may be unavailable. Check your
 connection and try again in a moment.
 </span>
 </div>
 );
}
