// ============================================================================
// HR certificates — client-side PDF generation.
//
// Every field on the printed certificate is read from the live `Employee`
// record and the configured Branding settings; nothing is typed in twice and
// nothing is invented. The only values a user supplies are the ones the HRMS
// genuinely does not store: the completion date (which defaults to today) and
// an optional remarks line.
//
// Built with jsPDF's vector primitives like payslipPdf.ts and idCardPdf.ts, so
// there is no template service to deploy and the output is text — selectable,
// searchable, and a fraction of the size of a rasterised page.
// ============================================================================

import { jsPDF } from "jspdf";

import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import { signatoriesApi, type BrandingSettings } from "@/modules/settings/api/settingsApi";
import { fetchAsDataUrl, resolveLogoDataUrl } from "@/modules/payroll/utils/payslipPdf";

export type CertificateType = "completion" | "experience" | "employment";

type BodyContext = {
  name: string;
  code: string;
  designation: string;
  department: string;
  company: string;
  startDate: string;
  endDate: string;
};

type CertificateDefinition = {
  label: string;
  /** Printed heading. */
  title: string;
  /** Small line under the heading. */
  subtitle: string;
  /** Short prefix for the reference number. */
  refPrefix: string;
  /** Whether the form should collect a completion/end date. */
  needsEndDate: boolean;
  paragraphs: (ctx: BodyContext) => string[];
};

/**
 * The catalogue, keyed by the value stored in the picker.
 *
 * All three types are assembled from exactly the same auto-fetched fields —
 * they differ only in wording — so adding one costs a block of prose rather
 * than another round of data plumbing.
 *
 * The prose deliberately avoids gendered pronouns. `users.gender` records a
 * gender, which is not the same thing as a person's pronouns, and a formal
 * certificate is the worst possible place to guess wrong.
 */
export const CERTIFICATE_TYPES: Record<CertificateType, CertificateDefinition> = {
  completion: {
    label: "Completion Certificate",
    title: "Certificate of Completion",
    subtitle: "This is to certify the successful completion of service",
    refPrefix: "COMP",
    needsEndDate: true,
    paragraphs: ({ name, code, designation, department, company, startDate, endDate }) => [
      `This is to certify that ${name} (Employee ID: ${code}) has successfully completed their term of service with ${company} as ${designation} in the ${department} department.`,
      `The period of engagement was from ${startDate} to ${endDate}.`,
      `During this period, conduct and performance were found to be satisfactory, and all assigned responsibilities were discharged diligently.`,
      `This certificate is issued at the request of ${name} for whatever purpose it may serve.`,
    ],
  },
  experience: {
    label: "Experience Certificate",
    title: "Experience Certificate",
    subtitle: "A record of service rendered",
    refPrefix: "EXP",
    needsEndDate: true,
    paragraphs: ({ name, code, designation, department, company, startDate, endDate }) => [
      `This is to certify that ${name} (Employee ID: ${code}) was employed with ${company} from ${startDate} to ${endDate}.`,
      `At the time of leaving, the role held was ${designation} in the ${department} department.`,
      `Throughout the tenure, professional conduct was found to be satisfactory and duties were carried out to the expected standard.`,
      `We wish ${name} every success in all future endeavours.`,
    ],
  },
  employment: {
    label: "Employment Verification Letter",
    title: "Employment Verification",
    subtitle: "Confirmation of current employment",
    refPrefix: "EMP",
    needsEndDate: false,
    paragraphs: ({ name, code, designation, department, company, startDate }) => [
      `This is to certify that ${name} (Employee ID: ${code}) is currently employed with ${company} as ${designation} in the ${department} department.`,
      `The date of joining on record is ${startDate}, and the employment is active as of the date of issue below.`,
      `This letter is issued at the request of ${name} for verification purposes and does not constitute an offer, a contract, or any guarantee of continued employment.`,
    ],
  },
};

/** One printed signature block: a rule, an optional image above it, then names. */
export type CertificateSignatory = {
  name: string;
  /** Role printed under the name — "Chief Executive Officer", "Co-Founder". */
  title: string;
  /** Data URL of the uploaded signature. Absent prints the rule and name only. */
  signatureDataUrl?: string;
};

