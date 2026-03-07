"""Schemas for FCM push notification API."""
from typing import Any

from pydantic import Field

from app.schemas.my_base_model import CustomBaseModel


class SendFCMRequest(CustomBaseModel):
    """Request body for sending a push notification via FCM."""

    token: str | None = Field(None, description="Single FCM registration token.")
    tokens: list[str] | None = Field(None, description="Multiple FCM registration tokens (same message to all).")
    topic: str | None = Field(None, description="FCM topic name (e.g. 'signals' or 'topics/signals').")
    title: str | None = Field(None, description="Notification title.")
    body: str | None = Field(None, description="Notification body text.")
    data: dict[str, Any] | None = Field(None, description="Optional key-value data payload (values will be stringified).")
    image: str | None = Field(None, description="Optional image URL for the notification.")
    analytics_label: str | None = Field(None, description="Label for Messaging Reports (e.g. 'api_signals'). Max 50 chars, [a-zA-Z0-9-_.~%].")
    dry_run: bool = Field(False, description="If true, FCM validates but does not deliver.")


class SendFCMResponse(CustomBaseModel):
    """Response after sending to a single token or topic."""

    message_id: str = Field(..., description="FCM message ID.")
    success_count: int = Field(1, description="Number of messages sent (1 for single/topic).")


class SendFCMBatchResponse(CustomBaseModel):
    """Response after sending to multiple tokens."""

    success_count: int = Field(..., description="Number of messages sent successfully.")
    failure_count: int = Field(..., description="Number of failed sends.")
    message_ids: list[str | None] = Field(default_factory=list, description="Message ID per token, or null for failures.")


class SignalNotification(CustomBaseModel):
    """One signal/notification row for the FE (from the signals table)."""

    id: str = Field(..., description="UUID of the signal.")
    symbol: str = Field(..., description="Symbol (e.g. BTCUSDT).")
    timeframe: str = Field(..., description="Timeframe (e.g. 30m, 1h).")
    signal: dict[str, Any] = Field(..., description="Indicators and values (JSONB).")
    open_time: int = Field(..., description="Candle open time (epoch).")
    created_at: str = Field(..., description="When the signal was stored (ISO timestamp).")
