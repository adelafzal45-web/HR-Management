// ============================================================================
// Where the frontend sends its API requests.
//
// Vite inlines `import.meta.env.VITE_*` at **build** time, not runtime — the
// string is substituted into the bundle by `npm run build` and cannot be
// corrected afterwards without rebuilding. That makes a wrong value expensive,
// which is why the fallback below matters as much as the variable itself.
//
// This used to be written out twice, in `api/client.ts` and `lib/apiClient.ts`,
// each falling back to `http://localhost:3000/api`. On a deployed site that
// fallback is actively harmful: `localhost` resolves on *the visitor's* machine,
// so every request goes to a server on their laptop and the app looks broken in
// a way that gives no hint why. Forgetting to set one environment variable
// before a build should not produce that.
// ============================================================================

/** Hostnames that mean "this bundle is running on the developer's machine". */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

function isLocalHost(hostname: string) {
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Resolves the API root, preferring the build-time variable and degrading to a
 * same-origin guess rather than to `localhost`.
 *
 * Order:
 *  1. `VITE_API_BASE_URL` if it was set at build time — always wins, and is the
 *     only option when the API lives on a different host to the frontend.
 *  2. Otherwise, when served from a real domain: `<this origin>/api`. That is
 *     correct for the common deployment where a reverse proxy puts the frontend
 *     and the NestJS backend behind one hostname, and it is *never* worse than
 *     `localhost` — at worst it 404s against a server that actually exists,
 *     which is a diagnosable failure rather than a silent one.
 *  3. Only when genuinely running on localhost: the dev default, so
 *     `npm run dev` keeps working with no `.env` at all.
 *
 * The trailing slash is stripped so callers can concatenate `/path` without
 * producing `//path`, which some proxies treat as a different route.
 */
function resolveApiBaseUrl(): string {
  const configured = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_API_BASE_URL;

  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, "");
  }

  // `window` is absent under Vitest/SSR; fall through to the dev default there.
  if (typeof window !== "undefined" && window.location) {
    const { origin, hostname } = window.location;
    if (origin && !isLocalHost(hostname)) {
      return `${origin.replace(/\/+$/, "")}/api`;
    }
  }

  return "http://localhost:3000/api";
}

/**
 * The API root, including the backend's global `/api` prefix
 * (Backend/src/main.ts -> setGlobalPrefix). Never ends in a slash.
 */
export const API_BASE_URL = resolveApiBaseUrl();

/**
 * The bare server origin, without the `/api` prefix.
 *
 * Uploaded files are served from `/uploads/...` at the root, deliberately
 * mounted before the global prefix, so building those URLs means removing
 * `/api` again. Several call sites were each doing their own
 * `.replace(/\/api\/?$/, "")`; this is that expression, written once.
 */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