/**
 * A pre-faded logo for the page background.
 *
 * jsPDF has no dependable alpha channel across versions, so the fade is baked
 * into the bitmap before it ever reaches `addImage`. The ratio travels with it
 * because the placement has to preserve the logo's shape.
 */
export type CertificateWatermark = {
  dataUrl: string;
  /** width ÷ height of the source image. */
  aspectRatio: number;
};

export type CertificateInput = {
  type: CertificateType;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  /** Joining date, already formatted for print. */
  startDate: string;
  /** Completion / relieving date, already formatted. Empty when not needed. */
  endDate: string;
  /** Date printed in the signature block. */
  issueDate: string;
  /** Deterministic per employee, type and issue date. */
  referenceNo: string;
  /** Optional free-text line appended before the signature block. */
  remarks?: string;
  company: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    logoDataUrl?: string;
    /** Faded logo drawn behind the body copy. Absent draws no watermark. */
    watermark?: CertificateWatermark;
  };
  /**
   * Who signs, left to right. Empty prints the generic "Authorised Signatory"
   * block — a company that has configured nobody still gets a valid
   * certificate, which is the whole point of these being optional.
   */
  signatories?: CertificateSignatory[];
};

/** `03 February 2026` — the long form a formal letter uses. */
export function formatCertificateDate(value?: string | Date): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const toIsoDay = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/**
 * Pulls every printable field off the live record.
 *
 * Missing relations degrade to a readable phrase rather than an empty gap or a
 * fabricated value — an employee with no designation on file reads "an employee
 * of the company", which is true, instead of a blank where a job title belongs.
 */
export function buildCertificateInput(
  employee: Employee,
  branding: BrandingSettings | undefined,
  type: CertificateType,
  options: { endDate?: string; remarks?: string; issueDate?: Date } = {},
): CertificateInput {
  const issuedOn = options.issueDate ?? new Date();
  const code = employee.employee_code || employee.user_id.slice(0, 8).toUpperCase();

  return {
    type,
    employeeName: fullName(employee) || "the employee",
    employeeCode: code,
    designation: employee.designation?.title || "an employee of the company",
    department: employee.department?.department_name || "assigned",
    startDate: formatCertificateDate(employee.joining_date),
    endDate: CERTIFICATE_TYPES[type].needsEndDate
      ? formatCertificateDate(options.endDate || issuedOn)
      : "",
    issueDate: formatCertificateDate(issuedOn),
    referenceNo: `${CERTIFICATE_TYPES[type].refPrefix}-${code}-${toIsoDay(issuedOn)}`,
    remarks: options.remarks?.trim() || undefined,
    company: {
      name: branding?.companyName || "The Company",
      address: branding?.address || undefined,
      phone: branding?.phone || undefined,
      email: branding?.email || undefined,
      website: branding?.website || undefined,
    },
  };
}

// Kept in sync with tailwind.config.js so a certificate looks like it came out
// of this app rather than out of a generic PDF library.
const BRAND_DARK = { r: 199, g: 122, b: 46 };
const INK = { r: 31, g: 41, b: 55 }; // gray-800
const MUTED = { r: 107, g: 114, b: 128 }; // gray-500
const LINE = { r: 229, g: 231, b: 235 }; // gray-200

const setFill = (doc: jsPDF, c: { r: number; g: number; b: number }) => doc.setFillColor(c.r, c.g, c.b);
const setText = (doc: jsPDF, c: { r: number; g: number; b: number }) => doc.setTextColor(c.r, c.g, c.b);
const setDraw = (doc: jsPDF, c: { r: number; g: number; b: number }) => doc.setDrawColor(c.r, c.g, c.b);

// The certificate is the one document in the app set in a serif face. A letter
// carrying a company's signature reads as a formal document rather than a UI
// screenshot, and `times` is a jsPDF built-in — no font to embed, no bundle cost.
const SERIF = "times";

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

/** Width of one signature column, and of the rule that gets signed over. */
const SIGNATURE_COLUMN_WIDTH = 60;

/**
 * One signature column: image over a rule, then name and title.
 *
 * `baseline` is the y of the rule, and everything else is positioned from it, so
 * two columns line up whatever their images measure. The company name is only
 * printed for the anonymous fallback block — under a named signatory it would be
 * the third setting of a name the letterhead has already given.
 */
