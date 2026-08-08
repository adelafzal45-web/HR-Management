// API module for Meeting Requests (scheduling + invitations).
//
// Backed by the live CRUD controller at /meetings:
//   POST   /meetings              schedule (meeting.create)
//   GET    /meetings?…            list — { data, total } (meeting.view)
//   GET    /meetings/me           the caller's own meetings (JWT only)
//   PATCH  /meetings/:id          update (meeting.manage)
//   PATCH  /meetings/:id/cancel   cancel with a reason (meeting.manage)
//   DELETE /meetings/:id          delete (meeting.manage)
//
// Same contract as holidaysApi.ts / leaveEntitlementsApi.ts: try the real
// backend first (apiRequest — pings the API root, attaches the JWT), and only
// fall back to a client-synthesized demo dataset when the backend is completely
// unreachable (BackendUnavailableError). Real backend errors are NEVER
// swallowed — notably the 400s the service throws for a past date or an
// audience that resolves to nobody — and surface as a plain Error carrying the
// server message.
//
// Unlike /holidays, the list endpoint already filters and paginates server-side,
// so this module passes the query through rather than slicing locally. Only the
// demo store does its own filtering.

import { apiRequest, withDemoFallback } from "@/api/client";
import { ENDPOINTS } from "@/app/config/endpoints";

/** How the organizer picked the invitee list. Mirrors the backend enum. */
export type MeetingAudienceType = "Specific" | "Department" | "All";

export type MeetingStatus = "Scheduled" | "Cancelled" | "Completed";

export type MeetingParticipant = {
  userId: string;
  name: string;
  email: string;
};

export type Meeting = {
  meetingId: string;
  title: string;
  /** ISO instant (`timestamptz`), not a bare calendar date. */
  scheduledAt: string;
  /** Room name or a joining URL — one free-text field, as the backend stores it. */
  location: string;
  agenda: string;
  audienceType: MeetingAudienceType;
  /** Set only when audienceType is "Department". */
  audienceDepartmentId: string | null;
  audienceDepartmentName: string;
  notifyEmail: boolean;
  notifyInApp: boolean;
  status: MeetingStatus;
  cancellationReason: string;
  organizerId: string;
  organizerName: string;
  /**
   * Server-side count via loadRelationCountAndMap. Present on list rows; detail
   * responses carry the full `participants` array instead, so this falls back to
   * that length.
   */
  participantCount: number;
  /** Populated on the single-meeting response; empty on list rows. */
  participants: MeetingParticipant[];
};

export type MeetingPayload = {
  title: string;
  /** ISO instant. The backend rejects anything not in the future. */
  scheduledAt: string;
  location?: string;
  agenda?: string;
  audienceType: MeetingAudienceType;
  /** Required when audienceType is "Department". */
  audienceDepartmentId?: string | null;
  /** Required (non-empty) when audienceType is "Specific". */
  participantIds?: string[];
  notifyEmail?: boolean;
  notifyInApp?: boolean;
};

