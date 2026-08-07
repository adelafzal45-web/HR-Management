/**
 * Verifies the new appraisal entities against the live schema.
 *
 * A `nest build` only proves the TypeScript compiles; it cannot catch a column
 * name in an entity that does not exist in the database. Selecting every mapped
 * column through each repository does catch it — Postgres rejects an unknown
 * column immediately.
 *
 * Run from Backend/:  npx ts-node scripts/verify-appraisal-entities.ts
 */
import { AppDataSource } from "../src/data-source";

import {
  TeamLeadAssignment,
  TeamLeadAssignmentMember,
} from "../src/appraisal-forms/team-lead-assignment.entity";
import { ReviewApproval } from "../src/performance-review/review-approval.entity";
import { PerformanceReview } from "../src/performance-review/performance-review.entity";
import { AppraisalFormQuestion } from "../src/appraisal-form-questions/appraisal-form-questions.entity";
import { AppraisalQuestion } from "../src/appraisal-question/appraisal-question.entity";
import { AppraisalNotification } from "../src/appraisal-notifications/appraisal-notification.entity";

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const failures: string[] = [];

  // Each probe selects every mapped column (find with a relation forces the
  // join columns too), so a rename or typo surfaces as a Postgres error.
  const probes: Array<[string, () => Promise<unknown>]> = [
    [
      "TeamLeadAssignment",
      () =>
        AppDataSource.getRepository(TeamLeadAssignment).find({
          relations: ["teamLead", "department", "createdBy", "members"],
          take: 5,
        }),
    ],
    [
      "TeamLeadAssignmentMember",
      () =>
        AppDataSource.getRepository(TeamLeadAssignmentMember).find({
          relations: ["assignment", "user"],
          take: 5,
        }),
    ],
    [
      "ReviewApproval",
      () =>
        AppDataSource.getRepository(ReviewApproval).find({
          relations: ["review", "actor"],
          take: 5,
        }),
    ],
    [
      "AppraisalNotification",
      () =>
        AppDataSource.getRepository(AppraisalNotification).find({
          relations: ["recipient", "relatedReview"],
          take: 5,
        }),
    ],
    [
      "PerformanceReview (lock/approval cols)",
      () =>
        AppDataSource.getRepository(PerformanceReview).find({
          relations: ["approvedBy", "approvals"],
          take: 5,
        }),
    ],
    [
      "AppraisalFormQuestion (snapshot cols)",
      () =>
        AppDataSource.getRepository(AppraisalFormQuestion).find({
          relations: ["question"],
          take: 5,
        }),
    ],
    [
      "AppraisalQuestion (typed question_type)",
      () =>
        AppDataSource.getRepository(AppraisalQuestion).find({
          relations: ["options"],
          take: 5,
        }),
    ],
  ];

  for (const [label, run] of probes) {
    try {
      const rows = (await run()) as unknown[];
      console.log(`  OK    ${label} — ${rows.length} row(s)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label}: ${message}`);
      console.log(`  FAIL  ${label} — ${message}`);
    }
  }

  // Spot-check the values the migrations were supposed to leave behind.
  const [qTypes, statuses, modes, snapshots] = await Promise.all([
    AppDataSource.query(
      `SELECT question_type, count(*)::int AS n FROM appraisal_questions GROUP BY 1 ORDER BY 1`,
    ),
    AppDataSource.query(
      `SELECT status, count(*)::int AS n FROM performance_reviews GROUP BY 1 ORDER BY 1`,
    ),
    AppDataSource.query(
      `SELECT mode, count(*)::int AS n FROM team_lead_assignments GROUP BY 1 ORDER BY 1`,
    ),
    AppDataSource.query(
      `SELECT count(*)::int AS n FROM appraisal_form_questions WHERE snapshot_text IS NOT NULL`,
    ),
  ]);

  console.log("\n  question_type:", JSON.stringify(qTypes));
  console.log("  review status:", JSON.stringify(statuses));
  console.log("  tla modes:    ", JSON.stringify(modes));
  console.log("  snapshots:    ", JSON.stringify(snapshots));

  await AppDataSource.destroy();

  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} probe(s)`);
    process.exit(1);
  }
  console.log("\nAll entity probes passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
