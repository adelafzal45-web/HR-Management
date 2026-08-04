// ============================================================================
// Minimal CODE128-B encoder, rendered to a canvas data URL.
//
// The legacy ID card pulled JsBarcode from a CDN. Adding a barcode dependency
// for one glyph is not worth the bundle weight, and a CDN <script> is not an
// option inside the app, so the encoding is implemented here. CODE128 is a
// fully specified symbology, and Set B covers every printable ASCII character
// an employee code can contain.
//
// The barcode is scanned by physical attendance/access readers, so a silent
// encoding error would produce a card that looks correct and fails in the
// field. PATTERNS is therefore validated at module load: every data pattern is
// 11 modules wide and the stop pattern is 13, which catches a transcription
// typo immediately rather than at the card printer.
// ============================================================================

/**
 * Bar/space widths for CODE128 values 0-106, as run-length digits: bar,
 * space, bar, space, bar, space (the stop code has a seventh run).
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

// Load-time integrity check on the table above — see the file header.
const moduleSum = (pattern: string) =>
  pattern.split("").reduce((total, digit) => total + Number(digit), 0);
for (let value = 0; value < PATTERNS.length; value++) {
  const expected = value === STOP ? 13 : 11;
  if (moduleSum(PATTERNS[value]) !== expected) {
    throw new Error(
      `CODE128 pattern table corrupt at value ${value}: expected ${expected} modules, got ${moduleSum(PATTERNS[value])}`,
    );
  }
}

/**
 * Encodes a string to the CODE128-B module bitmap: `true` is a bar.
 *
 * Returns null for input containing characters outside printable ASCII
 * (32-126), which Set B cannot represent — the caller omits the barcode rather
 * than printing a symbol that decodes to the wrong value.
 */
export function encodeCode128B(value: string): boolean[] | null {
  if (value.length === 0) return null;

  const codes: number[] = [];
  for (const char of value) {
    const point = char.codePointAt(0)!;
    if (point < 32 || point > 126) return null;
    codes.push(point - 32);
  }

  // Checksum: start value plus each data value weighted by its 1-based
  // position, modulo 103.
  const checksum =
    (START_B + codes.reduce((sum, code, i) => sum + code * (i + 1), 0)) % 103;

  const runs = [START_B, ...codes, checksum, STOP]
    .map((code) => PATTERNS[code])
    .join("");

  // Runs alternate bar/space, always starting with a bar.
  const modules: boolean[] = [];
  runs.split("").forEach((digit, index) => {
    const isBar = index % 2 === 0;
    for (let i = 0; i < Number(digit); i++) modules.push(isBar);
  });
  return modules;
}

/**
 * Renders `value` as a CODE128-B barcode PNG data URL.
 *
 * `moduleWidth` is in device pixels; 2 gives a crisp symbol at the 34mm
 * printed width without producing an enormous data URL. Returns undefined when
 * the value cannot be encoded or a canvas is unavailable, so callers can skip
 * the barcode instead of rendering a broken image.
 */
export function code128DataUrl(
  value: string,
  { moduleWidth = 2, height = 60 }: { moduleWidth?: number; height?: number } = {},
): string | undefined {
  const modules = encodeCode128B(value);
  if (!modules) return undefined;

  const canvas = document.createElement("canvas");
  canvas.width = modules.length * moduleWidth;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1A1A1A";
  modules.forEach((isBar, index) => {
    if (isBar) ctx.fillRect(index * moduleWidth, 0, moduleWidth, height);
  });

  return canvas.toDataURL("image/png");
}
