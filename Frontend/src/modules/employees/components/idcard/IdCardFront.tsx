// The front face of the employee ID card.
//
// Geometry transcribed from Backend/TechnoCues_ID_Card.html (top band, photo
// with conic-gradient ring, name/designation/department, two-column data
// grid, QR strip with signature area) and rebuilt as a typed component fed by
// `IdCardData` — nothing is hardcoded per-employee here, and no legacy HTML is
// embedded. `role="img"` with an aria-label makes the whole face readable to
// assistive tech instead of a pile of anonymous text nodes.

import type { ReactNode } from "react";
import {
  CARD_COLORS,
  cardFaceStyle,
  cornerRingStyle,
} from "@/modules/employees/components/idcard/idCardStyles";
import type { IdCardData } from "@/modules/employees/components/idcard/idCardData";
import { useQrDataUrl } from "@/modules/employees/components/idcard/useQrDataUrl";

/** Placeholder avatar shown when the employee has no photo. */
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#8a5a12" strokeWidth="1.4" style={{ width: "68%", height: "68%", opacity: 0.26 }}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

/** A data-grid cell with a gold left rule, like the legacy `.cell`. */
function Cell({
  label,
  value,
  full = false,
  expiry = false,
}: {
  label: string;
  value?: string;
  full?: boolean;
  expiry?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      style={{
        borderLeft: "0.45mm solid",
        borderImage: "linear-gradient(180deg, #F8C828, #EDA458) 1",
        paddingLeft: "1.6mm",
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <div style={{ fontSize: "1.5mm", textTransform: "uppercase", letterSpacing: "0.07em", color: CARD_COLORS.mutedLabel, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ marginTop: "0.3mm", fontFamily: "'Poppins', sans-serif", fontSize: "2.3mm", color: expiry ? CARD_COLORS.expiry : CARD_COLORS.ink, fontWeight: 700, lineHeight: 1.15 }}>
        {value}
      </div>
    </div>
  );
}

export function IdCardFront({ data }: { data: IdCardData }) {
  const qr = useQrDataUrl(data.verifyUrl);

  const cells: ReactNode[] = [
    <Cell key="id" label="Employee ID" value={data.employeeCode} />,
    <Cell key="blood" label="Blood Group" value={data.bloodGroup} />,
    <Cell key="issue" label="Date of Joining" value={data.issueDate} />,
    <Cell key="cell" label="Cell Number" value={data.cellNumber} />,
    <Cell key="expiry" label="Valid Until" value={data.expiryDate} full expiry />,
  ];

  return (
    <div role="img" aria-label={`Employee ID card for ${data.employeeName}`} style={cardFaceStyle}>
      {/* Decorative geometry — purely visual, hidden from assistive tech. */}
      <div aria-hidden="true" style={cornerRingStyle("28mm", { top: "-10mm", left: "-10mm" })} />
      <div aria-hidden="true" style={cornerRingStyle("18mm", { bottom: "12mm", right: "-8mm" })} />
      {data.company.logoUrl && (
        // The legacy badge watermark (a faint logo behind the front content).
        <img
          aria-hidden="true"
          alt=""
          src={data.company.logoUrl}
          style={{ position: "absolute", zIndex: 0, width: "52mm", height: "52mm", opacity: 0.13, filter: "blur(1.1px)", right: "-16mm", bottom: "-14mm", pointerEvents: "none" }}
        />
      )}

      {/* Top band: company name + tagline. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "13.2mm",
          background: "linear-gradient(180deg, #FFFFFF 0%, #FFFBF2 100%)",
          borderBottom: "0.5mm solid transparent",
          borderImage: "linear-gradient(90deg, #F8C828, #EDA458) 1",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5mm",
        }}
      >
        {data.company.logoUrl ? (
          <img src={data.company.logoUrl} alt={data.company.name} style={{ height: "6.6mm", maxWidth: "40mm", objectFit: "contain" }} />
        ) : (
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: "3.2mm", fontWeight: 800, color: CARD_COLORS.ink }}>
            {data.company.name}
          </div>
        )}
        <div style={{ fontSize: "1.5mm", letterSpacing: "0.14em", textTransform: "uppercase", color: "#b3a688", fontWeight: 600 }}>
          Employee Identification
        </div>
      </div>
      {/* Three gold dots, top-right of the band. */}
      <div aria-hidden="true" style={{ position: "absolute", right: "2.6mm", top: "2.2mm", display: "flex", gap: "0.7mm", zIndex: 2 }}>
        {[1, 0.55, 0.3].map((opacity, i) => (
          <span key={i} style={{ width: "1mm", height: "1mm", borderRadius: "50%", background: "linear-gradient(135deg,#F8C828,#EDA458)", display: "block", opacity }} />
        ))}
      </div>

      {/* Photo with conic-gradient ring. */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          margin: "14.8mm auto 0",
          width: "20mm",
          height: "20mm",
          borderRadius: "50%",
          padding: "0.85mm",
          background: "conic-gradient(from 180deg, #F8C828, #EDA458, #F8C828)",
          boxShadow: "0 2.6mm 3.6mm -2mm rgba(20,15,5,0.32)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: "radial-gradient(circle at 32% 28%, #fff 0%, #f1ede2 45%, #e4dfd0 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            border: "0.5mm solid #FFFBF2",
          }}
        >
          {data.photoUrl ? (
            <img
              src={data.photoUrl}
              alt={data.employeeName}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", borderRadius: "50%" }}
            />
          ) : (
            <PersonIcon />
          )}
        </div>
      </div>

      {/* Name / designation / department. */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", marginTop: "2.6mm" }}>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: "4.5mm", fontWeight: 800, color: CARD_COLORS.ink, letterSpacing: "-0.01em", lineHeight: 1.05 }}>
          {data.employeeName}
        </div>
        {data.designation && (
          <div
            style={{
              marginTop: "1mm",
              display: "inline-block",
              fontFamily: "'Poppins', sans-serif",
              fontSize: "2.35mm",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "linear-gradient(90deg,#B9840F,#EDA458)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {data.designation}
          </div>
        )}
        {data.department && (
          <div style={{ marginTop: "0.7mm", fontSize: "2mm", color: "#83795f", fontWeight: 600, letterSpacing: "0.015em" }}>
            {data.department}
          </div>
        )}
      </div>

      {/* Divider. */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 2,
          width: "36mm",
          height: "0.3mm",
          margin: "2.3mm auto 2.3mm",
          background: "linear-gradient(90deg, transparent, #E9DFC9, transparent)",
        }}
      />

      {/* Two-column data grid. */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "47mm",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: "2.6mm",
          rowGap: "1.5mm",
        }}
      >
        {cells}
      </div>

      {/* QR strip: signature area + verification QR. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          height: "17.6mm",
          background: "linear-gradient(180deg, transparent, #FFF6E4 32%)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 4mm 2.4mm",
        }}
      >
        <div style={{ flex: 1, marginRight: "3mm" }}>
          <div style={{ width: "100%", height: "0.25mm", background: "#b8ae92", marginBottom: "0.9mm" }} />
          <div style={{ fontSize: "1.55mm", letterSpacing: "0.05em", textTransform: "uppercase", color: "#a49a82", fontWeight: 700 }}>
            Employee Signature
          </div>
        </div>
        <div
          style={{
            width: "10.4mm",
            height: "10.4mm",
            background: "#FFFFFF",
            borderRadius: "1mm",
            border: "0.2mm solid #E9DFC9",
            padding: "0.5mm",
            flex: "none",
            boxShadow: "0 1mm 2mm rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {qr && <img src={qr} alt="" style={{ width: "100%", height: "100%" }} />}
        </div>
      </div>
    </div>
  );
}
