// Lightweight, client-only audit trail + notes for the Employee view drawer.
//
// The backend doesn't expose an audit-log or notes endpoint yet (see
// BACKEND_CONTRACT.md), so this mirrors the same "demo-friendly, real
// shape" convention used elsewhere in the app (mock*Api stores): entries
// persist per-browser in localStorage, keyed by employee id, and the app
// itself appends to the log whenever it performs an action (create, edit,
// status change, password reset) so the timeline reflects real activity
// that happened in this session/browser rather than being fabricated.

export type ActivityType = "created" | "updated" | "status" | "password_reset" | "note";

export type ActivityEntry = {
  id: string;
  type: ActivityType;
  message: string;
  actor: string;
  timestamp: string; // ISO
};

export type EmployeeNote = {
  id: string;
  text: string;
  author: string;
  timestamp: string; // ISO
};

const ACTIVITY_PREFIX = "hrms.employees.activity.";
const NOTES_PREFIX = "hrms.employees.notes.";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage unavailable — activity just won't persist in this browser
  }
}

export function getActivity(employeeId: string): ActivityEntry[] {
  return readList<ActivityEntry>(ACTIVITY_PREFIX + employeeId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function appendActivity(employeeId: string, type: ActivityType, message: string, actor: string): ActivityEntry {
  const entry: ActivityEntry = { id: uid(), type, message, actor, timestamp: new Date().toISOString() };
  const key = ACTIVITY_PREFIX + employeeId;
  writeList(key, [...readList<ActivityEntry>(key), entry]);
  return entry;
}

export function getNotes(employeeId: string): EmployeeNote[] {
  return readList<EmployeeNote>(NOTES_PREFIX + employeeId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function addNote(employeeId: string, text: string, author: string): EmployeeNote {
  const note: EmployeeNote = { id: uid(), text, author, timestamp: new Date().toISOString() };
  const key = NOTES_PREFIX + employeeId;
  writeList(key, [...readList<EmployeeNote>(key), note]);
  return note;
}

export function deleteNote(employeeId: string, noteId: string) {
  const key = NOTES_PREFIX + employeeId;
  writeList(
    key,
    readList<EmployeeNote>(key).filter((n) => n.id !== noteId),
  );
}
