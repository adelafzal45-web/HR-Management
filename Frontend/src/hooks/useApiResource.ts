// ============================================================================
// The "Hooks" layer of Components -> Hooks -> Services -> API client -> Backend.
//
// A tiny, dependency-free take on what React Query gives you: run an async
// service call, and hand the component back a { data, loading, error, refetch }
// it can drive Loading / Success / Empty / Error / Retry off of. No cache, no
// dedupe, no background revalidation — just the one lifecycle every data screen
// re-implements by hand, written once and correctly.
//
// Two things it gets right that the hand-rolled versions usually don't:
//   • It never sets state after the component unmounts or after a newer run has
//     started (stale-response races), and it aborts the in-flight request when
//     deps change — so fast filter typing can't paint an old page's results.
//   • It never fabricates data on failure. `error` is populated and `data` is
//     left as-is; the component shows the error + Retry, not a fake empty list.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

export type ApiResourceState<T> = {
  data: T | null;
  loading: boolean;
  error: unknown;
  /** Re-run the fetcher (e.g. a Retry button or after a mutation). */
  refetch: () => void;
};

export type UseApiResourceOptions = {
  /**
   * When false, the fetcher does not run and `loading` is false. Use for
   * requests that depend on something not ready yet (a selected id, an
   * authenticated user) — this is the guard that prevents pointless calls.
   */
  enabled?: boolean;
  /**
   * The values the fetch depends on — exactly like a React Query key. When any
   * of these change the fetcher re-runs; the previous request is aborted. Keep
   * the array a stable length across renders (same rule as `useEffect` deps).
   */
  deps?: unknown[];
};

/**
 * Runs `fetcher` on mount and whenever `deps` change, exposing the request
 * lifecycle. `fetcher` receives an `AbortSignal`; thread it into `apiRequest`'s
 * `signal` option so an abandoned request is actually cancelled, not just
 * ignored. (Ignoring stale results is handled regardless, for fetchers that
 * can't be aborted.)
 */
export function useApiResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseApiResourceOptions = {},
): ApiResourceState<T> {
  const { enabled = true, deps = [] } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<unknown>(null);

  // The latest fetcher, held in a ref so it is NOT an effect dependency.
  // Callers pass inline arrow functions whose identity changes every render;
  // depending on that identity would re-fetch on every render — an infinite
  // loop the moment the first setState commits. Re-running is driven only by
  // `enabled`, `nonce` (manual refetch), and the caller's declared `deps`.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    // Guards state updates against both unmount and a superseding run: even a
    // fetcher that ignores the signal won't clobber fresher data.
    let active = true;
    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        // A deliberate abort (deps changed, or unmount) is not a real error and
        // must not flip the UI into its error state.
        if (!active || controller.signal.aborted) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // The dependency list is the caller's declared `deps` plus our own re-run
    // triggers; `fetcher` is read from a ref by design and must not be a dep
    // (its identity changes every render). This is the queryKey model, so the
    // spread is intentional — not a missing dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  return { data, loading, error, refetch };
}

export type ApiListState<T> = {
  data: T[];
  total: number;
  loading: boolean;
  error: unknown;
  refetch: () => void;
};

/**
 * `useApiResource` specialised for the backend's `{ data, total }` list
 * envelope, so paginated tables get `rows`/`total` directly.
 *
 * The `[]`/`0` defaults are a *rendering* convenience for the not-yet-loaded
 * and error states — they are not a swallowed failure: `error` is still set on
 * rejection, so the page shows Error + Retry rather than an empty table that
 * looks like "no results".
 */
export function useApiList<T>(
  fetcher: (signal: AbortSignal) => Promise<{ data: T[]; total: number }>,
  options: UseApiResourceOptions = {},
): ApiListState<T> {
  const { data, loading, error, refetch } = useApiResource(fetcher, options);
  return {
    data: data?.data ?? [],
    total: data?.total ?? 0,
    loading,
    error,
    refetch,
  };
}

export type ApiMutationState<TArgs extends unknown[], TResult> = {
  mutate: (...args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: unknown;
  /** Clears `error`/`loading` — e.g. when reopening a form after a failure. */
  reset: () => void;
};

/**
 * The write counterpart: wraps a create/update/delete service call with
 * loading + error state and success/error callbacks. Pass the related
 * resource's `refetch` (or a broader invalidator) as `onSuccess` so a mutation
 * refreshes what it changed — the "invalidate related data after mutations"
 * requirement, without a cache to manage.
 *
 * `mutate` re-throws on failure so a caller that already `await`s it inside its
 * own try/catch (to show a form-level message) keeps working; the returned
 * `error` is there for callers that would rather render it declaratively.
 */
export function useApiMutation<TArgs extends unknown[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>,
  options: {
    onSuccess?: (result: TResult, args: TArgs) => void;
    onError?: (error: unknown, args: TArgs) => void;
  } = {},
): ApiMutationState<TArgs, TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Both held in refs so `mutate` keeps a stable identity (safe to pass to
  // children / list in deps) while still calling the newest closures.
  const mutatorRef = useRef(mutator);
  mutatorRef.current = mutator;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutate = useCallback(async (...args: TArgs): Promise<TResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutatorRef.current(...args);
      optionsRef.current.onSuccess?.(result, args);
      return result;
    } catch (err) {
      setError(err);
      optionsRef.current.onError?.(err, args);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return { mutate, loading, error, reset };
}