export type MeetingListParams = {
  search?: string;
  status?: MeetingStatus;
  departmentId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type MeetingListResult = { data: Meeting[]; total: number };

// ==========================================
// WIRE SHAPE
// ==========================================

type ApiUser = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type ApiMeeting = {
  meeting_id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  agenda: string | null;
  audience_type: MeetingAudienceType;
  audience_department_id: string | null;
  audienceDepartment?: { department_id: string; department_name?: string | null } | null;
  notify_email: boolean;
  notify_in_app: boolean;
  status: MeetingStatus;
  cancellation_reason: string | null;
  organizer_id: string;
  organizer?: ApiUser | null;
  participantCount?: number;
  participants?: Array<{ user_id: string; user?: ApiUser | null }>;
};

function fullName(user?: ApiUser | null): string {
  if (!user) return "";
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

function adaptParticipant(row: {
  user_id: string;
  user?: ApiUser | null;
}): MeetingParticipant {
  return {
    userId: row.user_id,
    name: fullName(row.user),
    email: row.user?.email ?? "",
  };
}

function adaptRow(row: ApiMeeting): Meeting {
  const participants = (row.participants ?? []).map(adaptParticipant);

  return {
    meetingId: row.meeting_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    location: row.location ?? "",
    agenda: row.agenda ?? "",
    audienceType: row.audience_type,
    audienceDepartmentId: row.audience_department_id ?? null,
    audienceDepartmentName: row.audienceDepartment?.department_name ?? "",
    notifyEmail: row.notify_email,
    notifyInApp: row.notify_in_app,
    status: row.status,
    cancellationReason: row.cancellation_reason ?? "",
    organizerId: row.organizer_id,
    organizerName: fullName(row.organizer),
    participantCount: row.participantCount ?? participants.length,
    participants,
  };
}

function toApiPayload(payload: MeetingPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: payload.title,
    scheduled_at: payload.scheduledAt,
    audience_type: payload.audienceType,
  };

  if (payload.location !== undefined) body.location = payload.location;
  if (payload.agenda !== undefined) body.agenda = payload.agenda;
  if (payload.notifyEmail !== undefined) body.notify_email = payload.notifyEmail;
  if (payload.notifyInApp !== undefined) body.notify_in_app = payload.notifyInApp;

  // Send only the key the chosen audience actually uses, so a stale value left
  // in form state cannot reach the server.
  if (payload.audienceType === "Department") {
    body.audience_department_id = payload.audienceDepartmentId ?? null;
  } else if (payload.audienceType === "Specific") {
    body.participant_ids = payload.participantIds ?? [];
  }

  return body;
}

function buildQuery(params: MeetingListParams): string {
  const query = new URLSearchParams();

  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);
  if (params.departmentId) query.set("department_id", params.departmentId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 10));

  return query.toString();
}

// ==========================================
// DEMO STORE
// ==========================================

// Only reached when the backend is unreachable. Kept in module scope so edits
// persist across navigations within a session, matching holidaysApi's store.
const demoMeetings: Meeting[] = [
  {
    meetingId: "demo-meeting-1",
    title: "Quarterly Engineering Review",
    scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    location: "https://meet.example.com/eng-review",
    agenda: "Roadmap progress, hiring plan, and Q3 priorities.",
    audienceType: "Department",
    audienceDepartmentId: null,
    audienceDepartmentName: "Engineering",
    notifyEmail: true,
    notifyInApp: true,
    status: "Scheduled",
    cancellationReason: "",
    organizerId: "demo-organizer",
    organizerName: "Sarah Khan",
    participantCount: 12,
    participants: [],
  },
  {
    meetingId: "demo-meeting-2",
    title: "New Policy Briefing",
    scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    location: "Conference Room A",
    agenda: "Walkthrough of the updated leave policy.",
    audienceType: "All",
    audienceDepartmentId: null,
    audienceDepartmentName: "",
    notifyEmail: true,
    notifyInApp: false,
    status: "Scheduled",
    cancellationReason: "",
    organizerId: "demo-organizer",
    organizerName: "Sarah Khan",
    participantCount: 48,
    participants: [],
  },
];

let demoSequence = demoMeetings.length;

function applyClientFilters(
  rows: Meeting[],
  params: MeetingListParams,
): MeetingListResult {
  let result = [...rows];

  const search = params.search?.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (row) =>
        row.title.toLowerCase().includes(search) ||
        row.location.toLowerCase().includes(search) ||
        row.agenda.toLowerCase().includes(search),
    );
  }

  if (params.status) {
    result = result.filter((row) => row.status === params.status);
  }

  result.sort(
    (a, b) =>
      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );

  const total = result.length;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 10);
  const start = (page - 1) * pageSize;

  return { data: result.slice(start, start + pageSize), total };
}

// ==========================================
// PUBLIC API
// ==========================================

