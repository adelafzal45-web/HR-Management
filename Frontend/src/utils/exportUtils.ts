// Lightweight multi-format export helpers (CSV / Excel / PDF) that avoid
// pulling in extra bundle weight (xlsx, jspdf, …) for what is fundamentally
// a "download a table" feature.
//
// - CSV: plain text, reuses lib/csv.ts's toCSV().
// - Excel: an HTML <table> served with the legacy `application/vnd.ms-excel`
// MIME type and a `.xls` extension — Excel, Google Sheets, and Numbers
// all open this natively, and it keeps column headers + text formatting
// (no library needed).
// - PDF: opens a print-formatted HTML document in a new tab and triggers
// the browser's native print dialog with "Save as PDF" — every modern
// browser supports this without a client-side PDF library.

export type ExportFormat = "csv" | "excel" | "pdf";

export type ExportColumn = { key: string; label: string };

function escapeHtml(value: unknown): string {
 return String(value ?? "")
 .replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;");
}

function triggerDownload(filename: string, blob: Blob) {
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}

export function exportExcel(filename: string, columns: ExportColumn[], rows: Array<Record<string, unknown>>) {
 const head = columns.map((c) => `<th style="background:#F1B344;color:#1f2937;padding:8px;text-align:left;">${escapeHtml(c.label)}</th>`).join("");
 const body = rows
 .map(
 (row, i) =>
 `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">${columns
 .map((c) => `<td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(row[c.key])}</td>`)
 .join("")}</tr>`,
 )
 .join("");
 const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><table border="1" cellspacing="0" cellpadding="0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
 triggerDownload(filename.endsWith(".xls") ? filename : `${filename}.xls`, new Blob([html], { type: "application/vnd.ms-excel" }));
}

export function exportPDF(title: string, columns: ExportColumn[], rows: Array<Record<string, unknown>>) {
 const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
 const body = rows
 .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c.key])}</td>`).join("")}</tr>`)
 .join("");
 const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
 * { box-sizing: border-box; }
 body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color: #111827; }
 h1 { font-size: 18px; margin: 0 0 4px; }
 p.meta { font-size: 11px; color: #6b7280; margin: 0 0 16px; }
 table { width: 100%; border-collapse: collapse; font-size: 11px; }
 th { background: #F1B344; color: #1f2937; text-align: left; padding: 6px 8px; }
 td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
 tr:nth-child(even) td { background: #f9fafb; }
 @media print { body { padding: 0; } }
</style>
</head>
<body>
 <h1>${escapeHtml(title)}</h1>
 <p class="meta">Exported ${new Date().toLocaleString()} · ${rows.length} record(s)</p>
 <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
 <script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body>
</html>`;
 const win = window.open("", "_blank");
 if (!win) return false;
 win.document.open();
 win.document.write(html);
 win.document.close();
 return true;
}
