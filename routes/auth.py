"""
routes/auth.py — Authentication endpoints
Uses Supabase Auth REST API for signup/login.
"""

import os
import requests
import jwt
from fastapi import APIRouter, Header, HTTPException
from models import SignupRequest, LoginRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


# ----------------------------------------------------------------
# Dependency: extract user_id from Bearer token
# ----------------------------------------------------------------
#
# SECURITY NOTE (learning project):
#   This decodes the JWT WITHOUT verifying the signature.
#   In production you MUST verify the signature using Supabase's
#   JWT secret (found in Project Settings → API → JWT Secret)
#   or by fetching the JWKS from /.well-known/jwks.json
#   and using PyJWT's RSA verification.
#
def get_current_user(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency — extracts and returns the user_id (UUID)
    from the Authorization: Bearer <token> header.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.replace("Bearer ", "")

    try:
        # Decode without signature verification (learning only!)
        # In production: jwt.decode(token, SECRET, algorithms=["HS256"])
        payload = jwt.decode(
            token,
            options={"verify_signature": False},
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token has no user id")
        return user_id
    except jwt.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ----------------------------------------------------------------
# POST /auth/signup
# ----------------------------------------------------------------
@router.post("/signup")
def signup(body: SignupRequest):
    """
    Register a new user via Supabase Auth.
    The database trigger (handle_new_user) automatically creates
    a row in the profiles table when a new auth user is created.
    """
    url = f"{SUPABASE_URL}/auth/v1/signup"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "email": body.email,
        "password": body.password,
        "data": {"full_name": body.full_name},
    }

    resp = requests.post(url, json=payload, headers=headers)

    if resp.status_code != 200:
        detail = resp.json().get("msg", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()

    return {
        "message": "Signup successful. Check your email for confirmation if email confirmation is enabled.",
        "user_id": data.get("id"),
        "email": data.get("email"),
    }


# ----------------------------------------------------------------
# POST /auth/login
# ----------------------------------------------------------------
@router.post("/login")
def login(body: LoginRequest):
    """
    Log in an existing user via Supabase Auth.
    Returns an access_token that the frontend should store
    and send as  Authorization: Bearer <token>  on subsequent requests.
    """
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "email": body.email,
        "password": body.password,
    }

    resp = requests.post(url, json=payload, headers=headers)

    if resp.status_code != 200:
        detail = resp.json().get("error_description", resp.json().get("msg", resp.text))
        raise HTTPException(status_code=401, detail=detail)

    data = resp.json()

    return {
        "access_token": data.get("access_token"),
        "token_type": "bearer",
        "user_id": data.get("user", {}).get("id"),
    }