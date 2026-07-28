import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eventDaysByMonth, holidayDaysByMonth } from "@/modules/dashboard/mocks/dashboardMockData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Monday-first weekday index (0 = Monday ... 6 = Sunday) for the 1st of the month.
function firstWeekdayOffset(year: number, monthIndex: number) {
  const jsDay = new Date(year, monthIndex, 1).getDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

const today = new Date();

type CalendarCardProps = {
  initialYear?: number;
  initialMonthIndex?: number; // 0-based
};

export default function CalendarCard({
  initialYear = today.getFullYear(),
  initialMonthIndex = today.getMonth(),
}: CalendarCardProps) {
  const [year, setYear] = useState(initialYear);
  const [monthIndex, setMonthIndex] = useState(initialMonthIndex);
  const [selectedDay, setSelectedDay] = useState<number | null>(
    initialYear === today.getFullYear() && initialMonthIndex === today.getMonth() ? today.getDate() : null,
  );

  const isCurrentMonth = year === today.getFullYear() && monthIndex === today.getMonth();

  const monthKey = `${year}-${monthIndex + 1}`;
  const holidays = holidayDaysByMonth[monthKey] ?? [];
  const events = eventDaysByMonth[monthKey] ?? [];

  const totalDays = daysInMonth(year, monthIndex);
  const offset = firstWeekdayOffset(year, monthIndex);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const goToMonth = (delta: number) => {
    let nextMonth = monthIndex + delta;
    let nextYear = year;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setMonthIndex(nextMonth);
    setYear(nextYear);
    setSelectedDay(null);
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            setMonthIndex(today.getMonth());
            setYear(today.getFullYear());
            setSelectedDay(today.getDate());
          }}
          className="min-w-0 flex-1 truncate rounded-lg px-1 text-center text-base font-semibold tracking-tight text-gray-900 hover:text-brand-dark"
          title="Jump to today"
        >
          {MONTH_NAMES[monthIndex]} {year}
        </button>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-[11px] font-medium uppercase text-gray-400">
            {d}
          </span>
        ))}

        {cells.map((day, idx) => {
          if (day === null) return <span key={`empty-${idx}`} />;
          const isSelected = day === selectedDay;
          const isToday = isCurrentMonth && day === today.getDate();
          const isHoliday = holidays.includes(day);
          const isEvent = events.includes(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-current={isToday ? "date" : undefined}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition xs:h-8 xs:w-8 xs:text-sm ${
                isSelected
                  ? "bg-brand text-white"
                  : isHoliday
                    ? "bg-brand-light text-brand-dark"
                    : isEvent
                      ? "bg-gray-100 text-gray-700 ring-1 ring-gray-200"
                      : "text-gray-700 hover:bg-gray-100"
              } ${isToday && !isSelected ? "ring-2 ring-brand-dark ring-offset-1" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-brand-dark" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Holidays
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" /> Upcoming Event
        </span>
      </div>
    </div>
  );
}
