import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv(override=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Zenit"
    # Application settings
    PORT: int | None = None
    PROTOCOL: str | None = None
    DOMAIN: str | None = None
    HOST: str | None = None
    STATIC_FOLDER: str | None = None
    VERSION: str | None = None
    DOC_PASSWORD: str | None = None
    SESSION_SECRET_KEY: str | None = None

    # SSL settings
    SSL_KEY: str | None = None
    SSL_CERT: str | None = None

    # MySQL settings

    SCHEMA_1: str | None = None
    SCHEMA_2: str | None = None
    SCHEMA_3: str | None = None
    SCHEMA_4: str | None = None
    SCHEMA_5: str | None = None

    # SQLAlchemy database URL
    DATABASE_URL: str

    # Login configuration
    ENCODE_KEY: str | None = None
    ENCODE_ALGORITHM: str | None = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int | None
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_HASH_KEY: str | None = None

    # Firebase settings
    FIREBASE_PROJECT_ID: str | None = None
    FIREBASE_SERVICE_ACCOUNT_PATH: str | None = None
    FIREBASE_SERVICE_ACCOUNT_JSON: str | None = None
    FCM_TOPIC_SIGNALS: str = "signals"

    # Settings for session login
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None

    # Redis settings
    REDIS_HOST: str | None = None
    REDIS_PORT: int | None = None
    REDIS_MAX_CONNECTIONS: int | None
    REDIS_SSL: bool | None = None
    
    TOKEN_CACHE_ENABLE_BACKGROUND_REFRESH: bool = False
    TOKEN_CACHE_REFRESH_INTERVAL: int = 15
    TOKEN_CACHE_INFO_TTL: int = 3600
    TOKEN_CACHE_PRICE_TTL: int = 30
    
    # Chat GPT settings
    GPT_KEY: str | None = None

    # Telegram Mini App Configuration
    BOT_TOKEN: str | None = None

    # Third-party APIs
    COINGECKO_API_KEY: str | None = None
     
    SYMBOL_MOBILE_SUPPORT: str | None = None

    # Binance WebSocket (24/7 price stream)
    BINANCE_WS_INTERVAL: str = "1m"
    BINANCE_WS_POLL_INTERVAL_SECONDS: int = 60
    BINANCE_WS_SYMBOL_REFRESH_MINUTES: int = 60

    class Config:
        env_file = ".env"

# Instantiate the settings
settings = Settings()
