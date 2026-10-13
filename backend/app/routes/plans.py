"""
routes/plans.py — Study Plan CRUD endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import date, time, timedelta
from database import get_connection
from models import PlanCreate, PlanUpdate
from routes.auth import get_current_user

router = APIRouter(tags=["Study Plans"])


# ----------------------------------------------------------------
# Helper: generate study sessions for a plan
# ----------------------------------------------------------------
def _generate_sessions(
    plan_id: str,
    due_date: date,
    availability: dict,
    session_length: int,
    preferred_study_time: str,
    assignment_type: str,
    workload: str,
) -> list[dict]:
    """Generate study sessions based on availability and preferences."""
    task_templates = {
        "essay":         ["Research & Reading", "Create Outline", "Write Introduction & Body", "Write Conclusion", "Edit & Proofread"],
        "report":        ["Research & Data Collection", "Analyze Data", "Write Draft", "Create Visualizations", "Final Review"],
        "presentation":  ["Research Content", "Create Outline", "Design Slides", "Practice Delivery", "Final Rehearsal"],
        "exam":          ["Review Notes", "Study Key Topics", "Practice Questions", "Review Weak Areas", "Final Revision"],
        "project":       ["Planning & Research", "Core Development", "Build Features", "Testing & Fixes", "Polish & Submit"],
    }
    tasks = task_templates.get(assignment_type, [f"Study Session"])

    workload_hours_map = {"light": 8, "moderate": 16, "heavy": 28}
    total_hours = workload_hours_map[workload]
    session_hours = session_length / 60.0
    total_sessions = max(1, round(total_hours / session_hours))

    start_time_map = {
        "morning":   time(9, 0),
        "afternoon": time(14, 0),
        "evening":   time(19, 0),
    }
    base_start = start_time_map.get(preferred_study_time, time(14, 0))
    break_mins = 10
    block_mins = session_length + break_mins

    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    # Collect available dates from tomorrow → due_date
    tomorrow = date.today() + timedelta(days=1)
    available_dates: list[tuple[date, float]] = []
    current = tomorrow
    while current <= due_date:
        day_name = day_names[current.weekday()]
        hours = float(availability.get(day_name, 0))
        if hours > 0:
            available_dates.append((current, hours))
        current += timedelta(days=1)

    if not available_dates:
        return []

    def _add_mins(t: time, mins: int) -> time:
        dt = timedelta(hours=t.hour, minutes=t.minute + mins)
        total = int(dt.total_seconds() // 60)
        return time(total // 60 % 24, total % 60)

    sessions: list[dict] = []
    idx = 0

    for d, hours in available_dates:
        if idx >= total_sessions:
            break
        total_mins = int(hours * 60)
        max_today = max(1, total_mins // block_mins)
        cursor = base_start

        for _ in range(max_today):
            if idx >= total_sessions:
                break
            task = tasks[idx % len(tasks)]
            end = _add_mins(cursor, session_length)

            sessions.append({
                "plan_id": plan_id, "session_date": d,
                "start_time": cursor, "end_time": end,
                "task_name": task, "is_completed": False, "note": None,
            })
            idx += 1
            cursor = _add_mins(cursor, block_mins)

    return sessions


# ----------------------------------------------------------------
# GET /plans
# ----------------------------------------------------------------
@router.get("/plans")
def get_plans(user_id: str = Depends(get_current_user)):
    """Return every study plan belonging to the authenticated user."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT id, user_id, assignment_name, subject, due_date, "
        "       assignment_type, workload, status, created_at, updated_at "
        "FROM study_plans WHERE user_id = %s ORDER BY created_at DESC",
        (user_id,),
    )
    rows = cur.fetchall()

    plans = []
    for row in rows:
        plan_id = row[0]

        cur.execute(
            "SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday "
            "FROM availability WHERE plan_id = %s", (plan_id,))
        av = cur.fetchone()
        availability = {}
        if av:
            availability = {
                "monday": float(av[0]), "tuesday": float(av[1]),
                "wednesday": float(av[2]), "thursday": float(av[3]),
                "friday": float(av[4]), "saturday": float(av[5]),
                "sunday": float(av[6]),
            }

        cur.execute(
            "SELECT session_length, preferred_study_time, break_frequency, priority "
            "FROM preferences WHERE plan_id = %s", (plan_id,))
        pref = cur.fetchone()
        preferences = {}
        if pref:
            preferences = {
                "session_length": pref[0], "preferred_study_time": pref[1],
                "break_frequency": pref[2], "priority": pref[3],
            }

        cur.execute(
            "SELECT id, session_date, start_time, end_time, task_name, is_completed, note "
            "FROM study_sessions WHERE plan_id = %s ORDER BY session_date, start_time",
            (plan_id,))
        sess_rows = cur.fetchall()
        sessions = [
            {"id": str(s[0]), "session_date": str(s[1]), "start_time": str(s[2]),
             "end_time": str(s[3]), "task_name": s[4], "is_completed": s[5], "note": s[6]}
            for s in sess_rows
        ]

        plans.append({
            "id": str(row[0]), "user_id": str(row[1]),
            "assignment_name": row[2], "subject": row[3],
            "due_date": str(row[4]), "assignment_type": row[5],
            "workload": row[6], "status": row[7],
            "created_at": str(row[8]), "updated_at": str(row[9]),
            "availability": availability, "preferences": preferences,
            "sessions": sessions,
        })

    cur.close()
    conn.close()
    return plans


