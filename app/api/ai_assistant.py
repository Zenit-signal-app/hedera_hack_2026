from __future__ import annotations

from typing import List

import pandas as pd
from fastapi import Depends
from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.router_decorated import APIRouter
from app.db.session import get_db, get_tables
from app.schemas.ai_assistant import UserQuery

router = APIRouter()
group_tags: List[str] = ["AI Assistant"]

tables = get_tables(settings.SCHEMA_1)

# Fallback when DB query fails or returns no rows
_DEFAULT_SUPPORT_COINS = ["BTCUSDT", "ETHUSDT", "XRPUSDT"]

# Coins with 1d data in the last 30 days are considered supported (seconds)
_SUPPORT_COINS_RECENCY_SECONDS = 30 * 24 * 3600


def _get_support_coins(db: Session) -> List[str]:
    """
    Load distinct symbols from the 1d signal table (same as used for analysis)
    that have data in the last 30 days. Uses SCHEMA_1.
    """
    table_1d = tables["f1d"]
    query = f"""
        SELECT DISTINCT symbol
        FROM {table_1d}
        WHERE open_time >= extract(epoch from now())::bigint - {_SUPPORT_COINS_RECENCY_SECONDS}
        ORDER BY symbol
    """
    try:
        result = db.execute(text(query)).fetchall()
        symbols = [row.symbol for row in result if row.symbol]
        out = [str(s).strip().upper() for s in symbols if str(s).strip()]
        return out if out else _DEFAULT_SUPPORT_COINS
    except Exception:
        return _DEFAULT_SUPPORT_COINS


try:
    client = OpenAI(api_key=settings.GPT_KEY)
except Exception:
    client = None


def _classify_user_intent(user_query: str) -> str:
    if client is None:
        return "chatbot is not available"

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": """
                    You are an AI assistant for Vistia, a platform that delivers real-time AI-powered signals about the cryptocurrency market.
                    When a user asks a question unrelated to trading or the crypto market, respond politely to their inquiry while kindly reminding them that the topic isn't connected to trading or crypto.
                    Always maintain a helpful and courteous tone.

                    If the user's query give details information about a specifc coin, you should give only the information below:
                        - symbol

                    Below are examples of question answers
                        "What is the price of bitcoin?", you should answer "BTC" not "BTC." or "BTC is $50,000".
                        "Should i buy Ethereum now?", you should answer "ETH" not "eth" or "ETH is $3,000".
                        "What is the price of Bitcoin and Algorand?", you should answer "BTC, ALGO". not "BTC and ALGO" or "BTC and ALGO are $50,000 and $1.00".
                        "How is the market today?", you should answer "all" not "all coins" or "All."

                    You should not provide any other information than the symbol of the coin.
                """,
            },
            {
                "role": "user",
                "content": user_query,
            },
        ],
    )

    return completion.choices[0].message.content.strip()


@router.post(
    "/chat",
    tags=group_tags,
    summary="AI Assistant crypto chat",
    description=(
        "Description: Answer user questions about the crypto market and provide technical analysis based on recent OHLCV data.\n\n"
        "Input format: JSON body `{ \"query\": \"...\" }`, where `query` is a text question; it is normalized to alphanumeric characters and spaces.\n\n"
        "Output format: Plain text string containing either an informational reply, an error message, or a technical analysis of the requested symbols."
    ),
)
def generate_detailed_response(form: UserQuery, db: Session = Depends(get_db)) -> str:
    if client is None:
        return "chatbot is not available"

    table = tables["f1d"]
    user_query = form.query
    classification = _classify_user_intent(user_query)

    if len(classification) > 10:
        # Long, non-symbol classification – return explanation directly
        return classification

    coins_list: List[str] = []
    coins_str: str = ""
    real_time_data = ""

    classification_upper = classification.upper()
    if "all" in classification_upper.lower():
        coins_list = ["XRPUSDT"]
        coins_str = "XRP"
    else:
        coins_list = [coin.strip() + "USDT" for coin in classification_upper.split(",")]
        coins_str = classification_upper

    support_coins = _get_support_coins(db)
    not_supported = set(coins_list) - set(support_coins)
    if not_supported:
        not_supported_string = ", ".join(sorted(not_supported))
        return (
            f"Sorry, I don't have information on the following coins: {not_supported_string}. "
            "Check the '/list_coin' command for supported coins."
        )

    try:
        for coin in coins_list:
            query = (
                f"SELECT * FROM {table} "
                f"WHERE symbol = '{coin}' "
                "ORDER BY open_time DESC LIMIT 14"
            )
            result = db.execute(text(query))
            df = pd.DataFrame(result.fetchall(), columns=result.keys())
            real_time_data += f"\n\n{coin}:\n"
            real_time_data += df.to_string(index=False)
    except Exception:
        return (
            "I’m here to assist you with questions about trading or the cryptocurrency market. "
            "If you have any questions related to those topics, feel free to ask!"
        )

    sys_prompt = (
        "You are an AI providing technical analysis on cryptocurrency.\n"
        f"Provide an analysis of the current market situation for {coins_str}. Include short-term trends, and key "
        "technical indicators.\n"
        "Is the symbol currently in a buying range, or should the user wait for a better entry point? "
        "Please provide an analysis based on the technical indicators provided, such as moving averages, RSI, and "
        "support/resistance levels.\n"
        "You should answer me in raw text format. The markdown format is not allowed.\n"
        "Base on the following real-time data timeframe 1 day for the symbol with the open_time in GMT+7 timezone:\n"
        f"{real_time_data}"
    )

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": sys_prompt,
            },
            {
                "role": "user",
                "content": user_query,
            },
        ],
    )

    return completion.choices[0].message.content

