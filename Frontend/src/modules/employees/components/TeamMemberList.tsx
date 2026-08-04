import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, UserX } from "lucide-react";

import StatusBadge from "@/components/common/StatusBadge";
import { ApiError } from "@/lib/apiClient";
import { formatDisplayDate } from "@/utils/formatDate";

import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";

const PAGE_SIZE = 5;

type TeamMemberListProps = {
  teamLeadId: string;
  /** Forwarded to the API so the expanded list honours the page-level search. */
  search?: string;
  onOpenEmployee: (employee: Employee) => void;
  /**
   * Bumped by the parent after a mutation elsewhere on the page, so an open
   * list refetches instead of showing a stale roster.
   */
  refreshToken?: number;
};

/**
 * The expandable roster under a Team Lead card.
 *
 * Paginated server-side against GET /users/:id/team — a lead with 40 reports
 * shouldn't ship 40 rows to render 5.
 */
export default function TeamMemberList({
  teamLeadId,
  search,
  onOpenEmployee,
  refreshToken = 0,
}: TeamMemberListProps) {
  const [members, setMembers] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A new search term invalidates the current page number: page 3 of the old
  // result set is rarely a meaningful position in the new one.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await employeeService.team(teamLeadId, {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      setMembers(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't load this team.",
      );
      setMembers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [teamLeadId, page, search]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return (
      <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl bg-white"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-gray-100 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex items-center gap-2.5 border-t border-gray-100 bg-gray-50/60 p-4 text-sm text-gray-500">
        <UserX size={16} className="shrink-0 text-gray-400" />
        {search
          ? `No team members match "${search}".`
          : "No team members assigned to this Team Lead yet."}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 p-3 sm:p-4">
      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.user_id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100"
          >
            <EmployeeAvatar
              firstName={member.first_name}
              lastName={member.last_name}
              photo={member.profile_image}
              thumb={member.profile_image_thumb}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{fullName(member)}</p>
              <p className="truncate text-xs text-gray-500">
                {member.employee_code}
                {member.designation?.title ? ` · ${member.designation.title}` : ""}
              </p>
            </div>
            <div className="hidden text-xs text-gray-500 sm:block">
              Joined {formatDisplayDate(member.joining_date)}
            </div>
            <StatusBadge status={member.status ? "active" : "inactive"} />
            <button
              type="button"
              onClick={() => onOpenEmployee(member)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand-light"
            >
              View Profile
            </button>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between px-1 text-xs text-gray-500">
          <span>
            Page {page} of {totalPages} · {total} member{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page of team members"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page of team members"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
