// ============================================================================
// Backend reachability ping.
//
// Lifted out of the old `api/client.ts` (the demo-fallback transport, now
// retired) so that `useBackendStatus` — and the status banner it drives — no
// longer depend on that module. This is purely "is anything listening?", used
// to show a neutral "can't reach the server" notice; it is NOT used to decide
// whether to serve fake data. There is no demo fallback anywhere any more.
// ============================================================================

import { API_BASE_URL } from "./apiBaseUrl";

/**
 * Lightweight reachability check.
 *
 * The NestJS API only guarantees a root `GET /api` route — there is no
 * dedicated `/health` endpoint — so we ping the base URL itself. Any response,
 * even a 4xx, means the server process is up; we only care whether it is
 * reachable at all, not whether this exact route exists. A 5xx or a thrown
 * fetch (DNS / connection refused / timeout) counts as unreachable.
 */
export async function checkBackendConnection(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}`, {
      method: "GET",
      signal: controller.signal,
    });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