function drawSignatureBlock(
  doc: jsPDF,
  signatory: CertificateSignatory,
  options: {
    left: number;
    baseline: number;
    align: "left" | "right";
    company?: string;
  },
): void {
  const { left, baseline, align, company } = options;
  const right = left + SIGNATURE_COLUMN_WIDTH;
  const textX = align === "right" ? right : left;

  if (signatory.signatureDataUrl) {
    try {
      // Fitted to the column and clamped in height, so a tall scan cannot climb
      // into the body copy above. The aspect ratio comes from the image itself —
      // a signature stretched to fill a fixed box does not look like a signature.
      const maxHeight = 15;
      const maxWidth = SIGNATURE_COLUMN_WIDTH - 6;
      let drawWidth = maxWidth;
      let drawHeight = maxHeight;

      const props = doc.getImageProperties(signatory.signatureDataUrl);
      const ratio = props.width / props.height;
      if (Number.isFinite(ratio) && ratio > 0) {
        drawHeight = Math.min(maxHeight, maxWidth / ratio);
        drawWidth = drawHeight * ratio;
      }

      doc.addImage(
        signatory.signatureDataUrl,
        imageFormatFromDataUrl(signatory.signatureDataUrl),
        left + (SIGNATURE_COLUMN_WIDTH - drawWidth) / 2,
        baseline - drawHeight - 1.5,
        drawWidth,
        drawHeight,
        undefined,
        "FAST",
      );
    } catch {
      // An unreadable signature image leaves the rule to be signed by hand,
      // which is strictly better than failing the download.
    }
  }

  setDraw(doc, INK);
  doc.setLineWidth(0.4);
  doc.line(left, baseline, right, baseline);

  doc.setFont(SERIF, "bold");
  doc.setFontSize(10);
  setText(doc, INK);
  doc.text(signatory.name, textX, baseline + 5, { align });

  doc.setFont(SERIF, "normal");
  doc.setFontSize(9);
  setText(doc, MUTED);
  doc.text(signatory.title, textX, baseline + 10, { align });
  if (company) doc.text(company, textX, baseline + 14.5, { align });
}

