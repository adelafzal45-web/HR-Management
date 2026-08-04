// Generates a polished, enterprise-grade PDF payslip using jsPDF's vector
// drawing primitives (no external template/service required — everything
// renders client-side). Shared by every screen that offers a payslip
// download: the employee self-service Payroll page, the admin Employee >
// Payroll tab, and the HR "Process Payroll" workspace, so every payslip in
// the app looks the same regardless of who generated it.
//
// The input type is intentionally permissive: fields the current data model
// doesn't capture yet (attendance breakdown, bank/CNIC, transaction
// references, etc.) are all optional. Sections built from them simply don't
// render when the data isn't supplied, rather than showing fabricated
// placeholders — see each "only rendered when present" block below.

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import defaultLogoAsset from "@/assets/logo.png";

export type PayslipLine = { label: string; amount: number };

export type PayslipPdfInput = {
 company: {
 name: string;
 address?: string;
 email?: string;
 phone?: string;
 website?: string;
 /** Company Registration Number / NTN, shown under the company name if provided. */
 registrationNo?: string;
 /** Pre-resolved base64 data URL (use resolveLogoDataUrl to build this from a URL). */
 logoDataUrl?: string;
 };
 employee: {
 name: string;
 code: string;
 department?: string;
 designation?: string;
 email?: string;
 role?: string;
 shift?: string;
 employmentType?: string;
 /** YYYY-MM-DD or any pre-formatted display string. */
 joiningDate?: string;
 /** Already masked by the caller, e.g. "•••• •••• 4821". */
 bankAccountMasked?: string;
 /** Already masked by the caller, e.g. "•••••-••••••••-•". */
 cnicMasked?: string;
 /** Already masked by the caller, e.g. "PK••••••••••••3344". */
 ibanMasked?: string;
 bankName?: string;
 costCenter?: string;
 grade?: string;
 photoDataUrl?: string;
 };
 period: string; // e.g. "July 2026"
 status: "Generated" | "Pending" | string;
 paymentDate?: string | null;
 generatedDate?: string;
 earnings: PayslipLine[];
 deductions: PayslipLine[];
 netSalary: number;
 currency?: string; // default PKR

 /** Attendance / processing details for the period — all optional. */
 payroll?: {
 workingDays?: number;
 presentDays?: number;
 absentDays?: number;
 paidLeave?: number;
 unpaidLeave?: number;
 lateDays?: number;
 earlyDepartures?: number;
 overtimeHours?: number;
 paymentMethod?: string;
 transactionRef?: string;
 };

 /** Footer / verification details. */
 payslipId?: string;
 generatedBy?: string;
 /** Full date + time string; falls back to "now" if omitted. */
 generatedAt?: string;
 /** Encoded into the footer QR code when provided. */
 verificationUrl?: string;
 confidentialityNote?: string;
};

// Brand palette (kept in sync with tailwind.config.js `brand` colors) so the
// PDF visually matches the rest of the app rather than looking like a
// generic export.
const BRAND_DARK = { r: 199, g: 122, b: 46 };
const INK = { r: 31, g: 41, b: 55 }; // gray-800
const MUTED = { r: 107, g: 114, b: 128 }; // gray-500
const LINE = { r: 229, g: 231, b: 235 }; // gray-200
const CARD_BG = { r: 250, g: 250, b: 251 }; // gray-50
const EARNING_GREEN = { r: 5, g: 122, b: 85 }; // emerald-700
const EARNING_GREEN_BG = { r: 236, g: 253, b: 245 }; // emerald-50
const DEDUCTION_RED = { r: 190, g: 40, b: 40 };
const DEDUCTION_RED_BG = { r: 254, g: 242, b: 242 }; // rose-50
const NET_BLUE = { r: 30, g: 64, b: 175 }; // blue-800 — Employee Information accent
const NET_GREEN = { r: 5, g: 150, b: 105 }; // emerald-600 — Net Pay highlight (matches requested #10B981 success color)

