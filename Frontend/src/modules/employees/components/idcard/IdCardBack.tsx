// The back face of the employee ID card.
//
// Geometry transcribed from Backend/TechnoCues_ID_Card.html (top band, block
// sections with gold-title dots, contact grid, verification QR row, CODE128
// barcode strip, return note + legal line, bottom footer) and rebuilt as a
// typed component fed by `IdCardData`. Sections whose data is absent — e.g. no
// emergency contact on file — are omitted rather than printed empty.

import type { ReactNode } from "react";
import { CARD_COLORS, cardFaceStyle } from "@/modules/employees/components/idcard/idCardStyles";
import type { IdCardData } from "@/modules/employees/components/idcard/idCardData";
import { useQrDataUrl } from "@/modules/employees/components/idcard/useQrDataUrl";
import { useBarcodeDataUrl } from "@/modules/employees/components/idcard/useBarcodeDataUrl";

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Poppins', sans-serif",
        fontSize: "1.8mm",
        fontWeight: 800,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: CARD_COLORS.goldText,
        display: "flex",
        alignItems: "center",
        gap: "1.2mm",
      }}
    >
      <span aria-hidden="true" style={{ width: "1.3mm", height: "1.3mm", borderRadius: "50%", background: "linear-gradient(135deg,#F8C828,#EDA458)", display: "inline-block" }} />
      {children}
    </div>
  );
}

function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "1.5mm", fontSize: "1.8mm", color: CARD_COLORS.inkSoft, fontWeight: 600, alignItems: "flex-start" }}>
      <span aria-hidden="true" style={{ width: "2.3mm", height: "2.3mm", flex: "none", marginTop: "0.3mm", stroke: CARD_COLORS.goldText, display: "inline-block" }}>
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function IdCardBack({ data }: { data: IdCardData }) {
  const qr = useQrDataUrl(data.verifyUrl);
  const barcode = useBarcodeDataUrl(data.employeeCode);

  const emergency = data.emergencyName || data.emergencyPhone;
  const address = data.employeeAddress;

  return (
    <div role="img" aria-label={`Employee ID card (back) for ${data.employeeName}`} style={cardFaceStyle}>
      {data.company.logoUrl && (
        <img
          aria-hidden="true"
          alt=""
          src={data.company.logoUrl}
          style={{ position: "absolute", zIndex: 0, left: "-17mm", top: "22mm", transform: "rotate(-8deg)", width: "52mm", height: "52mm", opacity: 0.13, filter: "blur(1.1px)", pointerEvents: "none" }}
        />
      )}
      {/* Bottom gold wave. */}
      <div aria-hidden="true" style={{ position: "absolute", zIndex: 0, left: 0, right: 0, bottom: 0, height: "30mm", background: "linear-gradient(180deg, transparent, rgba(248,200,40,0.14))" }} />

      {/* Top band with company logo. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "12.6mm",
          background: CARD_COLORS.cream2,
          borderBottom: "0.25mm solid #E9DFC9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        {data.company.logoUrl ? (
          <img src={data.company.logoUrl} alt={data.company.name} style={{ height: "5.4mm", maxWidth: "40mm", objectFit: "contain" }} />
        ) : (
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: "2.8mm", fontWeight: 800, color: CARD_COLORS.ink }}>
            {data.company.name}
          </div>
        )}
      </div>

      <div style={{ position: "relative", zIndex: 2, padding: "13mm 4.6mm 0", display: "flex", flexDirection: "column", gap: "1mm" }}>
        {emergency && (
          <>
            <div>
              <SectionTitle>Emergency Contact</SectionTitle>
              <div style={{ fontSize: "1.9mm", color: CARD_COLORS.ink, lineHeight: 1.28, fontWeight: 600 }}>
                {data.emergencyName && <>{data.emergencyName}</>}
                {data.emergencyRelation && <span style={{ color: "#8a8272", fontWeight: 500 }}> ({data.emergencyRelation})</span>}
                {data.emergencyPhone && <span style={{ color: "#8a8272", fontWeight: 500 }}> — {data.emergencyPhone}</span>}
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "0.2mm solid #E9DFC9", margin: "0.1mm 0" }} />
          </>
        )}

        {address && (
          <>
            <div>
              <SectionTitle>Employee Address</SectionTitle>
              <div style={{ fontSize: "1.9mm", color: CARD_COLORS.ink, lineHeight: 1.28, fontWeight: 600, whiteSpace: "pre-line" }}>
                {data.employeeAddress}
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "0.2mm solid #E9DFC9", margin: "0.1mm 0" }} />
          </>
        )}

        <div>
          <SectionTitle>Company Contact</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9mm", marginTop: "1mm" }}>
            {data.company.address && (
              <ContactRow
                icon={
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                }
              >
                {data.company.address}
              </ContactRow>
            )}
            {data.company.phone && (
              <ContactRow
                icon={
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
                  </svg>
                }
              >
                {data.company.phone}
              </ContactRow>
            )}
            {data.company.email && (
              <ContactRow
                icon={
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
                    <path d="M4 4h16v16H4z" />
                    <path d="m22 6-10 7L2 6" />
                  </svg>
                }
              >
                {data.company.email}
              </ContactRow>
            )}
          </div>
        </div>

        {/* Verification QR. */}
        <div style={{ display: "flex", alignItems: "center", gap: "2.2mm", marginTop: "0.4mm", background: "#FFFFFF", border: "0.2mm solid #E9DFC9", borderRadius: "1.4mm", padding: "1mm 1.9mm" }}>
          <div style={{ width: "7.8mm", height: "7.8mm", background: "#FFFFFF", borderRadius: "0.8mm", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {qr && <img src={qr} alt="" style={{ width: "100%", height: "100%" }} />}
          </div>
          <div style={{ fontSize: "1.6mm", color: "#7c7568", fontWeight: 700, lineHeight: 1.3, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Scan to verify identity
          </div>
        </div>

        {/* Barcode strip. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2mm", marginTop: "0.2mm" }}>
          {barcode && <img src={barcode} alt="" style={{ width: "34mm", height: "5mm" }} />}
          <div style={{ fontSize: "1.3mm", letterSpacing: "0.09em", textTransform: "uppercase", color: "#a49a82", fontWeight: 700 }}>
            {data.employeeCode}
          </div>
        </div>

        <div style={{ marginTop: "0.4mm", fontFamily: "'Poppins', sans-serif", fontSize: "1.75mm", fontWeight: 800, color: CARD_COLORS.ink, textAlign: "center" }}>
          If found, please return to {data.company.name}.
        </div>
        <div style={{ fontSize: "1.3mm", color: "#9b937f", lineHeight: 1.28, textAlign: "center", fontWeight: 500, marginTop: "0.3mm" }}>
          This card remains the property of {data.company.name} and must be returned upon request or termination of employment.
        </div>
      </div>

      {/* Footer contact line. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          height: "8.4mm",
          borderTop: "0.25mm solid #E9DFC9",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.6mm",
          background: CARD_COLORS.cream,
        }}
      >
        {[data.company.website, data.company.phone, data.company.email].some(Boolean) && (
          <div style={{ fontSize: "1.35mm", color: "#8a8272", fontWeight: 600, letterSpacing: "0.005em" }}>
            {[data.company.website, data.company.phone, data.company.email].filter(Boolean).join("  ·  ")}
          </div>
        )}
        <div style={{ fontSize: "1.2mm", color: "#b3a688", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {data.company.name} Employee ID
        </div>
      </div>
    </div>
  );
}
