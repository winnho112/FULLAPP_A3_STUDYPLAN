/**
 * PlanDetailPage — Shows a saved plan's day-by-day schedule with
 * per-session checkboxes to track study progress.
 * Route: /plan/:planId
 *
 * Props flow: Receives savedPlans array and onUpdatePlan callback from App.
 * Looks up the plan by planId URL param; redirects to dashboard if not found.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { SavedPlan } from "../types";
import StudyPlanCard from "../components/StudyPlanCard";
import PrimaryButton from "../components/PrimaryButton";
import { ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { cn } from "../lib/utils";
import { loadToken } from "../lib/auth";
import { apiGetSessions, apiUpdateSession, formatTime12, dateToDayName, dateToShort, type BackendSession } from "../lib/api";

interface PlanDetailPageProps {
  savedPlans: SavedPlan[];
  onUpdatePlan: (plan: SavedPlan) => void;
}

export default function PlanDetailPage({
  savedPlans,
  onUpdatePlan,
}: PlanDetailPageProps) {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();

  const savedPlan = savedPlans.find((p) => p.id === planId);

  // Note editing UI state (local only — the saved note lives in savedPlan)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState("");

  // Backend sessions state — populated when backendPlanId exists
  const [backendSessions, setBackendSessions] = useState<BackendSession[] | null>(null);

  // Fetch sessions from backend when the plan has a backendPlanId
  const fetchBackendSessions = useCallback(async () => {
    const token = loadToken();
    if (!token || !savedPlan?.backendPlanId) return;
    try {
      const sessions = await apiGetSessions(token, savedPlan.backendPlanId);
      setBackendSessions(sessions);
    } catch (err) {
      console.error("Failed to fetch backend sessions:", err);
    }
  }, [savedPlan?.backendPlanId]);

  useEffect(() => {
    fetchBackendSessions();
  }, [fetchBackendSessions]);

  // Guard: plan not found
  if (!savedPlan) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-text-muted mb-4">Plan not found.</p>
          <PrimaryButton onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const { plan } = savedPlan;

  // Use backend sessions if available, otherwise fall back to savedPlan arrays
  const useBackend = backendSessions !== null && backendSessions.length > 0;

  const completedSessions: boolean[] = useBackend
    ? backendSessions!.map((s) => s.is_completed)
    : Array.isArray(savedPlan.completedSessions)
    ? savedPlan.completedSessions
    : plan.schedule.map(() => false);

  const sessionNotes: (string | null)[] = useBackend
    ? backendSessions!.map((s) => s.note)
    : Array.isArray(savedPlan.sessionNotes)
    ? savedPlan.sessionNotes
    : plan.schedule.map(() => null);

  const totalCount = completedSessions.length;
  const completedCount = completedSessions.filter(Boolean).length;
  const progress =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  /** Toggle a single session's completion status and persist */
  const handleToggle = async (index: number) => {
    if (useBackend && backendSessions) {
      const session = backendSessions[index];
      const token = loadToken();
      if (token) {
        try {
          await apiUpdateSession(token, session.id, { is_completed: !session.is_completed });
          // Refetch to stay in sync
          await fetchBackendSessions();
          return;
        } catch (err) {
          console.error("Failed to toggle session:", err);
        }
      }
    }
    // Fallback: local-only update
    const updatedCompleted = [...completedSessions];
    updatedCompleted[index] = !updatedCompleted[index];
    const newCount = updatedCompleted.filter(Boolean).length;
    const newProgress =
      totalCount > 0 ? Math.round((newCount / totalCount) * 100) : 0;

    onUpdatePlan({
      ...savedPlan,
      completedSessions: updatedCompleted,
      progress: newProgress,
    });
  };

  /** Save a note for a given session index */
  const handleSaveNote = async (index: number) => {
    if (useBackend && backendSessions) {
      const session = backendSessions[index];
      const token = loadToken();
      if (token) {
        try {
          await apiUpdateSession(token, session.id, { note: draftNote.trim() || null });
          await fetchBackendSessions();
          setEditingIndex(null);
          setDraftNote("");
          return;
        } catch (err) {
          console.error("Failed to save note:", err);
        }
      }
    }
    // Fallback: local-only update
    const updatedNotes = [...sessionNotes];
    updatedNotes[index] = draftNote.trim() || null;
    onUpdatePlan({ ...savedPlan, sessionNotes: updatedNotes });
    setEditingIndex(null);
    setDraftNote("");
  };

  /** Open the note editor pre-filled with existing note */
  const handleEditNote = (index: number) => {
    setEditingIndex(index);
    setDraftNote(sessionNotes[index] ?? "");
  };

  // Build display entries: use backend sessions when available, else plan.schedule
  const displayEntries = useBackend
    ? backendSessions!.map((s) => ({
        day: dateToDayName(s.session_date),
        date: dateToShort(s.session_date),
        task: s.task_name,
        timeSlot: `${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}`,
        duration: (() => {
          const [sh, sm] = s.start_time.split(":").map(Number);
          const [eh, em] = s.end_time.split(":").map(Number);
          return (eh * 60 + em) - (sh * 60 + sm);
        })(),
      }))
    : plan.schedule;

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Back to Dashboard */}
        <div className="mb-6">
          <PrimaryButton
            variant="secondary"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </PrimaryButton>
        </div>

        {/* Plan summary card */}
        <div className="mb-6">
          <StudyPlanCard
            name={plan.assignmentName}
            subject={plan.subject}
            dueDate={plan.dueDate}
            progress={progress}
            daysRemaining={savedPlan.daysRemaining}
          />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-border p-4 text-center">
            <p className="text-lg font-bold text-text">{plan.totalDays}</p>
            <p className="text-xs text-text-muted">Days</p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4 text-center">
            <p className="text-lg font-bold text-text">{plan.totalHours}</p>
            <p className="text-xs text-text-muted">Hours</p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4 text-center">
            <p className="text-lg font-bold text-text">
              {completedCount}/{totalCount}
            </p>
            <p className="text-xs text-text-muted">Sessions Done</p>
          </div>
        </div>

        {/* Day-by-day schedule with checkboxes */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm mb-8">
          <h2 className="text-base font-semibold text-text mb-4">
            Day-by-Day Schedule
          </h2>
          {totalCount === 0 ? (
            <p className="text-sm text-text-muted">No sessions scheduled.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {displayEntries.map((entry, index) => {
                const done = completedSessions[index];
                const note = sessionNotes[index];
                const isEditing = editingIndex === index;
                const hasSavedNote = note !== null && note !== undefined;

                return (
                  <div
                    key={index}
                    className={cn(
                      "rounded-xl transition-colors",
                      index % 2 === 0 ? "bg-gray-50" : "bg-white"
                    )}
                  >
                    {/* Session row */}
                    <label
                      className={cn(
                        "flex items-center gap-4 p-3 cursor-pointer",
                        done && "opacity-60"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => handleToggle(index)}
                        className="h-5 w-5 rounded cursor-pointer accent-primary"
                      />

                      <div className="flex-shrink-0 w-16 text-center">
                        <span
                          className={cn(
                            "text-xs font-medium px-2 py-1 rounded-lg",
                            done
                              ? "bg-success-light text-success"
                              : "bg-primary-light text-primary"
                          )}
                        >
                          {entry.day}
                        </span>
                        <p className="text-xs text-text-muted mt-0.5">
                          {entry.date}
                        </p>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium truncate",
                            done ? "line-through text-text-muted" : "text-text"
                          )}
                        >
                          {entry.task}
                        </p>
                        <p className="text-xs text-text-muted">
                          {entry.timeSlot === "Flexible"
                            ? "Flexible"
                            : `${entry.timeSlot} · ${entry.duration} min`}
                        </p>
                      </div>

                      {done && (
                        <CheckCircle2
                          size={18}
                          className="text-success flex-shrink-0"
                        />
                      )}
                    </label>

                    {/* Note area — below the session row */}
                    <div className="px-3 pb-3 pl-12">
                      {(isEditing || (done && !hasSavedNote)) && (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={draftNote}
                            onChange={(e) => setDraftNote(e.target.value)}
                            placeholder="Add a note... (max 50 characters)"
                            maxLength={50}
                            className={cn(
                              "flex-1 text-xs rounded-lg border border-border px-3 py-1.5",
                              "focus:outline-none focus:ring-2 focus:ring-primary/30",
                              "placeholder:text-text-muted"
                            )}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveNote(index);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveNote(index)}
                            className={cn(
                              "text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer",
                              "bg-primary text-white hover:bg-primary-hover transition-colors"
                            )}
                          >
                            Save
                          </button>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingIndex(null);
                                setDraftNote("");
                              }}
                              className="text-xs text-text-muted hover:text-text cursor-pointer px-1"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}

                      {hasSavedNote && !isEditing && (
                        <div
                          className={cn(
                            "flex items-center gap-2 mt-1",
                            !done && "opacity-50"
                          )}
                        >
                          <p className="text-xs text-text-muted italic truncate">
                            📝 {note}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleEditNote(index);
                            }}
                            className="text-text-muted hover:text-primary transition-colors cursor-pointer flex-shrink-0"
                            aria-label="Edit note"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completion celebration */}
        {progress === 100 && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-light mb-4">
              <CheckCircle2 size={32} className="text-success" />
            </div>
            <h2 className="text-xl font-bold text-text mb-1">
              Congratulations! 🎉
            </h2>
            <p className="text-sm text-text-muted">
              You&apos;ve completed all sessions for {plan.assignmentName}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}