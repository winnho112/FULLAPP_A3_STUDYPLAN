"""
routes/sessions.py — Study Session endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from database import get_connection
from models import SessionUpdate
from routes.auth import get_current_user

router = APIRouter(tags=["Study Sessions"])


# ----------------------------------------------------------------
# GET /plans/{plan_id}/sessions
# ----------------------------------------------------------------
@router.get("/plans/{plan_id}/sessions")
def get_sessions(plan_id: str, user_id: str = Depends(get_current_user)):
    """Return all study sessions for a plan owned by the user."""
    conn = get_connection()
    cur = conn.cursor()

    # Verify the plan belongs to the user
    cur.execute(
        "SELECT id FROM study_plans WHERE id = %s AND user_id = %s",
        (plan_id, user_id),
    )
    if not cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Plan not found")

    cur.execute(
        "SELECT id, plan_id, session_date, start_time, end_time, "
        "       task_name, is_completed, note "
        "FROM study_sessions WHERE plan_id = %s ORDER BY session_date, start_time",
        (plan_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [
        {
            "id": str(r[0]),
            "plan_id": str(r[1]),
            "session_date": str(r[2]),
            "start_time": str(r[3]),
            "end_time": str(r[4]),
            "task_name": r[5],
            "is_completed": r[6],
            "note": r[7],
        }
        for r in rows
    ]


# ----------------------------------------------------------------
# PATCH /sessions/{session_id}
# ----------------------------------------------------------------
@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str,
    body: SessionUpdate,
    user_id: str = Depends(get_current_user),
):
    """
    Update is_completed and/or note (max 50 chars) for a session.
    Verifies the session belongs to a plan owned by the user.
    """
    conn = get_connection()
    cur = conn.cursor()

    # Verify ownership via the plan
    cur.execute(
        "SELECT s.id FROM study_sessions s "
        "JOIN study_plans p ON s.plan_id = p.id "
        "WHERE s.id = %s AND p.user_id = %s",
        (session_id, user_id),
    )
    if not cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")

    fields = []
    values = []
    if body.is_completed is not None:
        fields.append("is_completed = %s")
        values.append(body.is_completed)
    if body.note is not None:
        if len(body.note) > 50:
            cur.close()
            conn.close()
            raise HTTPException(status_code=422, detail="Note must be 50 characters or fewer")
        fields.append("note = %s")
        values.append(body.note)

    if not fields:
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(session_id)
    cur.execute(f"UPDATE study_sessions SET {', '.join(fields)} WHERE id = %s", values)
    conn.commit()
    cur.close()
    conn.close()

    return {"message": "Session updated successfully"}