export function buildCertificatePdf(input: CertificateInput): jsPDF {
  const def = CERTIFICATE_TYPES[input.type];
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const contentWidth = pageWidth - marginX * 2;

  // ---- Decorative frame ---------------------------------------------------
  setDraw(doc, BRAND_DARK);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  setDraw(doc, LINE);
  doc.setLineWidth(0.3);
  doc.rect(13, 13, pageWidth - 26, pageHeight - 26);

  // ---- Watermark ----------------------------------------------------------
  // The logo, not the company name set huge — the name is already printed in
  // the letterhead and in the body copy, and a third setting of the same word
  // was decoration pretending to be branding.
  //
  // Drawn before everything else so the body copy lands on top of it. The fade
  // is already baked into the bitmap (see `fadeImageForWatermark`), because
  // jsPDF's alpha support is not dependable across versions. With no logo
  // configured the page simply carries no watermark.
  if (input.company.watermark) {
    try {
      const width = pageWidth * 0.62;
      const height = width / (input.company.watermark.aspectRatio || 1);
      doc.addImage(
        input.company.watermark.dataUrl,
        "PNG",
        (pageWidth - width) / 2,
        (pageHeight - height) / 2,
        width,
        height,
        undefined,
        "FAST",
      );
    } catch {
      // Same rule as the letterhead: an undecodable logo costs the watermark,
      // never the certificate.
    }
  }

  let y = 26;

  // ---- Letterhead ---------------------------------------------------------
  if (input.company.logoDataUrl) {
    try {
      doc.addImage(
        input.company.logoDataUrl,
        imageFormatFromDataUrl(input.company.logoDataUrl),
        pageWidth / 2 - 11,
        y,
        22,
        22,
        undefined,
        "FAST",
      );
      y += 26;
    } catch {
      // A logo that jsPDF can't decode shouldn't cost the certificate.
    }
  }

  // The company name in the letterhead is printed only when there is no logo
  // above it. With a logo, the mark carries the name and printing it again
  // immediately underneath said the same thing twice.
  if (!input.company.logoDataUrl) {
    doc.setFont(SERIF, "bold");
    doc.setFontSize(15);
    setText(doc, INK);
    doc.text(input.company.name.toUpperCase(), pageWidth / 2, y, { align: "center" });
    y += 5.5;
  }

  const contactLine = [input.company.address, input.company.phone, input.company.email]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) {
    doc.setFont(SERIF, "normal");
    doc.setFontSize(8);
    setText(doc, MUTED);
    for (const line of doc.splitTextToSize(contactLine, contentWidth) as string[]) {
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += 4;
    }
  }

  y += 4;
  setDraw(doc, BRAND_DARK);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageWidth - marginX, y);

  // ---- Title --------------------------------------------------------------
  y += 16;
  doc.setFont(SERIF, "bold");
  doc.setFontSize(24);
  setText(doc, BRAND_DARK);
  doc.text(def.title.toUpperCase(), pageWidth / 2, y, { align: "center" });

  y += 7;
  doc.setFont(SERIF, "italic");
  doc.setFontSize(10);
  setText(doc, MUTED);
  doc.text(def.subtitle, pageWidth / 2, y, { align: "center" });

  // Short rule under the title, centred.
  y += 5;
  setDraw(doc, BRAND_DARK);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - 18, y, pageWidth / 2 + 18, y);

  // ---- Reference / date row ----------------------------------------------
  y += 12;
  doc.setFont(SERIF, "normal");
  doc.setFontSize(9);
  setText(doc, MUTED);
  doc.text(`Ref: ${input.referenceNo}`, marginX, y);
  doc.text(`Date: ${input.issueDate}`, pageWidth - marginX, y, { align: "right" });

  // ---- Body ---------------------------------------------------------------
  y += 14;
  doc.setFont(SERIF, "normal");
  doc.setFontSize(11.5);
  setText(doc, INK);

  const paragraphs = def.paragraphs({
    name: input.employeeName,
    code: input.employeeCode,
    designation: input.designation,
    department: input.department,
    company: input.company.name,
    startDate: input.startDate || "the recorded date of joining",
    endDate: input.endDate,
  });

  for (const paragraph of paragraphs) {
    for (const line of doc.splitTextToSize(paragraph, contentWidth) as string[]) {
      doc.text(line, marginX, y);
      y += 6.4;
    }
    y += 4;
  }

  if (input.remarks) {
    y += 2;
    setFill(doc, { r: 250, g: 246, b: 239 });
    const remarkLines = doc.splitTextToSize(input.remarks, contentWidth - 10) as string[];
    const boxHeight = remarkLines.length * 5.6 + 9;
    doc.roundedRect(marginX, y - 5, contentWidth, boxHeight, 2, 2, "F");
    doc.setFont(SERIF, "italic");
    doc.setFontSize(10.5);
    let ry = y + 1.5;
    for (const line of remarkLines) {
      doc.text(line, marginX + 5, ry);
      ry += 5.6;
    }
    y += boxHeight + 4;
  }

  // ---- Signature block ----------------------------------------------------
  // Pinned to the foot of the page rather than flowing after the body, so
  // certificates of different lengths still sign off in the same place.
  //
  // The layout follows how many signatories are configured, because all of them
  // are optional: two print as columns, one prints alone on the right where the
  // single block has always been, and none falls back to the anonymous block
  // this certificate carried before signatories existed.
  const signY = pageHeight - 52;
  const signatories = (input.signatories ?? []).filter((s) => s.name.trim());

  if (signatories.length >= 2) {
    drawSignatureBlock(doc, signatories[0], {
      left: marginX,
      baseline: signY,
      align: "left",
    });
    drawSignatureBlock(doc, signatories[1], {
      left: pageWidth - marginX - SIGNATURE_COLUMN_WIDTH,
      baseline: signY,
      align: "right",
    });
  } else if (signatories.length === 1) {
    drawSignatureBlock(doc, signatories[0], {
      left: pageWidth - marginX - SIGNATURE_COLUMN_WIDTH,
      baseline: signY,
      align: "right",
    });
  } else {
    drawSignatureBlock(
      doc,
      { name: "Authorised Signatory", title: "Human Resources" },
      {
        left: pageWidth - marginX - SIGNATURE_COLUMN_WIDTH,
        baseline: signY,
        align: "right",
        company: input.company.name,
      },
    );
  }

  // ---- Footer -------------------------------------------------------------
  setDraw(doc, LINE);
  doc.setLineWidth(0.3);
  doc.line(marginX, pageHeight - 24, pageWidth - marginX, pageHeight - 24);
  doc.setFont(SERIF, "normal");
  doc.setFontSize(7.5);
  setText(doc, MUTED);
  doc.text(
    `This is a computer-generated certificate issued from the HR system of ${input.company.name}.`,
    pageWidth / 2,
    pageHeight - 19,
    { align: "center" },
  );
  doc.text(
    `Quote reference ${input.referenceNo} for verification.${input.company.website ? `  ·  ${input.company.website}` : ""}`,
    pageWidth / 2,
    pageHeight - 15.5,
    { align: "center" },
  );

  return doc;
}