function money(n: number, currency: string) {
 return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Number → words (Indian/Pakistani lakh-crore grouping) -----------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsToWords(n: number): string {
 let out = "";
 if (n >= 100) {
 out += `${ONES[Math.floor(n / 100)]} Hundred`;
 n %= 100;
 if (n > 0) out += " ";
 }
 if (n >= 20) {
 out += TENS[Math.floor(n / 10)];
 if (n % 10 > 0) out += `-${ONES[n % 10]}`;
 } else if (n > 0) {
 out += ONES[n];
 }
 return out;
}

/** Converts a whole-rupee amount to words using the lakh/crore grouping
 * standard in Pakistani and Indian payroll documents. */
export function numberToWords(amount: number, currency = "PKR"): string {
 const n = Math.round(Math.abs(amount));
 if (n === 0) return `${currency === "PKR" ? "Pakistani Rupees" : currency} Zero Only`;

 const crore = Math.floor(n / 10000000);
 const lakh = Math.floor((n % 10000000) / 100000);
 const thousand = Math.floor((n % 100000) / 1000);
 const rest = n % 1000;

 const parts: string[] = [];
 if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
 if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
 if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
 if (rest) parts.push(threeDigitsToWords(rest));

 const label = currency === "PKR" ? "Pakistani Rupees" : currency;
 return `${label} ${parts.join(" ")} Only`;
}

// ---- Small display helpers shared by every payslip-download call site -----
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
 full_time: "Full Time",
 part_time: "Part Time",
 contract: "Contract",
 intern: "Intern",
};

export function formatEmploymentType(type?: string): string | undefined {
 if (!type) return undefined;
 return EMPLOYMENT_TYPE_LABELS[type] ?? type;
}

export function formatJoiningDate(date?: string): string | undefined {
 if (!date) return undefined;
 const d = new Date(date);
 if (Number.isNaN(d.getTime())) return date;
 return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// ---- Masking helpers (for callers that have raw bank/CNIC values) ----------
export function maskAccountNumber(raw: string): string {
 const digits = raw.replace(/\s+/g, "");
 const last = digits.slice(-4);
 return `•••• •••• ${last}`;
}

export function maskCnic(raw: string): string {
 const digits = raw.replace(/[^0-9]/g, "");
 if (digits.length < 13) return "•••••-•••••••-•";
 return `•••••-${"•".repeat(7)}-${digits.slice(-1)}`;
}

export function maskIban(raw: string): string {
 const compact = raw.replace(/\s+/g, "").toUpperCase();
 if (compact.length < 6) return compact;
 const countryCode = compact.slice(0, 2);
 const last4 = compact.slice(-4);
 return `${countryCode}${"•".repeat(Math.max(compact.length - 6, 4))}${last4}`;
}

// ---- Logo loading ------------------------------------------------------------
// Bundled app logo, used on the payslip whenever no company branding logo
// has been configured (or its URL fails to load) — so every payslip carries
// a logo instead of quietly falling back to text-only.

async function fetchAsDataUrl(url: string): Promise<string | undefined> {
 try {
 const res = await fetch(url, { mode: "cors" });
 if (!res.ok) return undefined;
 const blob = await res.blob();
 return await new Promise<string>((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result));
 reader.onerror = () => reject(reader.error);
 reader.readAsDataURL(blob);
 });
 } catch {
 return undefined;
 }
}

/** Fetches an image URL and returns a base64 data URL suitable for
 * `company.logoDataUrl`. Tries the given (branding) URL first, then falls
 * back to the bundled app logo in `src/assets`, so a payslip only ends up
 * without a logo if even the bundled asset can't be loaded. */
export async function resolveLogoDataUrl(url?: string): Promise<string | undefined> {
 if (url) {
 const resolved = await fetchAsDataUrl(url);
 if (resolved) return resolved;
 }
 return fetchAsDataUrl(defaultLogoAsset);
}

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
 if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
 if (dataUrl.startsWith("data:image/webp")) return "WEBP";
 return "PNG";
}

