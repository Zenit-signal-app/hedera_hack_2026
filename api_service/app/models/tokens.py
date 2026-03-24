from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.sql import func

from app.models.base import Base, SCHEMA


def _table_args() -> dict:
    if SCHEMA:
        return {"schema": SCHEMA}
    return {}


class Token(Base):
    __tablename__ = "tokens"
    __table_args__ = _table_args()

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False)
    name = Column("name", String(100), nullable=True)
    chain = Column(String(50), nullable=True)
    contract_address = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=True, server_default=text("true"))
    created_at = Column(
        DateTime(timezone=True), nullable=True, server_default=func.now()
    )
    chain_id = Column(
        Integer,
        ForeignKey("production.chains.id") if SCHEMA else ForeignKey("chains.id"),
        nullable=False,
        server_default=text("1"),
    )
