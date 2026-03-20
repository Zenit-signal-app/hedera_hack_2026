# import json
# from typing import Optional
# from fastapi import Header, HTTPException, Query, status
# from telegram_webapp_auth import validate
# from app.core.config import settings

# def verify_telegram_auth(
#     x_telegram_init_data: Optional[str] = Header(None),
#     init_data: Optional[str] = Query(None, description="Telegram initData string for GET requests")
# ) -> str:
#     """
#     Validates Telegram Mini App initData and returns the telegram user ID.
#     Accepts initData from either X-Telegram-Init-Data header or init_data query parameter.
#     """
#     data_string = x_telegram_init_data or init_data
#     if not data_string:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Missing Telegram initData"
#         )
    
#     bot_token = settings.BOT_TOKEN
#     if not bot_token:
#         # Proceed with a warning or block if strict. 
#         # For safety, require it to be configured. 
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail="BOT_TOKEN is not configured"
#         )

#     try:
#         user_data = validate(data_string, bot_token)
#         telegram_id = str(user_data.get("id"))
#         if not telegram_id or telegram_id == 'None':
#             raise ValueError("No user ID found in validated initData")
#         return telegram_id
#     except ValueError:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid Telegram data"
#         )


import hmac
import hashlib
import urllib.parse
import json
from operator import itemgetter

def verify_telegram_auth(init_data: str, bot_token: str) -> int:
    """
    Validates Telegram initData and returns the telegram_id.
    Standard implementation: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
    """
    # 1. Clean the string (handles that leading space in your example)
    init_data = init_data.strip()
    
    # 2. Parse the query string into a dictionary
    vals = dict(urllib.parse.parse_qsl(init_data))
    
    # 3. Extract the hash and remove it from the verification data
    if 'hash' not in vals:
        raise ValueError("Missing hash in initData")
    received_hash = vals.pop('hash')
    
    # 4. Prepare data_check_string (sorted alphabetically, joined by \n)
    data_check_list = []
    for k, v in sorted(vals.items(), key=itemgetter(0)):
        data_check_list.append(f"{k}={v}")
    data_check_string = "\n".join(data_check_list)

    # 5. Generate Secret Key: HMAC-SHA256(key="WebAppData", msg=bot_token)
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    
    # 6. Generate Validation Hash: HMAC-SHA256(key=secret_key, msg=data_check_string)
    generated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    # 7. Securely compare hashes
    if hmac.compare_digest(generated_hash, received_hash):
        # 8. Success! Parse the user JSON to get the ID
        user_data = json.loads(vals.get("user", "{}"))
        return user_data.get("id")
    
    raise ValueError("Invalid Telegram signature (hash mismatch)")