export async function buildPayslipPdf(input: PayslipPdfInput): Promise<jsPDF> {
 const currency = input.currency ?? "PKR";
 const doc = new jsPDF({ unit: "mm", format: "a4" });
 const pageWidth = doc.internal.pageSize.getWidth();
 const pageHeight = doc.internal.pageSize.getHeight();
 const marginX = 14;
 const contentWidth = pageWidth - marginX * 2;
 const footerReserve = 40; // keep this much space clear above the bottom for the footer band

 const totalEarnings = input.earnings.reduce((s, l) => s + l.amount, 0);
 const totalDeductions = input.deductions.reduce((s, l) => s + l.amount, 0);

 // ---- Watermark (drawn first so every later fill sits on top of it) -------
 doc.saveGraphicsState();
 // jsPDF doesn't expose true alpha for text easily across versions; a very
 // light gray reads as a subtle watermark on white/near-white backgrounds
 // without interfering with legibility of the content drawn afterwards.
 doc.setTextColor(245, 240, 232);
 doc.setFont("helvetica", "bold");
 doc.setFontSize(64);
 doc.text(input.company.name || "PAYSLIP", pageWidth / 2, pageHeight / 2, {
 align: "center",
 angle: 35,
 });
 doc.restoreGraphicsState();

 // ---- Header banner (letterhead style) --------------------------------------
 // Left column: logo on top, company name beside it, then Address / Phone /
 // Email / Website stacked one-per-row underneath — a standard letterhead
 // layout rather than a single run-on contact line. Right column keeps the
 // payslip meta (title, pay period, status, paid date).
 const contactFields: [string, string][] = [
 ...(input.company.address ? ([["Address", input.company.address]] as [string, string][]) : []),
 ...(input.company.phone ? ([["Phone", input.company.phone]] as [string, string][]) : []),
 ...(input.company.email ? ([["Email", input.company.email]] as [string, string][]) : []),
 ...(input.company.website ? ([["Website", input.company.website]] as [string, string][]) : []),
 ];
 const logoSize = 16;
 const logoTop = 7;
 const contactRowH = 4.3;
 const contactStartY = logoTop + logoSize + 5.5;
 const headerHeight = Math.max(32, contactStartY + contactFields.length * contactRowH + 4);

 doc.setFillColor(BRAND_DARK.r, BRAND_DARK.g, BRAND_DARK.b);
 doc.rect(0, 0, pageWidth, headerHeight, "F");

 // Logo, top-left.
 let nameStartX = marginX;
 if (input.company.logoDataUrl) {
 try {
 const format = imageFormatFromDataUrl(input.company.logoDataUrl);
 doc.addImage(input.company.logoDataUrl, format, marginX, logoTop, logoSize, logoSize, undefined, "FAST");
 nameStartX = marginX + logoSize + 5;
 } catch {
 // Corrupt/unsupported image data — fall back to text-only header.
 }
 }

 // Company name + registration number, vertically centered alongside the logo.
 doc.setTextColor(255, 255, 255);
 doc.setFont("helvetica", "bold");
 doc.setFontSize(16);
 doc.text(input.company.name || "Company", nameStartX, logoTop + logoSize / 2 + 1);
 if (input.company.registrationNo) {
 doc.setFont("helvetica", "normal");
 doc.setFontSize(7.5);
 doc.text(`Reg. / NTN: ${input.company.registrationNo}`, nameStartX, logoTop + logoSize / 2 + 6);
 }

 // Address / Phone / Email / Website — one field per row, left-aligned
 // under the logo, running the full width of the left column.
 let contactY = contactStartY;
 contactFields.forEach(([label, value]) => {
 doc.setFont("helvetica", "bold");
 doc.setFontSize(7.5);
 doc.setTextColor(255, 255, 255);
 doc.text(`${label}:`, marginX, contactY);
 const labelWidth = doc.getTextWidth(`${label}: `);
 doc.setFont("helvetica", "normal");
 doc.text(value, marginX + labelWidth, contactY);
 contactY += contactRowH;
 });

 // Right column — "PAYSLIP" title, pay period, and status, spread out to
 // match the taller letterhead rather than crowded into the old 32mm band.
 doc.setFont("helvetica", "bold");
 doc.setFontSize(15);
 doc.setTextColor(255, 255, 255);
 doc.text("PAYSLIP", pageWidth - marginX, 14, { align: "right" });
 doc.setFont("helvetica", "normal");
 doc.setFontSize(9.5);
 doc.text(`Pay Period: ${input.period}`, pageWidth - marginX, 21, { align: "right" });

 // Status pill lives inside the header banner, next to the payment date
 // when there is one, instead of floating in its own row below the banner
 // where it read as disconnected from everything else.
 const pillLabel = input.status === "Generated" ? "PAID" : String(input.status).toUpperCase();
 const pillColor = input.status === "Generated" ? { r: 16, g: 150, b: 100 } : { r: 217, g: 119, b: 6 };
 doc.setFont("helvetica", "bold");
 doc.setFontSize(8.5);
 const pillY = Math.min(headerHeight - 6, 30);
 const pillWidth = doc.getTextWidth(pillLabel) + 8;
 const pillX = pageWidth - marginX - pillWidth;
 doc.setFillColor(pillColor.r, pillColor.g, pillColor.b);
 doc.roundedRect(pillX, pillY - 4.6, pillWidth, 6.2, 3, 3, "F");
 doc.setTextColor(255, 255, 255);
 doc.text(pillLabel, pillX + pillWidth / 2, pillY - 0.3, { align: "center" });

 if (input.paymentDate) {
 doc.setFont("helvetica", "normal");
 doc.setFontSize(8);
 doc.setTextColor(255, 255, 255);
 doc.text(`Paid on ${input.paymentDate}`, pillX - 4, pillY - 0.3, { align: "right" });
 }

 let y = headerHeight + 10;

 const ensureSpace = (needed: number) => {
 if (y + needed > pageHeight - footerReserve) {
 doc.addPage();
 y = 18;
 }
 };

 const sectionTitle = (title: string) => {
 ensureSpace(10);
 doc.setFont("helvetica", "bold");
 doc.setFontSize(11.5);
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(title, marginX, y);
 y += 2.5;
 doc.setDrawColor(BRAND_DARK.r, BRAND_DARK.g, BRAND_DARK.b);
 doc.setLineWidth(0.6);
 doc.line(marginX, y, marginX + 24, y);
 doc.setLineWidth(0.2);
 y += 5.5;
 };

 // ---- Employee Information card (two-column) -------------------------------
 const empFields: [string, string][] = [
 ["Employee Name", input.employee.name || "N/A"],
 ["Employee ID", input.employee.code || "N/A"],
 ...(input.employee.designation ? ([["Role / Designation", input.employee.designation]] as [string, string][]) : []),
 ...(input.employee.department ? ([["Department", input.employee.department]] as [string, string][]) : []),
 ...(input.employee.grade ? ([["Grade", input.employee.grade]] as [string, string][]) : []),
 ...(input.employee.shift ? ([["Shift", input.employee.shift]] as [string, string][]) : []),
 ...(input.employee.employmentType ? ([["Employment Type", input.employee.employmentType]] as [string, string][]) : []),
 ...(input.employee.joiningDate ? ([["Joining Date", input.employee.joiningDate]] as [string, string][]) : []),
 ...(input.employee.email ? ([["Email", input.employee.email]] as [string, string][]) : []),
 ...(input.employee.costCenter ? ([["Cost Center", input.employee.costCenter]] as [string, string][]) : []),
 ...(input.employee.cnicMasked ? ([["CNIC", input.employee.cnicMasked]] as [string, string][]) : []),
 ];

 sectionTitle("Employee Information");

 // When a photo is supplied, reserve a fixed-width slot for it on the left
 // and lay the two field columns out in the remaining width, rather than
 // letting it overlap the field text.
 const hasPhoto = !!input.employee.photoDataUrl;
 const photoSize = 24;
 const photoGap = 6;
 const fieldsX = hasPhoto ? marginX + photoSize + photoGap : marginX;
 const fieldsWidth = contentWidth - (hasPhoto ? photoSize + photoGap : 0);

 const colGap = 8;
 const colWidth = (fieldsWidth - colGap) / 2;
 const leftX = fieldsX;
 const rightX = fieldsX + colWidth + colGap;
 const half = Math.ceil(empFields.length / 2);
 const leftFields = empFields.slice(0, half);
 const rightFields = empFields.slice(half);
 const rowH = 8.2;
 const cardRows = Math.max(leftFields.length, rightFields.length);
 const cardHeight = Math.max(cardRows * rowH + 6, hasPhoto ? photoSize + 10 : 0);

 ensureSpace(cardHeight + 4);
 const cardTop = y - 4;

 doc.setFillColor(CARD_BG.r, CARD_BG.g, CARD_BG.b);
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.roundedRect(marginX, cardTop, contentWidth, cardHeight, 3, 3, "FD");
 doc.setFillColor(NET_BLUE.r, NET_BLUE.g, NET_BLUE.b);
 doc.roundedRect(marginX, cardTop, 1.6, cardHeight, 0.8, 0.8, "F");

 if (hasPhoto) {
 try {
 const format = imageFormatFromDataUrl(input.employee.photoDataUrl!);
 const photoX = marginX + 5;
 const photoY = cardTop + (cardHeight - photoSize) / 2;
 doc.addImage(input.employee.photoDataUrl!, format, photoX, photoY, photoSize, photoSize, undefined, "FAST");
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.roundedRect(photoX, photoY, photoSize, photoSize, 2, 2, "D");
 } catch {
 // Corrupt/unsupported image data — silently skip the photo rather
 // than blocking the rest of the payslip.
 }
 }

 const drawFieldColumn = (items: [string, string][], x: number, startY: number) => {
 let fy = startY;
 items.forEach(([label, value]) => {
 doc.setFont("helvetica", "normal");
 doc.setFontSize(7.5);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 doc.text(label.toUpperCase(), x + 5, fy);
 doc.setFont("helvetica", "bold");
 doc.setFontSize(9.5);
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(value, x + 5, fy + 4.4);
 fy += rowH;
 });
 };

 const fieldStartY = cardTop + 6;
 drawFieldColumn(leftFields, leftX, fieldStartY);
 drawFieldColumn(rightFields, rightX, fieldStartY);
 y = cardTop + cardHeight + 7;

 // ---- Payroll Information (only fields the caller actually supplied) ------
 const pm = input.payroll;
 // `paymentDate` has been part of the input contract since the first
 // version of this generator, but was never actually rendered anywhere —
 // every caller passes it and it silently disappeared. It's included here
 // as the first payment-related chip so payslips finally show it.
 const payrollChips: [string, string][] = [
 ["Payroll Month", input.period],
 ...(input.paymentDate ? ([["Payment Date", input.paymentDate]] as [string, string][]) : []),
 ...(pm?.workingDays !== undefined ? ([["Working Days", String(pm.workingDays)]] as [string, string][]) : []),
 ...(pm?.presentDays !== undefined ? ([["Present Days", String(pm.presentDays)]] as [string, string][]) : []),
 ...(pm?.absentDays !== undefined ? ([["Absent Days", String(pm.absentDays)]] as [string, string][]) : []),
 ...(pm?.paidLeave !== undefined ? ([["Paid Leave", String(pm.paidLeave)]] as [string, string][]) : []),
 ...(pm?.unpaidLeave !== undefined ? ([["Unpaid Leave", String(pm.unpaidLeave)]] as [string, string][]) : []),
 ...(pm?.earlyDepartures !== undefined ? ([["Early Departures", String(pm.earlyDepartures)]] as [string, string][]) : []),
 ...(pm?.overtimeHours !== undefined ? ([["Overtime Hours", `${pm.overtimeHours} hrs`]] as [string, string][]) : []),
 ...(pm?.paymentMethod ? ([["Payment Method", pm.paymentMethod]] as [string, string][]) : []),
 ...(pm?.transactionRef ? ([["Transaction / Ref ID", pm.transactionRef]] as [string, string][]) : []),
 ...(input.employee.bankName ? ([["Bank Name", input.employee.bankName]] as [string, string][]) : []),
 ...(input.employee.bankAccountMasked ? ([["Bank Account", input.employee.bankAccountMasked]] as [string, string][]) : []),
 ...(input.employee.ibanMasked ? ([["IBAN", input.employee.ibanMasked]] as [string, string][]) : []),
 ];

 sectionTitle("Payroll Information");

 const chipCols = 3;
 const chipGap = 4;
 const chipWidth = (contentWidth - chipGap * (chipCols - 1)) / chipCols;
 const chipHeight = 12;
 const chipRows = Math.ceil(payrollChips.length / chipCols);
 ensureSpace(chipRows * (chipHeight + chipGap));

 payrollChips.forEach(([label, value], i) => {
 const col = i % chipCols;
 const row = Math.floor(i / chipCols);
 const cx = marginX + col * (chipWidth + chipGap);
 const cy = y + row * (chipHeight + chipGap);
 doc.setFillColor(CARD_BG.r, CARD_BG.g, CARD_BG.b);
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.roundedRect(cx, cy, chipWidth, chipHeight, 2.5, 2.5, "FD");
 doc.setFont("helvetica", "normal");
 doc.setFontSize(7);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 doc.text(label.toUpperCase(), cx + 4, cy + 5.5);
 doc.setFont("helvetica", "bold");
 doc.setFontSize(9);
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(value, cx + 4, cy + 11);
 });
 y += chipRows * (chipHeight + chipGap) + 4;

 // ---- Earnings & Deductions — side-by-side tables --------------------------
 sectionTitle("Earnings & Deductions");

 const tableGap = 6;
 const tableWidth = (contentWidth - tableGap) / 2;
 const earnX = marginX;
 const dedX = marginX + tableWidth + tableGap;
 const tableRowH = 6.2;
 const maxRows = Math.max(input.earnings.length, input.deductions.length, 1);
 const tableHeaderH = 7;
 const tableBodyHeight = maxRows * tableRowH;
 const tableTotalRowH = 7;
 const tableHeight = tableHeaderH + tableBodyHeight + tableTotalRowH;

 ensureSpace(tableHeight + 4);
 const tableTop = y;

 const drawTable = (
 x: number,
 title: string,
 rows: PayslipLine[],
 total: number,
 accent: { r: number; g: number; b: number },
 accentBg: { r: number; g: number; b: number },
 sign: "" | "- ",
 ) => {
 // Header
 doc.setFillColor(accent.r, accent.g, accent.b);
 doc.roundedRect(x, y, tableWidth, tableHeaderH, 2, 2, "F");
 doc.setFont("helvetica", "bold");
 doc.setFontSize(9);
 doc.setTextColor(255, 255, 255);
 doc.text(title, x + 4, y + 5.5);

 let ry = y + tableHeaderH + 5;
 doc.setFontSize(8.7);
 rows.forEach((row, i) => {
 if (i % 2 === 1) {
 doc.setFillColor(accentBg.r, accentBg.g, accentBg.b);
 doc.rect(x, ry - 4.4, tableWidth, tableRowH, "F");
 }
 doc.setFont("helvetica", "normal");
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(row.label, x + 3, ry);
 doc.setFont("helvetica", "bold");
 doc.setTextColor(accent.r, accent.g, accent.b);
 doc.text(`${sign}${money(row.amount, currency)}`, x + tableWidth - 3, ry, { align: "right" });
 ry += tableRowH;
 });
 // Fill remaining empty rows so both tables end at the same height when
 // one side has fewer components than the other.
 for (let i = rows.length; i < maxRows; i++) {
 ry += tableRowH;
 }

 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.line(x, ry - 3, x + tableWidth, ry - 3);
 doc.setFont("helvetica", "bold");
 doc.setFontSize(9);
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(`Total ${title}`, x + 3, ry + 3.5);
 doc.setTextColor(accent.r, accent.g, accent.b);
 doc.text(money(total, currency), x + tableWidth - 3, ry + 3.5, { align: "right" });
 };

 drawTable(earnX, "Earnings", input.earnings, totalEarnings, EARNING_GREEN, EARNING_GREEN_BG, "");
 drawTable(dedX, "Deductions", input.deductions, totalDeductions, DEDUCTION_RED, DEDUCTION_RED_BG, "- ");

 y = tableTop + tableHeight + 7;

 // ---- Salary Summary formula --------------------------------------------------
 // Shown *before* the Net Pay highlight so the page tells one story —
 // Gross → Allowances → Bonus → Deductions, landing on Net Pay — rather
 // than stating the net figure once here and again in an identical card
 // right below it.
 sectionTitle("Salary Summary");
 const basicLine = input.earnings.find((l) => /basic/i.test(l.label)) ?? input.earnings[0];
 const bonusLine = input.earnings.find((l) => /bonus/i.test(l.label));
 const grossSalary = basicLine?.amount ?? 0;
 const bonusAmount = bonusLine?.amount ?? 0;
 const totalAllowances = totalEarnings - grossSalary - bonusAmount;

 const summaryRows: [string, number][] = [
 ["Gross Salary", grossSalary],
 ["+ Total Allowances", totalAllowances],
 ["+ Bonus", bonusAmount],
 ["- Total Deductions", -totalDeductions],
 ];
 const summaryHeight = summaryRows.length * 6 + 6;
 ensureSpace(summaryHeight);
 doc.setFillColor(CARD_BG.r, CARD_BG.g, CARD_BG.b);
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.roundedRect(marginX, y - 4, contentWidth, summaryHeight, 3, 3, "FD");
 let sy = y + 3;
 doc.setFontSize(9.5);
 summaryRows.forEach(([label, value]) => {
 doc.setFont("helvetica", "normal");
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(label, marginX + 6, sy);
 doc.setFont("helvetica", "bold");
 doc.setTextColor(value < 0 ? DEDUCTION_RED.r : INK.r, value < 0 ? DEDUCTION_RED.g : INK.g, value < 0 ? DEDUCTION_RED.b : INK.b);
 doc.text(`${value < 0 ? "- " : ""}${money(Math.abs(value), currency)}`, pageWidth - marginX - 6, sy, { align: "right" });
 sy += 6;
 });
 y += summaryHeight + 7;

 // ---- Net Pay highlight card --------------------------------------------------
 // The single most prominent element on the page: solid fill, large white
 // type, rather than the previous light-tint-with-colored-text treatment,
 // so it actually reads as the headline figure rather than another line
 // item among several similarly-weighted cards.
 const netCardHeight = 22;
 ensureSpace(netCardHeight + 10);
 doc.setFillColor(NET_GREEN.r, NET_GREEN.g, NET_GREEN.b);
 doc.roundedRect(marginX, y - 4, contentWidth, netCardHeight, 3, 3, "F");
 doc.setFont("helvetica", "bold");
 doc.setFontSize(11);
 doc.setTextColor(255, 255, 255);
 doc.text("NET PAY", marginX + 7, y + 5);
 doc.setFontSize(19);
 doc.text(money(input.netSalary, currency), pageWidth - marginX - 7, y + 5.5, { align: "right" });
 doc.setFont("helvetica", "normal");
 doc.setFontSize(8.3);
 doc.text(numberToWords(input.netSalary, currency), marginX + 7, y + 13, { maxWidth: contentWidth - 14 });
 y += netCardHeight + 8;

 // ---- Attendance Summary (only when payroll meta was supplied) -------------
 if (pm && (pm.workingDays !== undefined || pm.presentDays !== undefined || pm.absentDays !== undefined)) {
 const attRows: [string, string][] = [
 ["Working Days", pm.workingDays !== undefined ? String(pm.workingDays) : "N/A"],
 ["Present", pm.presentDays !== undefined ? String(pm.presentDays) : "N/A"],
 ["Absent", pm.absentDays !== undefined ? String(pm.absentDays) : "N/A"],
 ["Leave", pm.paidLeave !== undefined || pm.unpaidLeave !== undefined ? String((pm.paidLeave ?? 0) + (pm.unpaidLeave ?? 0)) : "N/A"],
 ...(pm.lateDays !== undefined ? ([["Late", String(pm.lateDays)]] as [string, string][]) : []),
 ["Overtime Hours", pm.overtimeHours !== undefined ? `${pm.overtimeHours}` : "N/A"],
 ];

 sectionTitle("Attendance Summary");
 const attColWidth = contentWidth / attRows.length;
 const attHeight = 14;
 ensureSpace(attHeight + 4);
 doc.setFillColor(CARD_BG.r, CARD_BG.g, CARD_BG.b);
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.roundedRect(marginX, y - 4, contentWidth, attHeight, 3, 3, "FD");
 attRows.forEach(([label, value], i) => {
 const cx = marginX + i * attColWidth + attColWidth / 2;
 doc.setFont("helvetica", "normal");
 doc.setFontSize(7);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 doc.text(label.toUpperCase(), cx, y + 1.5, { align: "center" });
 doc.setFont("helvetica", "bold");
 doc.setFontSize(10);
 doc.setTextColor(INK.r, INK.g, INK.b);
 doc.text(value, cx, y + 7, { align: "center" });
 if (i > 0) {
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.line(marginX + i * attColWidth, y - 2, marginX + i * attColWidth, y + attHeight - 6);
 }
 });
 y += attHeight + 6;
 }

 // ---- Footer -----------------------------------------------------------------
 // Always place the footer in its reserved band at the bottom of the last
 // page, regardless of how far `y` reached, so it never collides with
 // page-break-safe body content above.
 doc.setPage(doc.getNumberOfPages());
 const footerTop = pageHeight - footerReserve;
 doc.setDrawColor(LINE.r, LINE.g, LINE.b);
 doc.line(marginX, footerTop, pageWidth - marginX, footerTop);

 let qrDataUrl: string | undefined;
 if (input.verificationUrl) {
 try {
 qrDataUrl = await QRCode.toDataURL(input.verificationUrl, { margin: 0, width: 160 });
 } catch {
 qrDataUrl = undefined;
 }
 }

 // ID / generation details on the left, QR on the right — the two no
 // longer share the same right-aligned strip, so neither has to wrap or
 // crowd the other on long payslip IDs.
 doc.setFont("helvetica", "normal");
 doc.setFontSize(7.5);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 let fy = footerTop + 8;
 if (input.payslipId) {
 doc.text(`Payslip ID: ${input.payslipId}`, marginX, fy);
 fy += 4;
 }
 doc.text(`Generated by: ${input.generatedBy || "System"}`, marginX, fy);
 fy += 4;
 doc.text(`Generated on: ${input.generatedAt || new Date().toLocaleString()}`, marginX, fy);
 fy += 4;
 doc.text(`${input.company.name || "TechnoCues HRMS"}`, marginX, fy);

 const qrSize = 18;
 const qrX = pageWidth - marginX - qrSize;
 if (qrDataUrl) {
 doc.setFont("helvetica", "bold");
 doc.setFontSize(6.5);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 doc.text("VERIFY PAYSLIP", qrX + qrSize / 2, footerTop + 4, { align: "center" });
 doc.addImage(qrDataUrl, "PNG", qrX, footerTop + 6, qrSize, qrSize);
 doc.setFont("helvetica", "normal");
 doc.setFontSize(6.5);
 doc.text("Scan to verify", qrX + qrSize / 2, footerTop + 6 + qrSize + 3, { align: "center" });
 }

 doc.setFont("helvetica", "italic");
 doc.setFontSize(7.5);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 doc.text(
 input.confidentialityNote || "This is a system-generated payslip and does not require a signature. Confidential - for the named employee only.",
 pageWidth / 2,
 footerTop + 32,
 { align: "center", maxWidth: contentWidth },
 );

 // ---- Page numbers (every page, including any overflow pages) --------------
 const totalPages = doc.getNumberOfPages();
 for (let p = 1; p <= totalPages; p++) {
 doc.setPage(p);
 doc.setFont("helvetica", "normal");
 doc.setFontSize(7.5);
 doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
 doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 4, { align: "right" });
 }
 doc.setPage(totalPages);

 return doc;
}

export async function downloadPayslipPdf(input: PayslipPdfInput, filename: string) {
 const doc = await buildPayslipPdf(input);
 doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
