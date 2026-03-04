import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv(override=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Zenit"
    # Application settings
    PORT: int | None 
    PROTOCOL: str | None
    DOMAIN: str | None
    HOST: str | None
    STATIC_FOLDER: str | None
    VERSION: str | None
    DOC_PASSWORD: str | None
    SESSION_SECRET_KEY: str | None

    # SSL settings
    SSL_KEY: str | None
    SSL_CERT: str | None

    # MySQL settings

    SCHEMA_1: str | None
    SCHEMA_2: str | None
    SCHEMA_3: str | None
    SCHEMA_4: str | None
    SCHEMA_5: str | None

    # SQLAlchemy database URL
    DATABASE_URL: str

    # Login configuration
    ENCODE_KEY: str | None
    ENCODE_ALGORITHM: str | None
    ACCESS_TOKEN_EXPIRE_MINUTES: int | None
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_HASH_KEY: str | None = None

    # Firebase settings
    FIREBASE_PROJECT_ID: str | None = None
    FIREBASE_SERVICE_ACCOUNT_PATH: str | None = None
    FIREBASE_SERVICE_ACCOUNT_JSON: str | None = None

    # Settings for session login
    GOOGLE_CLIENT_ID: str | None
    GOOGLE_CLIENT_SECRET: str | None

    # Redis settings
    REDIS_HOST: str | None
    REDIS_PORT: int | None
    REDIS_MAX_CONNECTIONS: int | None
    REDIS_SSL: bool | None
    
    TOKEN_CACHE_ENABLE_BACKGROUND_REFRESH: bool = False
    TOKEN_CACHE_REFRESH_INTERVAL: int = 15
    TOKEN_CACHE_INFO_TTL: int = 3600
    TOKEN_CACHE_PRICE_TTL: int = 30
    
    # Chat GPT settings
    GPT_KEY: str | None
     
    SYMBOL_MOBILE_SUPPORT: str | None

    # Binance WebSocket (24/7 price stream)
    BINANCE_WS_INTERVAL: str = "1m"
    BINANCE_WS_POLL_INTERVAL_SECONDS: int = 60
    BINANCE_WS_SYMBOL_REFRESH_MINUTES: int = 60

    class Config:
        env_file = ".env"

# Instantiate the settings
settings = Settings()
