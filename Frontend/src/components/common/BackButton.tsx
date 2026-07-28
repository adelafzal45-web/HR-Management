import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type Props = {
  /** Route to fall back to when there's no in-app history to go back to
   *  (e.g. the page was opened directly via a bookmarked/shared link). */
  fallback: string;
  /** Label shown next to the arrow — defaults to a generic "Back". */
  label?: string;
  className?: string;
};

// Consistent "Back" affordance for detail/inner pages (Employee/Professional
// View Details, Evaluate Employee/Professional, etc.). Uses the browser's
// session history via React Router's navigate(-1) so it genuinely returns
// to whatever screen the person came from — including preserved filters,
// search, and scroll position on the Employees/Professionals grid — rather
// than hard-navigating to a fixed route every time. Falls back to a known
// route only when there's no prior in-app entry to go back to.
export default function BackButton({ fallback, label = "Back", className = "" }: Props) {
  const navigate = useNavigate();

  const handleBack = () => {
    // history.length is 1 for a fresh tab/direct link; more than a couple
    // of entries and there's very likely somewhere in-app to go back to.
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-700 ${className}`}
    >
      <ArrowLeft size={15} /> {label}
    </button>
  );
}
