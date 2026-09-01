// Today's birthdays and work anniversaries for the dashboard widget.
//
// Backs the "Today's Celebrations" card, and is the same read the daily 08:00
// job announces to the bell and Slack (backlog #2) — so the card can never
// disagree with the message that went out. The endpoint is JWT-only (like
// /dashboard/me) and deliberately non-sensitive: names, designations and
// avatars only — no birth year or age is ever returned.
//
// Real backend or throw — no demo fallback, matching dashboardApi.

import { api, ENDPOINTS } from "@/lib/apiClient";

const { celebrations } = ENDPOINTS;

/** A person celebrating today. Carries no birth year or age. */
export type Celebrant = {
  user_id: string;
  name: string;
  designation: string | null;
  avatar_url: string | null;
};

export type Anniversary = Celebrant & {
  /** Completed years of service today; always >= 1. */
  years: number;
};

export type TodaysCelebrations = {
  /** The date these were computed for, 'YYYY-MM-DD'. */
  as_of: string;
  birthdays: Celebrant[];
  anniversaries: Anniversary[];
};

export const celebrationsApi = {
  /** Today's celebrants. Token-scoped, no permission needed. */
  getToday: (): Promise<TodaysCelebrations> =>
    api.get<TodaysCelebrations>(celebrations.today),
};
