// ============================================================================
// ID card -> PDF, at exact CR80 trim size.
//
// Built with jsPDF vector primitives, the same approach as
// modules/payroll/utils/payslipPdf.ts, so nothing is rasterised and the text
// stays selectable and sharp at any print resolution.
//
// Fidelity note: jsPDF has no gradient fills. Where the on-screen card uses a
// gold gradient (the photo ring, the top band rule, the section accents) the PDF
// uses a solid mid-gold, and the conic photo ring becomes a solid ring. Every
// dimension, position and text style matches the screen card exactly; only
// gradients are flattened. For a pixel-exact reproduction the page's Print
// action renders the real components through the browser instead.
// ============================================================================

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { code128DataUrl } from "@/modules/employees/components/idcard/code128";
import type { IdCardData } from "@/modules/employees/components/idcard/idCardData";
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
} from "@/modules/employees/components/idcard/idCardStyles";

type Rgb = [number, number, number];

const GOLD: Rgb = [232, 176, 62]; // mid-point of #F8C828 -> #EDA458
const GOLD_TEXT: Rgb = [154, 106, 23];
const INK: Rgb = [26, 26, 26];
const INK_SOFT: Rgb = [58, 58, 58];
const CREAM: Rgb = [255, 251, 242];
const CREAM_2: Rgb = [255, 246, 228];
const LINE: Rgb = [233, 223, 201];
const MUTED: Rgb = [138, 130, 114];
const MUTED_LABEL: Rgb = [164, 154, 130];
const EXPIRY: Rgb = [176, 74, 44];
const WHITE: Rgb = [255, 255, 255];

/** mm -> pt for font sizes: 1mm of cap height is about 2.835pt. */
const mmToPt = (mm: number) => mm * 2.835;

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
    // A cross-origin photo without CORS headers, or an offline API — the card
    // still prints, just with the placeholder avatar.
    return undefined;
  }
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

/**
 * Draws an image clipped to a circle when the jsPDF build supports clipping
 * paths, and falls back to the largest square that fits inside the circle
 * otherwise. The fallback is visibly square rather than silently cropping the
 * subject's head, which is what a centre-crop to a smaller square would do.
 */
function drawCircularImage(
  doc: jsPDF,
  dataUrl: string,
  cx: number,
  cy: number,
  radius: number,
) {
  const format = imageFormat(dataUrl);
  try {
    doc.saveGraphicsState();
    doc.circle(cx, cy, radius, null as unknown as "S");
    // @ts-expect-error — `clip` exists at runtime in jsPDF 4 but is absent
    // from the shipped type definitions.
    doc.clip();
    // @ts-expect-error — same: needed so the clip path itself isn't stroked.
    if (typeof doc.discardPath === "function") doc.discardPath();
    doc.addImage(dataUrl, format, cx - radius, cy - radius, radius * 2, radius * 2, undefined, "FAST");
    doc.restoreGraphicsState();
  } catch {
    doc.restoreGraphicsState?.();
    const side = radius * Math.SQRT2;
    doc.addImage(dataUrl, format, cx - side / 2, cy - side / 2, side, side, undefined, "FAST");
  }
}

const setFill = (doc: jsPDF, [r, g, b]: Rgb) => doc.setFillColor(r, g, b);
const setDraw = (doc: jsPDF, [r, g, b]: Rgb) => doc.setDrawColor(r, g, b);
const setText = (doc: jsPDF, [r, g, b]: Rgb) => doc.setTextColor(r, g, b);

