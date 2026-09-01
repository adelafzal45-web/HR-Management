import { useEffect, useState } from "react";
import { Cake, PartyPopper, Sparkles } from "lucide-react";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import {
  celebrationsApi,
  type Anniversary,
  type Celebrant,
  type TodaysCelebrations as TodaysCelebrationsData,
} from "@/modules/dashboard/api/celebrationsApi";

/**
 * "Today's Celebrations" — today's birthdays and work anniversaries, the
 * dashboard face of backlog #2. The same read backs the daily 08:00 job that
 * announces to the bell and Slack, so the card can never disagree with the
 * message that went out. Shown to every role: the payload is non-sensitive
 * (names, designations, avatars — never a birth year or age) and everyone sees
 * the org's celebration board.
 *
 * Modelled on UpcomingEvents: the same card shell, loading skeleton, empty
 * state and colored-pill rows — birthdays in rose, anniversaries in indigo.
 */

/** The API returns one display name; the avatar wants initials from two parts. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.length > 1 ? parts[parts.length - 1] : "" };
}

type Row =
  | { kind: "birthday"; person: Celebrant }
  | { kind: "anniversary"; person: Anniversary };

export default function TodaysCelebrations() {
  const [data, setData] = useState<TodaysCelebrationsData | null>(null);

  useEffect(() => {
    let active = true;
    celebrationsApi
      .getToday()
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        // A failure must not blank the rail — fall back to the empty state,
        // exactly as UpcomingEvents does on error.
        if (active) setData({ as_of: "", birthdays: [], anniversaries: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  if (data === null) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-base font-bold text-gray-900">Today's Celebrations</h3>
        <div className="space-y-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const rows: Row[] = [
    ...data.birthdays.map((person) => ({ kind: "birthday" as const, person })),
    ...data.anniversaries.map((person) => ({ kind: "anniversary" as const, person })),
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-3 text-base font-bold text-gray-900">Today's Celebrations</h3>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Sparkles size={22} className="text-gray-300" />
          <p className="text-xs text-gray-400">No birthdays or anniversaries today.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const isBirthday = row.kind === "birthday";
            const { firstName, lastName } = splitName(row.person.name);
            const label = isBirthday
              ? "Birthday"
              : `${row.person.years} year${row.person.years === 1 ? "" : "s"}`;
            const Icon = isBirthday ? Cake : PartyPopper;
            return (
              <div
                key={`${row.kind}-${row.person.user_id}`}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                  isBirthday ? "bg-rose-100/70" : "bg-indigo-100/70"
                }`}
              >
                <EmployeeAvatar
                  firstName={firstName}
                  lastName={lastName}
                  photo={row.person.avatar_url}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900" title={row.person.name}>
                    {row.person.name}
                  </p>
                  {row.person.designation && (
                    <p className="truncate text-xs text-gray-600">{row.person.designation}</p>
                  )}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                    isBirthday ? "text-rose-600" : "text-indigo-600"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
