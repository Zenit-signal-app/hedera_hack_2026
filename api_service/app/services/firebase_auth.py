from __future__ import annotations

import json
from typing import Any, Dict, Optional

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.core.config import settings


def _get_app() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
        service_account_info = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
        cred = credentials.Certificate(service_account_info)
    elif settings.FIREBASE_SERVICE_ACCOUNT_PATH:
        cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
    else:
        cred = credentials.ApplicationDefault()

    options: Optional[Dict[str, str]] = None
    if settings.FIREBASE_PROJECT_ID:
        options = {"projectId": settings.FIREBASE_PROJECT_ID}

    if options:
        return firebase_admin.initialize_app(cred, options=options)
    return firebase_admin.initialize_app(cred)


def verify_id_token(id_token: str) -> Dict[str, Any]:
    app = _get_app()
    return firebase_auth.verify_id_token(id_token, app=app)