/** Draws one front face onto the current page, offset by (ox, oy). */
async function drawFront(doc: jsPDF, data: IdCardData, logo: string | undefined, photo: string | undefined, ox = 0, oy = 0) {
  const W = CARD_WIDTH_MM;

  // Card ground.
  setFill(doc, CREAM);
  doc.rect(ox, oy, W, CARD_HEIGHT_MM, "F");

  // Top band + gold rule.
  setFill(doc, WHITE);
  doc.rect(ox, oy, W, 13.2, "F");
  setFill(doc, GOLD);
  doc.rect(ox, oy + 13.2 - 0.5, W, 0.5, "F");

  if (logo) {
    const logoH = 6.6;
    const logoW = Math.min(28, logoH * 4);
    doc.addImage(logo, imageFormat(logo), ox + (W - logoW) / 2, oy + 2.2, logoW, logoH, undefined, "FAST");
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(3.2));
    setText(doc, INK);
    doc.text(data.company.name, ox + W / 2, oy + 6.4, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mmToPt(1.5));
  setText(doc, [179, 166, 136]);
  doc.text("EMPLOYEE IDENTIFICATION", ox + W / 2, oy + 11.4, { align: "center" });

  // Photo: gold ring, cream inner, then the photo (or a placeholder disc).
  const photoCx = ox + W / 2;
  const photoCy = oy + 14.8 + 10;
  setFill(doc, GOLD);
  doc.circle(photoCx, photoCy, 10, "F");
  setFill(doc, [241, 237, 226]);
  doc.circle(photoCx, photoCy, 9.15, "F");
  if (photo) {
    drawCircularImage(doc, photo, photoCx, photoCy, 9.15);
  } else {
    setText(doc, [138, 90, 18]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(mmToPt(6));
    doc.text(
      `${data.employeeName.split(" ")[0]?.[0] ?? ""}${data.employeeName.split(" ").slice(-1)[0]?.[0] ?? ""}`.toUpperCase(),
      photoCx,
      photoCy + 2.4,
      { align: "center" },
    );
  }

  // Name / designation / department.
  let y = oy + 38.6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mmToPt(4.5));
  setText(doc, INK);
  doc.text(data.employeeName, ox + W / 2, y, { align: "center", maxWidth: W - 6 });
  y += 3.2;
  if (data.designation) {
    doc.setFontSize(mmToPt(2.35));
    setText(doc, GOLD_TEXT);
    doc.text(data.designation.toUpperCase(), ox + W / 2, y, { align: "center", maxWidth: W - 8 });
    y += 2.4;
  }
  if (data.department) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(2));
    setText(doc, [131, 121, 95]);
    doc.text(data.department, ox + W / 2, y, { align: "center", maxWidth: W - 8 });
    y += 2.2;
  }

  // Divider.
  y += 1.6;
  setDraw(doc, LINE);
  doc.setLineWidth(0.3);
  doc.line(ox + (W - 36) / 2, y, ox + (W + 36) / 2, y);
  y += 3;

  // Two-column data grid.
  const cells: [string, string, boolean][] = [];
  if (data.employeeCode) cells.push(["EMPLOYEE ID", data.employeeCode, false]);
  if (data.bloodGroup) cells.push(["BLOOD GROUP", data.bloodGroup, false]);
  if (data.issueDate) cells.push(["DATE OF JOINING", data.issueDate, false]);
  if (data.cellNumber) cells.push(["CELL NUMBER", data.cellNumber, false]);

  const gridX = ox + (W - 47) / 2;
  const colW = (47 - 2.6) / 2;
  const rowH = 5.6;
  cells.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = gridX + col * (colW + 2.6);
    const cy = y + row * rowH;
    setFill(doc, GOLD);
    doc.rect(cx, cy - 1.4, 0.45, 4.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.5));
    setText(doc, MUTED_LABEL);
    doc.text(label, cx + 1.6, cy);
    doc.setFontSize(mmToPt(2.3));
    setText(doc, INK);
    doc.text(value, cx + 1.6, cy + 2.6, { maxWidth: colW - 2 });
  });
  y += Math.ceil(cells.length / 2) * rowH;

  // Valid Until spans the full grid width.
  if (data.expiryDate) {
    setFill(doc, GOLD);
    doc.rect(gridX, y - 1.4, 0.45, 4.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.5));
    setText(doc, MUTED_LABEL);
    doc.text("VALID UNTIL", gridX + 1.6, y);
    doc.setFontSize(mmToPt(2.3));
    setText(doc, EXPIRY);
    doc.text(data.expiryDate, gridX + 1.6, y + 2.6);
  }

  // Bottom strip: signature line + QR.
  const stripTop = oy + CARD_HEIGHT_MM - 17.6;
  setFill(doc, CREAM_2);
  doc.rect(ox, stripTop + 5.6, W, 12, "F");

  const qrSize = 10.4;
  const qrX = ox + W - 4 - qrSize;
  const qrY = oy + CARD_HEIGHT_MM - 2.4 - qrSize;
  try {
    const qr = await QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 240, errorCorrectionLevel: "M" });
    setFill(doc, WHITE);
    setDraw(doc, LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(qrX, qrY, qrSize, qrSize, 1, 1, "FD");
    doc.addImage(qr, "PNG", qrX + 0.5, qrY + 0.5, qrSize - 1, qrSize - 1);
  } catch {
    // QR generation failed — leave the box empty rather than abort the PDF.
  }

  const sigRight = qrX - 3;
  setDraw(doc, [184, 174, 146]);
  doc.setLineWidth(0.25);
  doc.line(ox + 4, qrY + qrSize - 2.4, sigRight, qrY + qrSize - 2.4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mmToPt(1.55));
  setText(doc, MUTED_LABEL);
  doc.text("EMPLOYEE SIGNATURE", ox + 4, qrY + qrSize);
}

