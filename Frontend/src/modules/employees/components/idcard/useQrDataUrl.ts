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

/**
 * Renders a verification URL to a QR data URL.
 *
 * `qrcode` is already a dependency (the payslip generator uses it), so this
 * adds no bundle weight. Generation is async and can fail on an absurdly long
 * payload; a failed render yields undefined and the caller leaves the QR box
 * empty rather than showing a broken image on a card that will be printed.
 */
export function useQrDataUrl(value: string, size = 200): string | undefined {
  const key = `${size}|${value}`;
  // Seeded from the cache so an already-rendered code paints on the first frame.
  const [dataUrl, setDataUrl] = useState<string | undefined>(() => cache.get(key));

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    let active = true;
    QRCode.toDataURL(value, {
      margin: 0,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#1A1A1A", light: "#ffffff" },
    })
      .then((url) => {
        // Oldest-first eviction: Map preserves insertion order, so the first
        // key is the least recently added.
        if (cache.size >= MAX_CACHED) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(key, url);
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
