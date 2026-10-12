"""
models.py — Pydantic request/response models for the StudyPlan API
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


# ── Auth ──────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Availability ──────────────────────────────────────────────

class AvailabilityCreate(BaseModel):
    monday: float = 0
    tuesday: float = 0
    wednesday: float = 0
    thursday: float = 0
    friday: float = 0
    saturday: float = 0
    sunday: float = 0


# ── Preferences ───────────────────────────────────────────────

class PreferencesCreate(BaseModel):
    session_length: int = Field(..., description="Study session length in minutes: 25, 50, or 90")
    preferred_study_time: str = Field(..., description="Preferred time of day: morning, afternoon, or evening")
    break_frequency: str = Field(..., description="Break frequency: every_25min, every_50min, or when_needed")
    priority: str = Field(..., description="Task ordering priority: finish_early, balanced, or difficult_first")


# ── Study Plans ───────────────────────────────────────────────

class PlanCreate(BaseModel):
    assignment_name: str
    subject: str
    due_date: date
    assignment_type: str = Field(..., description="essay, report, presentation, exam, or project")
    workload: str = Field(..., description="light, moderate, or heavy")
    availability: AvailabilityCreate
    preferences: PreferencesCreate


class PlanUpdate(BaseModel):
    assignment_name: Optional[str] = None
    subject: Optional[str] = None
    due_date: Optional[date] = None
    availability: Optional[AvailabilityCreate] = None


# ── Study Sessions ────────────────────────────────────────────

class SessionUpdate(BaseModel):
    is_completed: Optional[bool] = None
    note: Optional[str] = Field(None, max_length=50, description="Short note, max 50 characters")