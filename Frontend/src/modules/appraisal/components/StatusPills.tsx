// ============================================================================
// Status pills for the two appraisal vocabularies.
//
// The shared `components/common/StatusBadge` maps only the attendance/leave
// words (approved / pending / rejected / absent / inactive). Every appraisal
// word outside that set — Draft, Published, Archived, Submitted — fell through
// to the same neutral gray, so "Published" and "Archived" looked identical, and
// the one distinction HR most needs to see at a glance was the one the badge
// erased. These two components carry their own maps instead.
// ============================================================================

import { Archive, CheckCircle2, Clock, FileEdit, Send, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { FormStatus } from "@/modules/appraisal/api/appraisalApi";

/**
 * The review lifecycle vocabulary, declared here rather than imported: the
 * review endpoints type `status` as a plain `string` (the column is returned
 * verbatim), so this is the only place the four known words are enumerated.
 */
type ReviewStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

const PILL = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";

const FORM_STATUS: Record<FormStatus, { class: string; icon: LucideIcon }> = {
  Draft: { class: "bg-gray-100 text-gray-600", icon: FileEdit },
  Published: { class: "bg-green-50 text-green-700", icon: Send },
  Archived: { class: "bg-amber-50 text-amber-700", icon: Archive },
};

export default function FormStatusBadge({ status }: { status: FormStatus }) {
  const tone = FORM_STATUS[status] ?? FORM_STATUS.Draft;
  const Icon = tone.icon;
  return (
    <span className={`${PILL} ${tone.class}`}>
      <Icon size={12} />
      {status}
    </span>
  );
}

const REVIEW_STATUS: Record<ReviewStatus, { class: string; icon: LucideIcon }> = {
  Draft: { class: "bg-gray-100 text-gray-600", icon: FileEdit },
  Submitted: { class: "bg-blue-50 text-blue-700", icon: Clock },
  Approved: { class: "bg-green-50 text-green-700", icon: CheckCircle2 },
  Rejected: { class: "bg-red-50 text-red-700", icon: XCircle },
};

/**
 * The review lifecycle. Typed on `string` rather than `ReviewStatus` because the
 * results endpoint returns the column verbatim, so an unmapped value renders
 * neutrally instead of crashing on an index miss.
 */
export function ReviewStatusBadge({ status }: { status: string }) {
  const tone = REVIEW_STATUS[status as ReviewStatus];
  if (!tone) {
    return <span className={`${PILL} bg-gray-100 text-gray-600`}>{status || "—"}</span>;
  }
  const Icon = tone.icon;
  return (
    <span className={`${PILL} ${tone.class}`}>
      <Icon size={12} />
      {status}
    </span>
  );
}

/**
 * Score colouring, shared so a 79% is the same amber everywhere it appears.
 * Bands match the backend's distribution buckets.
 */
export function scoreTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-rose-600";
}

/** A score as coloured text, or an em dash when there is nothing to show. */
export function ScoreText({
  score,
  className = "",
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score === null || score === undefined) {
    return <span className={`text-gray-400 ${className}`}>—</span>;
  }
  return (
    <span className={`font-semibold ${scoreTone(score)} ${className}`}>
      {score}
      <span className="text-xs font-normal text-gray-400">%</span>
    </span>
  );
}
