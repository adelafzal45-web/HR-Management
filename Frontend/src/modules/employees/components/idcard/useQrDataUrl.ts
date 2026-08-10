import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Rendered QR codes, keyed by value+size.
 *
 * The same verification URL is encoded up to four times per employee — the
 * preview's two faces plus the print sheet's two — and a 50-card batch multiplies
 * that again. Caching makes every repeat a synchronous cache hit, which also
 * removes the blank-QR-box flash on re-render. Entries are small strings and the
 * cache is bounded below.
 */
const cache = new Map<string, string>();

/** Plenty for the 50-card export cap (2 sizes x 50 employees) with headroom. */
const MAX_CACHED = 200;

const cacheKey = (value: string, size: number) => `${size}|${value}`;

const qrOptions = (size: number) => ({
  margin: 0,
  width: size,
  errorCorrectionLevel: "M" as const,
  color: { dark: "#1A1A1A", light: "#ffffff" },
});

/** Oldest-first eviction: Map preserves insertion order, so the first key is
 * the least recently added. */
function remember(key: string, url: string) {
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, url);
}

/**
 * Renders a QR into the same cache the hook reads from, ahead of mounting the
 * card that needs it.
 *
 * Printing depends on this: `window.print()` snapshots the page synchronously,
 * so a code still resolving when the dialog opens prints as an empty box. Warm
 * it first and the hook seeds its state from the cache on the very first frame.
 * A failed render resolves anyway — the caller shouldn't lose the whole print
 * over a missing QR, and the card already tolerates one being absent.
 */
export async function warmQrDataUrl(value: string, size = 200): Promise<void> {
  const key = cacheKey(value, size);
  if (cache.has(key)) return;
  try {
    remember(key, await QRCode.toDataURL(value, qrOptions(size)));
  } catch {
    // Left uncached so a later attempt can retry it.
  }
}

/**
 * Renders a verification URL to a QR data URL.
 *
 * `qrcode` is already a dependency (the payslip generator uses it), so this
 * adds no bundle weight. Generation is async and can fail on an absurdly long
 * payload; a failed render yields undefined and the caller leaves the QR box
 * empty rather than showing a broken image on a card that will be printed.
 */
export function useQrDataUrl(value: string, size = 200): string | undefined {
  const key = cacheKey(value, size);
  // Seeded from the cache so an already-rendered code paints on the first frame.
  const [dataUrl, setDataUrl] = useState<string | undefined>(() => cache.get(key));

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    let active = true;
    QRCode.toDataURL(value, qrOptions(size))
      .then((url) => {
        remember(key, url);
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(undefined);
      });
    return () => {
      active = false;
    };
  }, [key, value, size]);

  return dataUrl;
}
