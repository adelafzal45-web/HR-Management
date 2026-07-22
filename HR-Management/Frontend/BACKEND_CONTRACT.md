# Backend Contract — Phase 1 (Employee Self-Service)

This frontend is already wired to call these endpoints on your NestJS API
(`VITE_API_BASE_URL`, default `http://localhost:3000/api`). Every call:

1. Pings `GET {API_BASE_URL}/health` first (see `src/lib/api.ts`).
2. If the backend responds → calls the real endpoint below, with
   `Authorization: Bearer <JWT>`.
3. If the backend is unreachable → transparently falls back to demo data
   (`src/lib/hrMockData.ts`) so the UI is always clickable, even before the
   backend exists.

Field names match the ERD in the project documentation (Chapter 6) so Prisma
models can be returned close to as-is. Adjust freely — just keep the frontend
types in `src/lib/hrApi.ts` in sync if you rename fields.

## Attendance (`Attendance` table)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/attendance/today` | — | `AttendanceRecord \| null` |
| POST | `/attendance/check-in` | — | `AttendanceRecord` |
| POST | `/attendance/check-out` | — | `AttendanceRecord` |
| GET | `/attendance/history?month=&year=` | — | `AttendanceRecord[]` |

```ts
type AttendanceRecord = {
  attendanceId: string;
  employeeId: string;
  attendanceDate: string;   // YYYY-MM-DD
  checkIn: string | null;   // HH:mm
  checkOut: string | null;  // HH:mm
  workingHours: number | null;
  status: "Present" | "Late" | "Absent" | "Leave" | "Holiday";
};
```

## Leave (`LeaveType`, `Leave` tables)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/leave/types` | — | `LeaveType[]` |
| GET | `/leave/balance` | — | `LeaveBalance[]` |
| GET | `/leave/my` | — | `LeaveRequest[]` |
| POST | `/leave/apply` | `{ leaveTypeId, startDate, endDate, reason }` | `LeaveRequest` |

```ts
type LeaveBalance = {
  leaveTypeId: string;
  leaveTypeName: string;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
};

type LeaveRequest = {
  leaveId: string; employeeId: string; leaveTypeId: string; leaveTypeName: string;
  startDate: string; endDate: string; totalDays: number; reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn: string; approvedOn: string | null; approvedBy: string | null; remarks: string | null;
};
```

Server should re-validate leave balance server-side even though the frontend
checks it client-side first (UC-9 alternate flow: insufficient balance).

## Payroll (`Payroll`, `PayComponents` tables)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/payroll/my` | — | `PayrollRecord[]` |
| GET | `/payroll/:payrollId/payslip` | — | `PayrollRecord` |

```ts
type PayrollRecord = {
  payrollId: string; employeeId: string; payrollMonth: number; payrollYear: number;
  basicSalary: number; allowance: number; bonus: number; deduction: number; tax: number;
  netSalary: number; paymentDate: string | null; generatedDate: string;
  status: "Generated" | "Pending";
  components: { payComponentId: string; payrollId: string; componentName: string;
                componentType: "Earning" | "Deduction"; amount: number }[];
};
```

## Appraisal (`Appraisal`, `AppraisalScore` tables)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/appraisal/my` | — | `AppraisalRecord[]` |
| GET | `/appraisal/:appraisalId` | — | `AppraisalRecord` |

```ts
type AppraisalRecord = {
  appraisalId: string; employeeId: string; reviewDate: string; reviewPeriod: string;
  totalScore: number; comments: string; recommendation: string;
  status: "Completed" | "Pending";
  scores: { scoreId: string; appraisalId: string; criteriaName: string;
            weightage: number; score: number; remarks: string | null }[];
};
```

## Notifications (`Notification` table)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/notifications` | — | `NotificationRecord[]` |
| PATCH | `/notifications/:id/read` | — | `NotificationRecord` |
| PATCH | `/notifications/read-all` | — | `{ updated: number }` |

```ts
type NotificationRecord = {
  notificationId: string; employeeId: string; title: string; message: string;
  type: "Leave" | "Payroll" | "Attendance" | "Appraisal" | "Announcement" | "General";
  isRead: boolean; createdAt: string;
};
```

The header bell + `/notifications` page poll every 30s (`NotificationsContext`)
— a future upgrade path is a WebSocket/SSE push instead of polling, once the
backend supports it.

## Auth (already implemented — role now wired to Phase 2 nav/routes)

