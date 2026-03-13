from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class FirebaseLoginRequest(BaseModel):
    token: str = Field(..., description="Firebase ID token")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    issued_at: str


class UserResponse(BaseModel):
    id: str
    firebase_uid: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    provider: Optional[str] = None
    role: str
    chain: str = ""


class FirebaseLoginResponse(BaseModel):
    tokens: TokenResponse
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    tokens: TokenResponse
    user: UserResponse


class LogoutRequest(BaseModel):
    refresh_token: str


class LogoutResponse(BaseModel):
    revoked: bool

