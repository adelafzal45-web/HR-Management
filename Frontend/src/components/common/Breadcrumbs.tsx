import { ChevronRight, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthContext";
import { getBreadcrumbTrail } from "@/config/navigation";

/**
 * Auto-derived breadcrumb trail for the current route, computed by walking
 * the same NAV_TREE the sidebar renders from — so breadcrumbs, sidebar
 * highlighting, and route guards can never fall out of sync with each other.
 */
export default function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const trail = getBreadcrumbTrail(location.pathname, user?.role, location.search);
  if (trail.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-gray-400">
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1 rounded p-0.5 hover:text-gray-600"
        aria-label="Dashboard"
      >
        <Home size={12} />
      </button>
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
            <ChevronRight size={12} className="shrink-0 text-gray-300" />
            {!isLast && crumb.path ? (
              <button
                type="button"
                onClick={() => navigate(crumb.path!)}
                className="rounded hover:text-gray-600 hover:underline"
              >
                {crumb.label}
              </button>
            ) : (
              <span className={isLast ? "font-medium text-gray-600" : ""}>{crumb.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