# ----------------------------------------------------------------
# POST /plans
# ----------------------------------------------------------------
@router.post("/plans", status_code=201)
def create_plan(body: PlanCreate, user_id: str = Depends(get_current_user)):
    """Create a new study plan with availability, preferences, and auto-generated sessions."""
    conn = get_connection()
    cur = conn.cursor()

    try:
        # 1. Insert study_plan
        cur.execute(
            "INSERT INTO study_plans "
            "(user_id, assignment_name, subject, due_date, assignment_type, workload) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (user_id, body.assignment_name, body.subject, str(body.due_date),
             body.assignment_type, body.workload),
        )
        plan_id = str(cur.fetchone()[0])

        # 2. Insert availability
        av = body.availability
        cur.execute(
            "INSERT INTO availability "
            "(plan_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (plan_id, av.monday, av.tuesday, av.wednesday, av.thursday,
             av.friday, av.saturday, av.sunday),
        )

        # 3. Insert preferences
        pref = body.preferences
        cur.execute(
            "INSERT INTO preferences "
            "(plan_id, session_length, preferred_study_time, break_frequency, priority) "
            "VALUES (%s,%s,%s,%s,%s)",
            (plan_id, pref.session_length, pref.preferred_study_time,
             pref.break_frequency, pref.priority),
        )

        # 4. Generate and insert study sessions
        av_dict = {
            "monday": av.monday, "tuesday": av.tuesday, "wednesday": av.wednesday,
            "thursday": av.thursday, "friday": av.friday,
            "saturday": av.saturday, "sunday": av.sunday,
        }
        sessions = _generate_sessions(
            plan_id=plan_id, due_date=body.due_date, availability=av_dict,
            session_length=pref.session_length,
            preferred_study_time=pref.preferred_study_time,
            assignment_type=body.assignment_type, workload=body.workload,
        )

        for s in sessions:
            cur.execute(
                "INSERT INTO study_sessions "
                "(plan_id, session_date, start_time, end_time, task_name, is_completed, note) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (s["plan_id"], str(s["session_date"]), str(s["start_time"]),
                 str(s["end_time"]), s["task_name"], s["is_completed"], s["note"]),
            )

        conn.commit()
    except Exception as exc:
        conn.rollback()
        cur.close()
        conn.close()
        raise HTTPException(status_code=500, detail=str(exc))

    cur.close()
    conn.close()
    return {"message": "Plan created successfully", "plan_id": plan_id, "sessions_generated": len(sessions)}


# ----------------------------------------------------------------
# PUT /plans/{plan_id}
# ----------------------------------------------------------------
@router.put("/plans/{plan_id}")
def update_plan(plan_id: str, body: PlanUpdate, user_id: str = Depends(get_current_user)):
    """Update plan assignment_name, subject, due_date, and/or availability. Sessions NOT recreated."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM study_plans WHERE id = %s AND user_id = %s", (plan_id, user_id))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Plan not found")

    try:
        fields, values = [], []
        if body.assignment_name is not None:
            fields.append("assignment_name = %s"); values.append(body.assignment_name)
        if body.subject is not None:
            fields.append("subject = %s"); values.append(body.subject)
        if body.due_date is not None:
            fields.append("due_date = %s"); values.append(str(body.due_date))
        if fields:
            fields.append("updated_at = NOW()"); values.append(plan_id)
            cur.execute(f"UPDATE study_plans SET {', '.join(fields)} WHERE id = %s", values)

        if body.availability is not None:
            av = body.availability
            cur.execute(
                "UPDATE availability SET monday=%s, tuesday=%s, wednesday=%s, "
                "thursday=%s, friday=%s, saturday=%s, sunday=%s WHERE plan_id = %s",
                (av.monday, av.tuesday, av.wednesday, av.thursday,
                 av.friday, av.saturday, av.sunday, plan_id),
            )
        conn.commit()
    except Exception as exc:
        conn.rollback(); cur.close(); conn.close()
        raise HTTPException(status_code=500, detail=str(exc))

    cur.close(); conn.close()
    return {"message": "Plan updated successfully"}


# ----------------------------------------------------------------
# DELETE /plans/{plan_id}
# ----------------------------------------------------------------
@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str, user_id: str = Depends(get_current_user)):
    """Delete a plan and all related data (cascades via FK)."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM study_plans WHERE id = %s AND user_id = %s", (plan_id, user_id))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Plan not found")

    try:
        cur.execute("DELETE FROM study_plans WHERE id = %s", (plan_id,))
        conn.commit()
    except Exception as exc:
        conn.rollback(); cur.close(); conn.close()
        raise HTTPException(status_code=500, detail=str(exc))

    cur.close(); conn.close()
    return {"message": "Plan deleted successfully"}