"""
main.py — StudyPlan FastAPI Application
Uses the modern lifespan pattern (not deprecated @app.on_event).
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Import database module to run table creation on startup
import database
from routes.auth import router as auth_router
from routes.plans import router as plans_router
from routes.sessions import router as sessions_router


# ----------------------------------------------------------------
# Lifespan — runs once when the server starts (and on shutdown)
# ----------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialise database tables. Shutdown: nothing to clean up."""
    print("Starting StudyPlan API...")
    try:
        database.init_db()
    except Exception as exc:
        print(f"WARNING: Database init failed (will retry on first request): {exc}")
    yield
    print("StudyPlan API shutting down.")


# ----------------------------------------------------------------
# Create FastAPI app
# ----------------------------------------------------------------
app = FastAPI(
    title="StudyPlan API",
    description="Backend API for the StudyPlan study-planning app",
    version="1.0.0",
    lifespan=lifespan,
)


# ----------------------------------------------------------------
# CORS — allow both local dev and Vercel deployment
# ----------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://astudyplan.vercel.app",
        "https://astudyplan-bjcix3e6f-no-team-at-all.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------
# Register routers
# ----------------------------------------------------------------
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(sessions_router)


# ----------------------------------------------------------------
# Health route
# ----------------------------------------------------------------
@app.get("/health")
def health():
    """Quick health check — also pings the database."""
    try:
        conn = database.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as exc:
        return {"status": "unhealthy", "database": str(exc)}


# ----------------------------------------------------------------
# Frontend - serve the built React SPA (Vite output: Frontend_Study_plan_app/dist)
# Per Vercel docs: app.frontend() is low-priority; every API route wins over it.
# ----------------------------------------------------------------
app.frontend(
    "/",
    directory=os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "..", "Frontend_Study_plan_app", "dist")),
    fallback="index.html",
    check_dir=False,
)


# ----------------------------------------------------------------
# Run with: python main.py
# ----------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)