`AuthUser` (`src/lib/auth.ts`) has optional `employeeId` and `role` fields.
`/auth/login` and `/profile/me` should return them on the `user` object —
`role` must be one of `"employee" | "team_lead" | "hr_manager" |
"administrator"`. The frontend already keys the Sidebar's "Team Lead" nav
section and the `/team/*` routes off `role === "team_lead"`
(`ProtectedRoute roles={["team_lead"]}`), so nothing else needs to change
once the backend starts sending real roles. In demo mode (no backend), the
seeded demo account (`demo@technocues.com`) is a Team Lead so Phase 2 is
fully clickable offline.

---

# Backend Contract — Phase 2 (Team Lead Workspace)

Same rules as Phase 1: every call pings `/health` first, uses the real
endpoint if reachable, and otherwise falls back to demo data
(`src/lib/teamMockData.ts`). All endpoints below are scoped server-side to
the logged-in Team Lead's assigned team (i.e. `Employee.managerId ===
current user`) — the frontend does not pass a manager ID.

## My Team (`Employee` table, filtered by `managerId`)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/team/members` | — | `TeamMember[]` |

```ts
type TeamMember = {
  employeeId: string; employeeCode: string; firstName: string; lastName: string;
  email: string; designation: string; department: string; managerId: string;
  joiningDate: string; status: "Active" | "On Leave" | "Inactive"; avatarUrl?: string;
};
```

## Team Attendance (`Attendance` table, aggregated per team member)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/team/attendance?month=&year=` | — | `TeamMemberAttendance[]` |

```ts
type TeamMemberAttendance = {
  employeeId: string; name: string; designation: string;
  today: { attendanceDate: string; checkIn: string | null; checkOut: string | null;
           status: "Present" | "Late" | "Absent" | "Leave" } | null;
  presentDays: number; lateDays: number; absentDays: number; leaveDays: number;
  attendanceRate: number; // 0-100
  days: { attendanceDate: string; checkIn: string | null; checkOut: string | null;
          status: "Present" | "Late" | "Absent" | "Leave" }[];
};
```

## Team Leave Requests (`Leave` table — view-only for Team Lead)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/team/leaves` | — | `TeamLeaveRequest[]` |

```ts
type TeamLeaveRequest = {
  leaveId: string; employeeId: string; employeeName: string; leaveTypeName: string;
  startDate: string; endDate: string; totalDays: number; reason: string;
  status: "Pending" | "Approved" | "Rejected"; appliedOn: string;
};
```

Team Lead can only view these (UC-15); approving/rejecting is HR Manager's
`/leave/:id/approve` / `/leave/:id/reject` from Phase 3 (UC-20).

## Appraisal Criteria (`AppraisalQuestion` table)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/appraisal/criteria` | — | `AppraisalQuestion[]` |
| PUT | `/appraisal/criteria` | `{ questions: AppraisalQuestion[] }` | `AppraisalQuestion[]` |

```ts
type AppraisalQuestion = {
  questionId: string; questionText: string; weightage: number; isActive: boolean;
};
```

Server must re-validate that active questions sum to exactly 100% (UC-16
alternate flow) even though the frontend blocks Save client-side first.

## Evaluate Employee (`Appraisal` + `AppraisalScore` tables)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/appraisal/evaluate/:employeeId` | — | `SubmittedEvaluation \| null` |
| POST | `/appraisal/evaluate/:employeeId` | `EvaluationPayload` | `SubmittedEvaluation` |

```ts
type EvaluationPayload = {
  employeeId: string; reviewPeriod: string; comments: string; recommendation: string;
  scores: { questionId: string; score: number; remarks?: string }[]; // score 1-10
};

type SubmittedEvaluation = {
  appraisalId: string; employeeId: string; reviewDate: string; reviewPeriod: string;
  totalScore: number; comments: string; recommendation: string; status: "Completed";
  scores: { scoreId: string; questionId: string; criteriaName: string;
            weightage: number; score: number; remarks: string | null }[];
};
```

Server should recompute `totalScore` (weighted sum) rather than trust the
client, and should 400 if any criterion is missing a score (UC-17 alternate
flow) or a score is out of the 1–10 range.

## Team Reports (aggregated across Attendance / Leave / Appraisal)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/team/reports` | — | `TeamReportData` |

```ts
type TeamReportData = {
  reviewPeriod: string; teamSize: number; avgAttendanceRate: number;
  totalLeaveDaysTaken: number; pendingLeaveRequests: number;
  avgAppraisalScore: number; evaluatedCount: number;
  topPerformers: { employeeId: string; name: string; score: number }[];
  attendanceByMember: { employeeId: string; name: string; attendanceRate: number }[];
};
```

Return `topPerformers` pre-sorted descending by score (UC-18 / "identify
top-performing employees").
