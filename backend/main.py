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
    database.init_db()
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
# CORS — allow the React dev server
# ----------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
# Root & Health routes
# ----------------------------------------------------------------
@app.get("/")
def root():
    return {
        "message": "StudyPlan API is running",
        "docs": "http://127.0.0.1:8000/docs",
    }


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
# Run with: python main.py
# ----------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)