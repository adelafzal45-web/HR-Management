import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import robot from "@/assets/robot-trimmed.png";
import icon from "@/assets/icon.png";
import badge from "@/assets/badge.png";
import panelTexture from "@/assets/panel-texture.jpg";
import { useAuth } from "@/app/providers/AuthContext";

type AuthLayoutProps = {
  heading: string;
  children: ReactNode;
};

// Reference design canvas the Figma coordinates were measured against.
// Every absolutely-positioned element below is expressed as a % of this
// canvas so the layout stays true to the spec at any viewport size.
const CANVAS_W = 1440;
const CANVAS_H = 1024;

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

const box = (spec: { left: number; top: number; width: number; height: number }): CSSProperties => ({
  left: pct(spec.left, CANVAS_W),
  top: pct(spec.top, CANVAS_H),
  width: pct(spec.width, CANVAS_W),
  height: pct(spec.height, CANVAS_H),
});

// --- Figma spec values ---
const BG_ICON_BOX = { left: 425.25, top: -195.52, width: 492.46, height: 492.37 };

export default function AuthLayout({ heading, children }: AuthLayoutProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      {/* Right panel background fill */}
      <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[#eef4f9] lg:block" />

      {/* faint architectural texture — barely visible, purely a subtle
          employee accent behind the icon/robot, not a showcased photo */}
      <img
        src={panelTexture}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 object-cover lg:block"
        style={{ opacity: 0.05 }}
      />

      {/* top background icon — faint, spans the panel seam */}
      <img
        src={icon}
        alt=""
        aria-hidden
        className="pointer-events-none absolute hidden object-contain lg:block"
        style={{ ...box(BG_ICON_BOX), opacity: 0.1 }}
      />

      {/*
        Right panel content — heading centered above a smaller mascot, both
        centered as a group within the right half. Flex centering keeps the
        mascot's size and position proportional at any viewport size.
      */}
      <div className="absolute inset-y-0 right-0 hidden w-1/2 flex-col items-center justify-center gap-6 px-10 lg:flex">
        <h1 className="z-10 text-center text-3xl font-extrabold leading-tight text-gray-900 xl:text-4xl">
          {heading.split("\n").map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        <img
          src={robot}
          alt=""
          aria-hidden
          className="pointer-events-none z-10 w-[75%] max-w-[520px] object-contain xl:max-w-[600px]"
        />
      </div>

      {/* floating brand badge at the panel seam */}
      <img
        src={badge}
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden h-40 w-40 -translate-x-[55%] -translate-y-1/2 rounded-full object-contain shadow-xl ring-8 ring-white lg:block"
      />

      {/*
        Left panel — form content.
        The logo is a normal flow element (not absolutely positioned), so the
        centered form below it can never collide with it, no matter how short
        the viewport is or how much content a given screen (login vs sign up vs
        reset) has. Previously the logo was pinned at a fixed % of the page and
        the form was independently centered in the full viewport height, which
        caused them to overlap on shorter windows.
      */}
      <div className="relative z-10 flex min-h-screen w-full flex-col bg-white/0 px-5 py-8 xs:px-8 xs:py-10 sm:px-16 lg:w-1/2 lg:px-24 lg:py-12">
        <img
          src={logo}
          alt="TechnoCues — Designers of the Visible"
          className="h-auto w-[140px] shrink-0 cursor-pointer object-contain object-left xs:w-[164px] sm:w-[206px]"
          onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}
        />
        <div className="flex flex-1 flex-col justify-center">
          <div className="w-full max-w-md py-6 xs:py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
