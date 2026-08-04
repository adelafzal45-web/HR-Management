import { useEffect, useRef, useState } from "react";
import { checkBackendConnection } from "@/api/client";

export type BackendStatus = "checking" | "online" | "offline";

/**
 * Polls the backend every `intervalMs` so every screen always knows,
 * in real time, whether the backend is attached or not.
 */
export function useBackendStatus(intervalMs = 8000) {
 const [status, setStatus] = useState<BackendStatus>("checking");
 const mounted = useRef(true);

 useEffect(() => {
 mounted.current = true;

 const run = async () => {
 const ok = await checkBackendConnection();
 if (mounted.current) setStatus(ok ? "online" : "offline");
 };

 run();
 const id = setInterval(run, intervalMs);

 return () => {
 mounted.current = false;
 clearInterval(id);
 };
 }, [intervalMs]);

 return status;
}
