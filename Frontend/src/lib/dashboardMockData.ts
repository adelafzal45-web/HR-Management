// Demo/fixture data for the Dashboard screen's calendar + team roster widgets.
// The stat cards themselves are no longer hardcoded here — Dashboard.tsx
// computes them live from attendanceApi / leaveApi / payrollApi / appraisalApi
// (each of which already tries the real backend first and falls back to demo
// data on its own), scoped to whoever is currently logged in.

export type StatCardData = {
  id: string;
  value: string;
  label: string;
  icon: "trending-up" | "user-check" | "user-x" | "file-check" | "users" | "user-minus";
  tone: "green" | "blue" | "red" | "mint" | "sky" | "rose";
};

export type TeamMember = {
  id: string;
  name: string;
  employeeId: string;
  position: string;
  status: "onboarded" | "out-of-office";
};

export const teamMembers: TeamMember[] = [
  { id: "1", name: "Arslan", employeeId: "123", position: "Graphic Designer", status: "onboarded" },
  { id: "2", name: "Karamat", employeeId: "333", position: "Team Lead (GD)", status: "onboarded" },
  { id: "3", name: "Hina Malik", employeeId: "145", position: "Frontend Developer", status: "onboarded" },
  { id: "4", name: "Bilal Ahmed", employeeId: "212", position: "Backend Developer", status: "onboarded" },
  { id: "5", name: "Sara Khan", employeeId: "301", position: "QA Engineer", status: "out-of-office" },
  { id: "6", name: "Usman Tariq", employeeId: "118", position: "UI/UX Designer", status: "out-of-office" },
];

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  displayDate: string;
  type: "holiday" | "event";
};

// Everything below is generated relative to *today* (instead of being pinned
// to a fixed 2024 date) so the calendar and upcoming-events list always line
// up with whatever month is actually showing when the dashboard loads.
const now = new Date();

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function displayDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", year: "2-digit" });
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

const upcomingHoliday = addDays(now, 6);
const upcomingEvent = addDays(now, 11);

export const calendarEvents: CalendarEvent[] = [
  {
    id: "holiday-upcoming",
    title: "Company Holiday",
    date: isoDate(upcomingHoliday),
    displayDate: displayDate(upcomingHoliday),
    type: "holiday",
  },
  {
    id: "event-upcoming",
    title: "Team Sync",
    date: isoDate(upcomingEvent),
    displayDate: displayDate(upcomingEvent),
    type: "event",
  },
];

// Days (of the month) that are holidays / events, keyed by "YYYY-M".
export const holidayDaysByMonth: Record<string, number[]> = {
  [monthKey(upcomingHoliday)]: [upcomingHoliday.getDate()],
};
export const eventDaysByMonth: Record<string, number[]> = {
  [monthKey(upcomingEvent)]: [upcomingEvent.getDate()],
};
