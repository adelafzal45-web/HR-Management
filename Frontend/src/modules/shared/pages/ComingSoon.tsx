import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft, Bell } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import logo from "@/assets/logo.png";

type ComingSoonState = {
  key?: string;
  label?: string;
};

export default function ComingSoon() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as ComingSoonState;

  const featureLabel = state.label ?? "This feature";
  const activeKey = state.key ?? "";

  return (
    <DashboardLayout title={state.label ?? "Coming Soon"} activeKey={activeKey}>
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100 xs:p-10 sm:p-14">
          {/* soft decorative glow */}
          <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-light/60 blur-2xl" />
          <span className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-brand-light/50 blur-2xl" />

          <div className="relative flex flex-col items-center">
            <img src={logo} alt="TechnoCues" className="h-auto w-[150px] object-contain xs:w-[170px]" />

            <div className="mt-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
              <Sparkles size={32} />
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-brand-dark">
              Coming Soon
            </p>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 xs:text-3xl">
              {featureLabel} is on its way
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-gray-500 xs:text-[15px]">
              We're putting the finishing touches on this module. It'll be available in your
              dashboard soon &mdash; thanks for your patience.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 xs:flex-row xs:justify-center">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark"
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
              <button
                type="button"
                disabled
                className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-400"
                title="Notifications for this feature aren't available yet"
              >
                <Bell size={16} />
                Notify Me
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
