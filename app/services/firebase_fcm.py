"""
Send push notifications via Firebase Cloud Messaging (FCM).

Uses the same Firebase Admin app as firebase_auth. Frontend handles
receiving and displaying notifications; this module only pushes to FCM.
"""

from __future__ import annotations

import logging
from typing import Any

from firebase_admin import messaging

from app.services.firebase_auth import _get_app

LOGGER = logging.getLogger(__name__)


def _stringify_data(data: dict[str, Any] | None) -> dict[str, str]:
    """FCM data payload requires string keys and string values."""
    if not data:
        return {}
    return {k: str(v) for k, v in data.items()}


def _fcm_options(analytics_label: str | None) -> messaging.FCMOptions | None:
    """Build FCMOptions for analytics; enables tracking in Firebase Console > Messaging > Reports."""
    if not analytics_label:
        return None
    return messaging.FCMOptions(analytics_label=analytics_label)


def send_to_token(
    token: str,
    *,
    title: str | None = None,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    image: str | None = None,
    analytics_label: str | None = None,
    dry_run: bool = False,
) -> str:
    """
    Send a push notification to a single FCM registration token.

    analytics_label: optional label for Messaging Reports (e.g. 'api_signals'). Max 50 chars, [a-zA-Z0-9-_.~%].
    Returns the message ID string on success.
    Raises firebase_admin.exceptions.FirebaseError on failure (e.g. UnregisteredError for invalid token).
    """
    app = _get_app()
    notification = None
    if title is not None or body is not None or image is not None:
        notification = messaging.Notification(
            title=title or "",
            body=body or "",
            image=image,
        )
    message = messaging.Message(
        notification=notification,
        data=_stringify_data(data),
        token=token.strip(),
        fcm_options=_fcm_options(analytics_label),
    )
    return messaging.send(message, dry_run=dry_run, app=app)


def send_to_tokens(
    tokens: list[str],
    *,
    title: str | None = None,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    image: str | None = None,
    analytics_label: str | None = None,
    dry_run: bool = False,
) -> messaging.BatchResponse:
    """
    Send the same push notification to multiple FCM registration tokens.

    analytics_label: optional label for Messaging Reports (e.g. 'api_signals').
    Returns BatchResponse with success_count, failure_count, and per-token responses.
    """
    if not tokens:
        return messaging.BatchResponse(responses=[])
    app = _get_app()
    notification = None
    if title is not None or body is not None or image is not None:
        notification = messaging.Notification(
            title=title or "",
            body=body or "",
            image=image,
        )
    multicast = messaging.MulticastMessage(
        notification=notification,
        data=_stringify_data(data),
        tokens=[t.strip() for t in tokens if t and t.strip()],
        fcm_options=_fcm_options(analytics_label),
    )
    return messaging.send_each_for_multicast(multicast, dry_run=dry_run, app=app)


def send_to_topic(
    topic: str,
    *,
    title: str | None = None,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    image: str | None = None,
    analytics_label: str | None = None,
    dry_run: bool = False,
) -> str:
    """
    Send a push notification to an FCM topic (all subscribed devices).

    topic may include the 'topics/' prefix or not; the SDK expects the bare name (e.g. 'alerts').
    analytics_label: optional label for Messaging Reports (e.g. 'api_signals').
    Returns the message ID string on success.
    """
    app = _get_app()
    t = topic.strip()
    if t.startswith("topics/"):
        t = t[7:]  # FCM SDK expects bare topic name, not 'topics/...'
    notification = None
    if title is not None or body is not None or image is not None:
        notification = messaging.Notification(
            title=title or "",
            body=body or "",
            image=image,
        )
    message = messaging.Message(
        notification=notification,
        data=_stringify_data(data),
        topic=t,
        fcm_options=_fcm_options(analytics_label),
    )
    return messaging.send(message, dry_run=dry_run, app=app)
