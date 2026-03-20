import json
from typing import Optional
from fastapi import Header, HTTPException, Query, status
from telegram_webapp_auth import validate
from app.core.config import settings

def verify_telegram_auth(
    x_telegram_init_data: Optional[str] = Header(None),
    init_data: Optional[str] = Query(None, description="Telegram initData string for GET requests")
) -> str:
    """
    Validates Telegram Mini App initData and returns the telegram user ID.
    Accepts initData from either X-Telegram-Init-Data header or init_data query parameter.
    """
    data_string = x_telegram_init_data or init_data
    if not data_string:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Telegram initData"
        )
    
    bot_token = settings.BOT_TOKEN
    if not bot_token:
        # Proceed with a warning or block if strict. 
        # For safety, require it to be configured. 
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="BOT_TOKEN is not configured"
        )

    try:
        user_data = validate(data_string, bot_token)
        telegram_id = str(user_data.get("id"))
        if not telegram_id or telegram_id == 'None':
            raise ValueError("No user ID found in validated initData")
        return telegram_id
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram data"
        )
