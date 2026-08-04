import { useEffect, useState } from "react";
import { code128DataUrl } from "@/modules/employees/components/idcard/code128";

/**
 * Renders an employee code as a CODE128-B barcode data URL for the card's back
 * face. Returns undefined when the code cannot be encoded (non-ASCII input), in
 * which case the barcode strip omits the symbol rather than printing a broken
 * image — the employee code is still shown as text directly beneath it.
 */
export function useBarcodeDataUrl(value: string): string | undefined {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    setDataUrl(code128DataUrl(value));
  }, [value]);

  return dataUrl;
}