/** Draws one back face onto the current page, offset by (ox, oy). */
async function drawBack(doc: jsPDF, data: IdCardData, logo: string | undefined, ox = 0, oy = 0) {
  const W = CARD_WIDTH_MM;

  setFill(doc, CREAM);
  doc.rect(ox, oy, W, CARD_HEIGHT_MM, "F");

  // Top band.
  setFill(doc, CREAM_2);
  doc.rect(ox, oy, W, 12.6, "F");
  setDraw(doc, LINE);
  doc.setLineWidth(0.25);
  doc.line(ox, oy + 12.6, ox + W, oy + 12.6);
  if (logo) {
    const logoH = 5.4;
    const logoW = Math.min(26, logoH * 4);
    doc.addImage(logo, imageFormat(logo), ox + (W - logoW) / 2, oy + 3.6, logoW, logoH, undefined, "FAST");
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(2.8));
    setText(doc, INK);
    doc.text(data.company.name, ox + W / 2, oy + 7.6, { align: "center" });
  }

  let y = oy + 16.5;
  const left = ox + 4.6;
  const contentW = W - 9.2;

  const sectionTitle = (title: string) => {
    setFill(doc, GOLD);
    doc.circle(left + 0.65, y - 0.6, 0.65, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.8));
    setText(doc, GOLD_TEXT);
    doc.text(title, left + 2.2, y);
    y += 2.6;
  };

  const rule = () => {
    setDraw(doc, LINE);
    doc.setLineWidth(0.2);
    doc.line(left, y, left + contentW, y);
    y += 2.2;
  };

  if (data.emergencyName || data.emergencyPhone) {
    sectionTitle("EMERGENCY CONTACT");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.9));
    setText(doc, INK);
    const parts = [
      data.emergencyName,
      data.emergencyRelation ? `(${data.emergencyRelation})` : undefined,
      data.emergencyPhone ? `— ${data.emergencyPhone}` : undefined,
    ].filter(Boolean);
    doc.text(parts.join(" "), left, y, { maxWidth: contentW });
    y += 3;
    rule();
  }

  if (data.employeeAddress) {
    sectionTitle("EMPLOYEE ADDRESS");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.9));
    setText(doc, INK);
    const lines = data.employeeAddress.split("\n");
    lines.forEach((line) => {
      doc.text(line, left, y, { maxWidth: contentW });
      y += 2.4;
    });
    y += 0.6;
    rule();
  }

  const contacts = [data.company.address, data.company.phone, data.company.email].filter(
    (value): value is string => Boolean(value),
  );
  if (contacts.length > 0) {
    sectionTitle("COMPANY CONTACT");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.8));
    setText(doc, INK_SOFT);
    contacts.forEach((value) => {
      setFill(doc, GOLD);
      doc.circle(left + 0.5, y - 0.6, 0.4, "F");
      setText(doc, INK_SOFT);
      doc.text(value, left + 2.2, y, { maxWidth: contentW - 2.2 });
      y += 2.6;
    });
    y += 0.6;
  }

  // Verification QR row.
  const rowH = 9.8;
  setFill(doc, WHITE);
  setDraw(doc, LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(left, y, contentW, rowH, 1.4, 1.4, "FD");
  try {
    const qr = await QRCode.toDataURL(data.verifyUrl, { margin: 0, width: 200, errorCorrectionLevel: "M" });
    doc.addImage(qr, "PNG", left + 1.9, y + 1, 7.8, 7.8);
  } catch {
    // See drawFront — an empty box is better than a failed download.
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mmToPt(1.6));
  setText(doc, [124, 117, 104]);
  doc.text("SCAN TO VERIFY IDENTITY", left + 11.9, y + 5.4, { maxWidth: contentW - 13 });
  y += rowH + 2;

  // Barcode.
  const barcode = code128DataUrl(data.employeeCode, { moduleWidth: 3, height: 90 });
  if (barcode) {
    doc.addImage(barcode, "PNG", ox + (W - 34) / 2, y, 34, 5);
    y += 5.6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mmToPt(1.3));
  setText(doc, MUTED_LABEL);
  doc.text(data.employeeCode, ox + W / 2, y, { align: "center" });
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(mmToPt(1.75));
  setText(doc, INK);
  doc.text(`If found, please return to ${data.company.name}.`, ox + W / 2, y, {
    align: "center",
    maxWidth: contentW,
  });
  y += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(mmToPt(1.3));
  setText(doc, [155, 147, 127]);
  doc.text(
    `This card remains the property of ${data.company.name} and must be returned upon request or termination of employment.`,
    ox + W / 2,
    y,
    { align: "center", maxWidth: contentW },
  );

  // Footer.
  const footerTop = oy + CARD_HEIGHT_MM - 8.4;
  setFill(doc, CREAM);
  doc.rect(ox, footerTop, W, 8.4, "F");
  setDraw(doc, LINE);
  doc.setLineWidth(0.25);
  doc.line(ox, footerTop, ox + W, footerTop);
  const footerLine = [data.company.website, data.company.phone, data.company.email]
    .filter(Boolean)
    .join("  ·  ");
  if (footerLine) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mmToPt(1.35));
    setText(doc, MUTED);
    doc.text(footerLine, ox + W / 2, footerTop + 4.4, { align: "center", maxWidth: contentW });
  }
}

