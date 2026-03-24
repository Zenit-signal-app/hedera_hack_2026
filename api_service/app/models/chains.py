from sqlalchemy import Column, Integer, String
from sqlalchemy import TIMESTAMP
from sqlalchemy.sql import func

from app.models.base import Base, SCHEMA


def _table_args() -> dict:
    return {"schema": SCHEMA} if SCHEMA else {}


class Chain(Base):
    __tablename__ = "chains"
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(50), nullable=True, unique=False)
    native_token = Column(String(20), nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=True,
        server_default=func.now(),
    )
