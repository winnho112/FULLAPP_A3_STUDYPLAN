/**
 * api.ts — Centralized API client for the StudyPlan backend
 *
 * All backend calls go through this module. It handles:
 * - Auth header injection
 * - Frontend ↔ backend type mapping
 * - Error handling
 */

// In production (Vercel), API_BASE is empty — rewrites route /auth/* etc. to the backend.
// In local dev, point to the FastAPI server directly.
const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ── Auth ──────────────────────────────────────────────────────

export async function apiSignup(
  fullName: string, email: string, password: string
): Promise<{ user_id: string; email: string }> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: fullName, email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Signup failed" }));
    throw new Error(err.detail || "Signup failed");
  }
  return res.json();
}

export async function apiLogin(
  email: string, password: string
): Promise<{ access_token: string; token_type: string; user_id: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

// ── Backend types (matching FastAPI response shapes) ──────────

export interface BackendSession {
  id: string;
  plan_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  task_name: string;
  is_completed: boolean;
  note: string | null;
}

export interface BackendPlan {
  id: string;
  user_id: string;
  assignment_name: string;
  subject: string;
  due_date: string;
  assignment_type: string;
  workload: string;
  status: string;
  created_at: string;
  updated_at: string;
  availability: Record<string, number>;
  preferences: Record<string, unknown>;
  sessions: BackendSession[];
}

// ── Plans ─────────────────────────────────────────────────────

export async function apiGetPlans(token: string): Promise<BackendPlan[]> {
  const res = await fetch(`${API_BASE}/plans`, { headers: authHeader(token) });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

/** Map frontend form data → backend POST /plans body. */
export function buildCreatePlanBody(
  assignment: { name: string; subject: string; dueDate: string; type: string; workload: string },
  availability: Record<string, number>,
  preferences: { sessionLength: string; studyTime: string; breakFrequency: string; priority: string }
) {
  const typeMap: Record<string, string> = { "exam-prep": "exam" };
  const breakMap: Record<string, string> = {
    "every-25": "every_25min", "every-50": "every_50min", "every-90": "when_needed",
  };
  return {
    assignment_name: assignment.name,
    subject: assignment.subject,
    due_date: assignment.dueDate,
    assignment_type: typeMap[assignment.type] || assignment.type,
    workload: assignment.workload,
    availability: {
      monday: availability.monday ?? 0, tuesday: availability.tuesday ?? 0,
      wednesday: availability.wednesday ?? 0, thursday: availability.thursday ?? 0,
      friday: availability.friday ?? 0, saturday: availability.saturday ?? 0,
      sunday: availability.sunday ?? 0,
    },
    preferences: {
      session_length: Number(preferences.sessionLength),
      preferred_study_time: preferences.studyTime,
      break_frequency: breakMap[preferences.breakFrequency] || "when_needed",
      priority: preferences.priority,
    },
  };
}

export async function apiCreatePlan(
  token: string, body: ReturnType<typeof buildCreatePlanBody>
): Promise<{ plan_id: string; sessions_generated: number }> {
  const res = await fetch(`${API_BASE}/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Create plan failed" }));
    throw new Error(err.detail || "Create plan failed");
  }
  return res.json();
}

export async function apiUpdatePlan(
  token: string, planId: string,
  updates: { assignment_name?: string; subject?: string; due_date?: string; availability?: Record<string, number> }
): Promise<void> {
  const res = await fetch(`${API_BASE}/plans/${planId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Update plan failed" }));
    throw new Error(err.detail || "Update plan failed");
  }
}

export async function apiDeletePlan(token: string, planId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/plans/${planId}`, {
    method: "DELETE", headers: authHeader(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Delete plan failed" }));
    throw new Error(err.detail || "Delete plan failed");
  }
}

// ── Sessions ──────────────────────────────────────────────────

export async function apiGetSessions(token: string, planId: string): Promise<BackendSession[]> {
  const res = await fetch(`${API_BASE}/plans/${planId}/sessions`, { headers: authHeader(token) });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function apiUpdateSession(
  token: string, sessionId: string, updates: { is_completed?: boolean; note?: string | null }
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Update session failed" }));
    throw new Error(err.detail || "Update session failed");
  }
}

// ── Formatting helpers ────────────────────────────────────────

/** "14:00:00" → "2:00 PM" */
export function formatTime12(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** "2025-06-15" → "Mon" */
export function dateToDayName(dateStr: string): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[new Date(dateStr + "T00:00:00").getDay()];
}

/** "2025-06-15" → "Jun 15" */
export function dateToShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}