/**
 * Builds a PDF holding the front and back of every supplied card, one face per
 * page, sized to CR80 trim so it drops straight into a card printer.
 *
 * Photos and logos are fetched once per distinct URL and reused across cards, so
 * a 50-card batch makes one request for the shared company logo rather than 50.
 */
export async function buildIdCardsPdf(cards: IdCardData[]): Promise<jsPDF> {
  const doc = new jsPDF({
    unit: "mm",
    format: [CARD_WIDTH_MM, CARD_HEIGHT_MM],
    orientation: "portrait",
    compress: true,
  });

  const imageCache = new Map<string, string | undefined>();
  const loadImage = async (url?: string) => {
    if (!url) return undefined;
    if (!imageCache.has(url)) imageCache.set(url, await fetchAsDataUrl(url));
    return imageCache.get(url);
  };

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const [logo, photo] = await Promise.all([
      loadImage(card.company.logoUrl),
      loadImage(card.photoUrl),
    ]);

    if (i > 0) doc.addPage([CARD_WIDTH_MM, CARD_HEIGHT_MM], "portrait");
    await drawFront(doc, card, logo, photo);

    doc.addPage([CARD_WIDTH_MM, CARD_HEIGHT_MM], "portrait");
    await drawBack(doc, card, logo);
  }

  return doc;
}

export async function downloadIdCardsPdf(cards: IdCardData[], filename: string) {
  const doc = await buildIdCardsPdf(cards);
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
