// Minimal CSV parse/build helpers — good enough for the Employees
// import/export flow (quoted fields with embedded commas/quotes/newlines),
// without pulling in a dependency for it.

export function parseCSV(text: string): string[][] {
 const rows: string[][] = [];
 let row: string[] = [];
 let field = "";
 let inQuotes = false;

 for (let i = 0; i < text.length; i++) {
 const char = text[i];
 const next = text[i + 1];

 if (inQuotes) {
 if (char === '"' && next === '"') {
 field += '"';
 i++;
 } else if (char === '"') {
 inQuotes = false;
 } else {
 field += char;
 }
 continue;
 }

 if (char === '"') {
 inQuotes = true;
 } else if (char === ",") {
 row.push(field);
 field = "";
 } else if (char === " " || char === "\r") {
 if (char === "\r" && next === " ") i++;
 row.push(field);
 rows.push(row);
 row = [];
 field = "";
 } else {
 field += char;
 }
 }
 if (field.length > 0 || row.length > 0) {
 row.push(field);
 rows.push(row);
 }
 return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function escapeCell(value: unknown): string {
 const str = value === null || value === undefined ? "" : String(value);
 return /[", ]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCSV(headers: string[], rows: Array<Record<string, unknown>>): string {
 const lines = [headers.map(escapeCell).join(",")];
 for (const row of rows) {
 lines.push(headers.map((h) => escapeCell(row[h])).join(","));
 }
 return lines.join(" ");
}

export function downloadCSV(filename: string, csv: string) {
 const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}