/**
 * Pre-fade a logo into a watermark bitmap.
 *
 * jsPDF's graphics-state alpha is not dependable across versions — which is why
 * the old text watermark used a near-white ink instead of transparency — so the
 * fade is composited here: the logo is drawn onto an opaque white canvas at low
 * alpha, producing a bitmap that is already pale. No alpha survives into the
 * PDF, so nothing depends on the viewer honouring it.
 *
 * White rather than transparent because the result is drawn under the body copy
 * on a white page; a transparent PNG would render identically but costs an
 * alpha channel jsPDF then has to carry.
 *
 * Returns undefined if the image can't be loaded or a canvas isn't available —
 * a certificate without a watermark is fine, a certificate that fails is not.
 */
async function fadeImageForWatermark(
  dataUrl: string,
  alpha = 0.06,
): Promise<CertificateWatermark | undefined> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("watermark image failed to load"));
      img.src = dataUrl;
    });

    if (!image.naturalWidth || !image.naturalHeight) return undefined;

    // Capped so a 4000px logo doesn't become a multi-megabyte PDF. The page
    // never prints it wider than ~130mm, and 900px covers that at print DPI.
    const scale = Math.min(1, 900 / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL("image/png"),
      aspectRatio: width / height,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch the configured signatories and turn them into printable blocks.
 *
 * Signature images go through `fetchAsDataUrl` rather than `resolveLogoDataUrl`,
 * which falls back to the bundled app logo when its argument is empty — on a
 * signature line that would print the company logo where a person's signature
 * belongs. Here a missing image simply means an empty rule to sign by hand.
 *
 * A failed fetch is not an error: the settings endpoint needs
 * `employees.documents.view`, the same permission that gates generating the
 * certificate at all, but a network blip must not block the download. The
 * certificate falls back to the anonymous signatory block.
 */
async function resolveSignatories(): Promise<CertificateSignatory[]> {
  try {
    const settings = await signatoriesApi.get();

    const configured = [
      {
        name: settings.ceoName.trim(),
        title: "Chief Executive Officer",
        url: settings.ceoSignatureUrl,
      },
      {
        name: settings.cofounderName.trim(),
        title: "Co-Founder",
        url: settings.cofounderSignatureUrl,
      },
    ].filter((s) => s.name);

    return await Promise.all(
      configured.map(async ({ name, title, url }) => ({
        name,
        title,
        signatureDataUrl: url ? await fetchAsDataUrl(url) : undefined,
      })),
    );
  } catch {
    return [];
  }
}

/** Resolves logo, watermark and signatories, then saves the certificate. */
export async function downloadCertificatePdf(
  input: CertificateInput,
  branding: BrandingSettings | undefined,
  filename: string,
): Promise<void> {
  const [logoDataUrl, signatories] = await Promise.all([
    resolveLogoDataUrl(branding?.logoUrl || undefined),
    resolveSignatories(),
  ]);

  // Faded from whatever the letterhead ended up using, including the bundled
  // fallback — so an unbranded company still gets a logo watermark rather than
  // a bare page.
  const watermark = logoDataUrl ? await fadeImageForWatermark(logoDataUrl) : undefined;

  const doc = buildCertificatePdf({
    ...input,
    company: { ...input.company, logoDataUrl, watermark },
    signatories,
  });
  doc.save(filename);
}


