import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui";
import type { BackendStatus } from "@/hooks/useBackendStatus";

// Token-driven via the kit `Alert`, so the offline/checking states pick up the
// themed status colours (and dark mode) instead of hardcoded amber/gray.
export default function BackendStatusBanner({ status }: { status: BackendStatus }) {
 if (status === "online") return null;

 if (status === "checking") {
 return (
 <Alert
 tone="info"
 className="mb-5"
 icon={<Loader2 size={18} className="animate-spin" aria-hidden />}
 >
 Checking connection to server…
 </Alert>
 );
 }

 return (
 <Alert tone="warning" className="mb-5">
 Can't reach the server right now — some data may be unavailable. Check your
 connection and try again in a moment.
 </Alert>
 );
}
