from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status
import uvicorn, secrets, os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from app.middleware import CacheRequestMiddleware
from app.core.config import settings
from app.services.binance_websocket import get_binance_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    manager = get_binance_manager()
    await manager.start()
    yield
    await manager.shutdown()


# Define the FastAPI application instance
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
    openapi_tags=[
        {
            "name": "WebSocket",
            "description": (
                "Real-time OHLCV price stream. Connect to `/ohlcv` to receive one big message every time: "
                "a full snapshot of all token data. Sent on connect and after each update cycle (~60s). "
                "No client messages required."
            ),
        },
    ],
)

# cache middleware (only if Redis is configured)
if settings.REDIS_HOST is not None and settings.REDIS_HOST.strip() != '':
    app.add_middleware(CacheRequestMiddleware)
    print("Redis caching enabled")
else:
    print("Redis caching disabled - REDIS_HOST not configured")
# session middleware
app.add_middleware(SessionMiddleware, 
                   secret_key=settings.SESSION_SECRET_KEY,
                   max_age=1800  # 1800,  # 30 minutes lifetime, extend with each request
                   )

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins="*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# mount public static files (only if directory exists)
if settings.STATIC_FOLDER and os.path.exists(settings.STATIC_FOLDER):
    app.mount("/static", StaticFiles(directory=settings.STATIC_FOLDER), name="static")

security = HTTPBasic()
def doc_auth(credentials: HTTPBasicCredentials = Depends(security)):
    correct_password = secrets.compare_digest(credentials.password, settings.DOC_PASSWORD)
    if not (correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@app.get("/docs", include_in_schema=False)
async def get_swagger_documentation(username: str = Depends(doc_auth)):
    return get_swagger_ui_html(openapi_url="/openapi.json", title="docs")

@app.get("/redoc", include_in_schema=False)
async def get_redoc_documentation(username: str = Depends(doc_auth)):
    return get_redoc_html(openapi_url="/openapi.json", title="docs")

@app.get("/openapi.json", include_in_schema=False)
async def openapi(username: str = Depends(doc_auth)):
    return get_openapi(title=app.title, version=app.version, routes=app.routes)

# Include your API routers
# Organized by functionality
from app.api import (
    admob,
    ai_assistant,
    auth,
    chains,
    favorites,
    notifications,
    prices,
    signal_tools,
    token,
    websocket,
)

app.include_router(websocket.router, tags=websocket.group_tags)
app.include_router(chains.router, prefix="/chains", tags=chains.group_tags)
app.include_router(admob.router, prefix="/admob", tags=admob.group_tags)
app.include_router(notifications.router, prefix="/notifications", tags=notifications.group_tags)
app.include_router(prices.router, prefix="/prices", tags=prices.group_tags)
app.include_router(token.router, prefix="/tokens", tags=token.group_tags)
app.include_router(signal_tools.router, prefix="/signal-tools", tags=signal_tools.group_tags)
app.include_router(favorites.router, prefix="/favorites", tags=favorites.group_tags)
app.include_router(auth.router, prefix="/auth", tags=auth.group_tags)
app.include_router(ai_assistant.router, prefix="/ai-assistant", tags=ai_assistant.group_tags)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host='127.0.0.1',
        port=settings.PORT,
        # ssl_keyfile=settings.SSL_KEY,
        # ssl_certfile=settings.SSL_CERT,
        reload=True
    )
