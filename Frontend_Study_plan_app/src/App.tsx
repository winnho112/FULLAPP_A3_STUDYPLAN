/**
 * App.tsx — Central State + Router for StudyPlan MVP
 *
 * DATA FLOW:
 * 1. PROPS DOWN: App passes assignmentData, availabilityData,
 *    preferencesData to pages via route elements
 * 2. CALLBACKS UP: Pages call onAssignmentComplete(data),
 *    onAvailabilityComplete(data), onPreferencesComplete(data)
 *    to update App state
 * 3. ROUTER STATE: On "Create My Plan", navigate to /create/result
 *    passing the generated plan as router state
 *
 * STATE: All form state lives here so it persists across navigation.
 */
import { useState, useEffect, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import type {
  AssignmentData,
  AvailabilityData,
  PreferencesData,
  GeneratedPlan,
  StudyPlanEntry,
  DashboardPlan,
  SavedPlan,
} from "./types";
import { loadSavedPlans, saveSavedPlans } from "./lib/storage";
import {
  saveCurrentUser, loadCurrentUser, getUserName, clearCurrentUser,
  loadToken, clearAuth,
} from "./lib/auth";
import {
  apiGetPlans, apiCreatePlan, apiUpdatePlan, apiDeletePlan,
  buildCreatePlanBody, type BackendPlan,
} from "./lib/api";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AssignmentDetailsPage from "./pages/AssignmentDetailsPage";
import AvailabilityPage from "./pages/AvailabilityPage";
import PreferencesPage from "./pages/PreferencesPage";
import ReviewPage from "./pages/ReviewPage";
import ResultPage from "./pages/ResultPage";
import PlanDetailPage from "./pages/PlanDetailPage";

/** Map a saved plan to the dashboard card data shape */
function toDashboardPlan(saved: SavedPlan): DashboardPlan {
  return {
    id: saved.id,
    name: saved.plan.assignmentName,
    subject: saved.plan.subject,
    dueDate: saved.plan.dueDate,
    progress: saved.progress,
    daysRemaining: saved.daysRemaining,
    availability: saved.availability,
  };
}

/** Map a backend plan response to our local SavedPlan shape */
function backendToSavedPlan(bp: BackendPlan): SavedPlan {
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const schedule: StudyPlanEntry[] = bp.sessions.map((s) => {
    const d = new Date(s.session_date + "T00:00:00");
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const fmt = (h: number, m: number) => {
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${m.toString().padStart(2,"0")} ${period}`;
    };
    return {
      day: dayNames[d.getDay()],
      date: `${months[d.getMonth()]} ${d.getDate()}`,
      task: s.task_name,
      timeSlot: `${fmt(sh, sm)} - ${fmt(eh, em)}`,
      duration: (eh * 60 + em) - (sh * 60 + sm),
    };
  });

  const av = bp.availability as AvailabilityData;
  const dueDate = bp.due_date;
  const today = new Date();
  const due = new Date(dueDate);
  const daysRemaining = Math.max(Math.ceil((due.getTime() - today.getTime()) / 86400000), 1);
  const totalCount = bp.sessions.length;
  const completedCount = bp.sessions.filter((s) => s.is_completed).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Map backend assignment_type back to frontend type
  const typeMap: Record<string, AssignmentData["type"]> = {
    exam: "exam-prep", essay: "essay", report: "report",
    presentation: "presentation", project: "project",
  };
  const pref = bp.preferences as Record<string, unknown>;
  const breakMap: Record<string, PreferencesData["breakFrequency"]> = {
    every_25min: "every-25", every_50min: "every-50", when_needed: "every-90",
  };

  return {
    id: bp.id,
    createdAt: bp.created_at,
    plan: {
      assignmentName: bp.assignment_name,
      subject: bp.subject,
      dueDate,
      totalDays: daysRemaining,
      totalHours: Math.round(bp.sessions.reduce((sum, s) => {
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        return sum + (eh * 60 + em - sh * 60 - sm);
      }, 0) / 60),
      schedule,
    },
    assignment: {
      name: bp.assignment_name,
      subject: bp.subject,
      dueDate,
      type: typeMap[bp.assignment_type] || "essay",
      workload: bp.workload as AssignmentData["workload"],
    },
    availability: av,
    preferences: {
      sessionLength: String(pref.session_length || "50") as PreferencesData["sessionLength"],
      studyTime: (pref.preferred_study_time || "afternoon") as PreferencesData["studyTime"],
      breakFrequency: breakMap[ String(pref.break_frequency)] || "every-50",
      priority: (pref.priority || "balanced") as PreferencesData["priority"],
    },
    progress,
    daysRemaining,
    completedSessions: bp.sessions.map((s) => s.is_completed),
    sessionNotes: bp.sessions.map((s) => s.note),
    backendPlanId: bp.id,
  };
}

/** Calculate days remaining until the due date (minimum 1) */
function calcDaysRemaining(dueDate: string): number {
  const today = new Date();
  const due = new Date(dueDate);
  const diff = due.getTime() - today.getTime();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 1);
}

// ── Helpers for generateStudyPlan ────────────────────────────────
const DAY_MS = 1000 * 60 * 60 * 24;

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_KEYS: (keyof AvailabilityData)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Format minutes-offset from midnight into "9:00 AM" style string */
function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * Distribute `total` items across `count` buckets using largest-remainder.
 * Returns an array of integer counts summing to `total` where every bucket
 * gets at least `minEach` items.
 */
function distribute(total: number, count: number, minEach = 0): number[] {
  if (count <= 0 || total <= 0) return Array(count).fill(0);
  const base = Math.floor(total / count);
  const result = Array(count).fill(Math.max(base, minEach));
  let remainder = total - result.reduce((a, b) => a + b, 0);
  let i = 0;
  while (remainder > 0 && i < count) {
    result[i]++;
    remainder--;
    i++;
  }
  return result;
}

// Rule-based plan generation — no AI, no backend
function generateStudyPlan(
  assignment: AssignmentData,
  availability: AvailabilityData,
  preferences: PreferencesData
): GeneratedPlan {
  const today = new Date();
  const due = new Date(assignment.dueDate);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / DAY_MS);
  // Available days = days between today and due date, minus 1-day buffer
  const availableDays = Math.max(diffDays - 1, 1);

  // 1. Tasks based on workload (exact spec lists)
  let tasks: string[];
  switch (assignment.workload) {
    case "heavy":
      tasks = [
        "Research & gather sources",
        "Analyse data",
        "Draft findings",
        "Write recommendations",
        "Review & edit",
      ];
      break;
    case "moderate":
      tasks = ["Research", "Draft", "Review", "Finalise"];
      break;
    default: // light
      tasks = ["Plan", "Write", "Submit"];
      break;
  }

  // 2. Normalize legacy priority values (old localStorage data)
  let priority = preferences.priority;
  if ((priority as string) === "speed") {
    priority = "finish_early";
  } else if ((priority as string) === "quality") {
    priority = "difficult_first";
  }

  // 3. Session time calculation
  const sessionDuration = Number(preferences.sessionLength);
  const startMinuteMap: Record<string, number> = {
    morning: 9 * 60, // 09:00
    afternoon: 13 * 60, // 13:00
    evening: 18 * 60, // 18:00
  };
  const startMinute = startMinuteMap[preferences.studyTime] ?? 13 * 60;
  const endMinute = startMinute + sessionDuration;
  const timeSlot = `${fmtTime(startMinute)} - ${fmtTime(endMinute)}`;

  // 4. Build list of study days (skip days with 0 availability)
  const studyDates: Date[] = [];
  for (let offset = 0; offset < availableDays; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    const dow = d.getDay();
    const dayKey = DAY_KEYS[dow === 0 ? 6 : dow - 1];
    if (availability[dayKey] > 0) {
      studyDates.push(d);
    }
  }

  // Finish early: only use first 80% of study days
  const usableStudyDays =
    priority === "finish_early"
      ? studyDates.slice(0, Math.max(1, Math.floor(studyDates.length * 0.8)))
      : studyDates;

  // 5. Distribute study days across tasks based on priority
  const n = tasks.length;
  const totalStudyDays = usableStudyDays.length;
  let dayCounts: number[];

  if (totalStudyDays === 0) {
    dayCounts = Array(n).fill(0);
  } else if (priority === "difficult_first") {
    // First task gets 40% of days, rest split equally
    const firstDays = Math.max(1, Math.round(totalStudyDays * 0.4));
    const remainingDays = totalStudyDays - firstDays;
    const restCounts = distribute(remainingDays, n - 1);
    dayCounts = [firstDays, ...restCounts];
  } else {
    // balanced & finish_early: equal split
    dayCounts = distribute(totalStudyDays, n);
  }

  // 6. Build the schedule: one session per study day, tasks in order
  const schedule: StudyPlanEntry[] = [];
  let dateIdx = 0;

  for (let taskIdx = 0; taskIdx < n; taskIdx++) {
    const taskDays = dayCounts[taskIdx];
    if (taskDays > 0) {
      for (let i = 0; i < taskDays && dateIdx < usableStudyDays.length; i++) {
        const d = usableStudyDays[dateIdx];
        const dow = d.getDay();
        schedule.push({
          day: DAY_NAMES[dow === 0 ? 6 : dow - 1],
          date: d.toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          }),
          task: `${tasks[taskIdx]} (Day ${i + 1} of ${taskDays})`,
          timeSlot,
          duration: sessionDuration,
        });
        dateIdx++;
      }
    } else {
      // Fallback: flexible entry for tasks with no study days
      schedule.push({
        day: "Flexible",
        date: "As needed",
        task: `${tasks[taskIdx]} (Day 1 of 1)`,
        timeSlot: "Flexible",
        duration: sessionDuration,
      });
    }
  }

  const totalHours = Math.round((schedule.length * sessionDuration) / 60);

  return {
    assignmentName: assignment.name,
    subject: assignment.subject,
    dueDate: assignment.dueDate,
    totalDays: availableDays,
    totalHours,
    schedule,
  };
}

// ============================================================
// MAIN APP COMPONENT
// ============================================================
export default function App() {
  // CENTRAL STATE — persists across page navigation
  const [assignment, setAssignment] = useState<AssignmentData>({
    name: "",
    subject: "",
    dueDate: "",
    type: "essay",
    workload: "moderate",
  });

  const [availability, setAvailability] = useState<AvailabilityData>({
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
    friday: 0, saturday: 0, sunday: 0,
  });

  const [preferences, setPreferences] = useState<PreferencesData>({
    sessionLength: "50",
    studyTime: "afternoon",
    breakFrequency: "every-50",
    priority: "balanced",
  });

  // CURRENT USER — persisted session (email or null)
  const [currentUser, setCurrentUser] = useState<string | null>(() =>
    loadCurrentUser()
  );
  const [currentUserName, setCurrentUserName] = useState<string>(() =>
    currentUser ? getUserName(currentUser) : ""
  );

  // ACCESS TOKEN — from backend Supabase Auth
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    loadToken()
  );

  // SAVED PLANS — scoped to the current user
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() =>
    currentUser ? loadSavedPlans(currentUser) : []
  );

  // ── Load plans from backend on mount (if token exists) ──────
  const loadPlansFromBackend = useCallback(async (token: string) => {
    try {
      const backendPlans = await apiGetPlans(token);
      const mapped = backendPlans.map(backendToSavedPlan);
      setSavedPlans(mapped);
      // Also persist to localStorage as a cache
      const email = loadCurrentUser();
      if (email) saveSavedPlans(email, mapped);
    } catch {
      // Backend unreachable — fall back to localStorage
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      loadPlansFromBackend(accessToken);
    }
  }, [accessToken, loadPlansFromBackend]);

  // CALLBACKS UP — pages call these to update App state
  const handleAssignmentComplete = (data: AssignmentData) =>
    setAssignment(data);
  const handleAvailabilityComplete = (data: AvailabilityData) =>
    setAvailability(data);
  const handlePreferencesComplete = (data: PreferencesData) =>
    setPreferences(data);
  const handleLogin = (email: string, name: string) => {
    saveCurrentUser(email);
    setCurrentUser(email);
    setCurrentUserName(name);
    setAccessToken(loadToken()); // read token stored by LoginPage
    // Plans will be loaded by the useEffect that watches accessToken
  };

  // LOGOUT — clear session + in-memory state
  const handleLogout = () => {
    clearAuth();
    clearCurrentUser();
    setCurrentUser(null);
    setCurrentUserName("");
    setAccessToken(null);
    setSavedPlans([]);
    setAssignment({ name: "", subject: "", dueDate: "", type: "essay", workload: "moderate" });
    setAvailability({ monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 });
    setPreferences({ sessionLength: "50", studyTime: "afternoon", breakFrequency: "every-50", priority: "balanced" });
  };

  // PLAN GENERATION — called from ReviewPage
  const handleGeneratePlan = (): GeneratedPlan => {
    return generateStudyPlan(assignment, availability, preferences);
  };

  // SAVE PLAN — called from ResultPage's "Start Studying" button
  const handleStartStudying = async (plan: GeneratedPlan) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    let backendPlanId: string | undefined;

    // Save to backend if authenticated
    if (accessToken) {
      try {
        const body = buildCreatePlanBody(
          { name: plan.assignmentName, subject: plan.subject, dueDate: plan.dueDate, type: assignment.type, workload: assignment.workload },
          availability,
          preferences,
        );
        const result = await apiCreatePlan(accessToken, body);
        backendPlanId = result.plan_id;
      } catch (err) {
        console.error("Failed to save plan to backend:", err);
      }
    }

    const saved: SavedPlan = {
      id: backendPlanId || id, // use backend UUID as the primary id
      createdAt: new Date().toISOString(),
      plan,
      assignment,
      availability,
      preferences,
      progress: 0,
      daysRemaining: plan.totalDays,
      completedSessions: plan.schedule.map(() => false),
      sessionNotes: plan.schedule.map(() => null),
      backendPlanId,
    };
    setSavedPlans((prev) => {
      const next = [saved, ...prev];
      if (currentUser) saveSavedPlans(currentUser, next);
      return next;
    });
  };

  // UPDATE PLAN — called from PlanDetailPage when sessions are toggled
  // For backend plans, the actual PATCH is done in PlanDetailPage;
  // this just updates the local in-memory state + localStorage cache.
  const handleUpdatePlan = (updated: SavedPlan) => {
    setSavedPlans((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? updated : p));
      if (currentUser) saveSavedPlans(currentUser, next);
      return next;
    });
  };

  // DELETE PLAN — called from DashboardPage delete confirmation
  const handleDeletePlan = async (planId: string) => {
    // Delete from backend if authenticated
    if (accessToken) {
      try { await apiDeletePlan(accessToken, planId); } catch (err) {
        console.error("Failed to delete plan from backend:", err);
      }
    }
    setSavedPlans((prev) => {
      const next = prev.filter((p) => p.id !== planId);
      if (currentUser) saveSavedPlans(currentUser, next);
      return next;
    });
  };

  // EDIT PLAN — called from DashboardPage edit modal
  const handleEditPlan = async (
    planId: string,
    updates: {
      name: string;
      subject: string;
      dueDate: string;
      availability: AvailabilityData;
    }
  ) => {
    // Update backend if authenticated
    if (accessToken) {
      try {
        await apiUpdatePlan(accessToken, planId, {
          assignment_name: updates.name,
          subject: updates.subject,
          due_date: updates.dueDate,
          availability: {
            monday: updates.availability.monday, tuesday: updates.availability.tuesday,
            wednesday: updates.availability.wednesday, thursday: updates.availability.thursday,
            friday: updates.availability.friday, saturday: updates.availability.saturday,
            sunday: updates.availability.sunday,
          },
        });
      } catch (err) {
        console.error("Failed to update plan on backend:", err);
      }
    }

    setSavedPlans((prev) => {
      const next = prev.map((p) => {
        if (p.id !== planId) return p;
        const updatedAssignment: AssignmentData = {
          ...p.assignment,
          name: updates.name,
          subject: updates.subject,
          dueDate: updates.dueDate,
        };
        const newPlan = generateStudyPlan(
          updatedAssignment,
          updates.availability,
          p.preferences
        );
        return {
          ...p,
          assignment: updatedAssignment,
          availability: updates.availability,
          plan: newPlan,
          progress: 0,
          daysRemaining: calcDaysRemaining(updates.dueDate),
          completedSessions: newPlan.schedule.map(() => false),
          sessionNotes: newPlan.schedule.map(() => null),
        };
      });
      if (currentUser) saveSavedPlans(currentUser, next);
      return next;
    });
  };

  return (
    <Routes>
      {/* / → Login */}
      <Route path="/" element={<LoginPage onLogin={handleLogin} />} />

      {/* /dashboard → Saved plans (persisted in localStorage) */}
      <Route
        path="/dashboard"
        element={
          <DashboardPage
            dashboardPlans={savedPlans.map(toDashboardPlan)}
            userName={currentUserName}
            onEditPlan={handleEditPlan}
            onDeletePlan={handleDeletePlan}
            onLogout={handleLogout}
          />
        }
      />

      {/* /create/assignment → Step 1 */}
      <Route
        path="/create/assignment"
        element={
          <AssignmentDetailsPage
            assignmentData={assignment}
            onAssignmentComplete={handleAssignmentComplete}
          />
        }
      />

      {/* /create/availability → Step 2 */}
      <Route
        path="/create/availability"
        element={
          <AvailabilityPage
            availabilityData={availability}
            onAvailabilityComplete={handleAvailabilityComplete}
          />
        }
      />

      {/* /create/preferences → Step 3 */}
      <Route
        path="/create/preferences"
        element={
          <PreferencesPage
            preferencesData={preferences}
            onPreferencesComplete={handlePreferencesComplete}
          />
        }
      />

      {/* /create/review → Summary + generate plan */}
      <Route
        path="/create/review"
        element={
          <ReviewPage
            assignmentData={assignment}
            availabilityData={availability}
            preferencesData={preferences}
            onGeneratePlan={handleGeneratePlan}
          />
        }
      />

      {/* /create/result → Generated plan + PearlButton */}
      <Route
        path="/create/result"
        element={<ResultPage onStartStudying={handleStartStudying} />}
      />

      {/* /plan/:planId → View and manage a saved plan's sessions */}
      <Route
        path="/plan/:planId"
        element={
          <PlanDetailPage
            savedPlans={savedPlans}
            onUpdatePlan={handleUpdatePlan}
          />
        }
      />
    </Routes>
  );
}