export const meetingsApi = {
  list: (params: MeetingListParams = {}): Promise<MeetingListResult> =>
    withDemoFallback(
      async () => {
        const response = await apiRequest<{
          data: ApiMeeting[];
          total: number;
        }>(`${ENDPOINTS.meetings.base}?${buildQuery(params)}`);
        return {
          data: (response.data ?? []).map(adaptRow),
          total: response.total ?? 0,
        };
      },
      async () => applyClientFilters(demoMeetings, params),
    ),

  /** The caller's own meetings — organized or invited. No permission needed. */
  listMine: (): Promise<Meeting[]> =>
    withDemoFallback(
      async () => {
        const rows = await apiRequest<ApiMeeting[]>(ENDPOINTS.meetings.me);
        return (rows ?? []).map(adaptRow);
      },
      async () => demoMeetings.filter((row) => row.status === "Scheduled"),
    ),

  getById: (id: string): Promise<Meeting> =>
    withDemoFallback(
      async () => adaptRow(await apiRequest<ApiMeeting>(ENDPOINTS.meetings.byId(id))),
      async () => {
        const found = demoMeetings.find((row) => row.meetingId === id);
        if (!found) throw new Error("Meeting not found.");
        return found;
      },
    ),

  create: (payload: MeetingPayload): Promise<Meeting> =>
    withDemoFallback(
      async () =>
        adaptRow(
          await apiRequest<ApiMeeting>(ENDPOINTS.meetings.base, {
            method: "POST",
            body: toApiPayload(payload),
          }),
        ),
      async () => {
        demoSequence += 1;
        const created: Meeting = {
          meetingId: `demo-meeting-${demoSequence}`,
          title: payload.title,
          scheduledAt: payload.scheduledAt,
          location: payload.location ?? "",
          agenda: payload.agenda ?? "",
          audienceType: payload.audienceType,
          audienceDepartmentId: payload.audienceDepartmentId ?? null,
          audienceDepartmentName: "",
          notifyEmail: payload.notifyEmail ?? true,
          notifyInApp: payload.notifyInApp ?? true,
          status: "Scheduled",
          cancellationReason: "",
          organizerId: "demo-organizer",
          organizerName: "You",
          participantCount: payload.participantIds?.length ?? 0,
          participants: [],
        };
        demoMeetings.unshift(created);
        return created;
      },
    ),

  update: (id: string, payload: Partial<MeetingPayload>): Promise<Meeting> =>
    withDemoFallback(
      async () =>
        adaptRow(
          await apiRequest<ApiMeeting>(ENDPOINTS.meetings.byId(id), {
            method: "PATCH",
            body: toApiPayload(payload as MeetingPayload),
          }),
        ),
      async () => {
        const index = demoMeetings.findIndex((row) => row.meetingId === id);
        if (index === -1) throw new Error("Meeting not found.");
        const next = {
          ...demoMeetings[index],
          ...payload,
          location: payload.location ?? demoMeetings[index].location,
          agenda: payload.agenda ?? demoMeetings[index].agenda,
        } as Meeting;
        demoMeetings[index] = next;
        return next;
      },
    ),

  cancel: (id: string, reason: string): Promise<Meeting> =>
    withDemoFallback(
      async () =>
        adaptRow(
          await apiRequest<ApiMeeting>(ENDPOINTS.meetings.cancel(id), {
            method: "PATCH",
            body: { cancellation_reason: reason },
          }),
        ),
      async () => {
        const index = demoMeetings.findIndex((row) => row.meetingId === id);
        if (index === -1) throw new Error("Meeting not found.");
        const next: Meeting = {
          ...demoMeetings[index],
          status: "Cancelled",
          cancellationReason: reason,
        };
        demoMeetings[index] = next;
        return next;
      },
    ),

  remove: (id: string): Promise<{ message: string }> =>
    withDemoFallback(
      async () =>
        apiRequest<{ message: string }>(ENDPOINTS.meetings.byId(id), {
          method: "DELETE",
        }),
      async () => {
        const index = demoMeetings.findIndex((row) => row.meetingId === id);
        if (index !== -1) demoMeetings.splice(index, 1);
        return { message: "Meeting deleted." };
      },
    ),
};
