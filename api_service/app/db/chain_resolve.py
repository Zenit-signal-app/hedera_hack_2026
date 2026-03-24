"""Resolve chain_id to slug from the chains table."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


def _chains_table() -> str:
    schema = (settings.SCHEMA_1 or "").strip()
    if schema:
        return f"{schema}.chains"
    return "chains"


def get_slug_for_chain_id(db: Session, chain_id: int) -> str:
    """
    Look up slug from the chains table by chain_id.
    Returns the slug string, or empty string if not found.
    """
    table = _chains_table()
    try:
        row = db.execute(
            text(f"SELECT slug FROM {table} WHERE id = {int(chain_id)} LIMIT 1")
        ).fetchone()
    except Exception:
        return ""
    if not row or not hasattr(row, "slug"):
        return ""
    return str(row.slug or "").strip()

def _sql_slug(slug: str) -> str:
    """Escape slug for SQL in a WHERE clause (quoted)."""
    if slug is None:
        return "NULL"
    safe = str(slug).strip().replace("'", "''")
    return f"'{safe}'"


def get_chain_id_for_slug(db: Session, slug: str) -> int:
    """
    Look up chain_id from the chains table by slug.
    Returns the chain_id integer, or 0 if not found.
    """
    if not slug or not str(slug).strip():
        return 0
    table = _chains_table()
    try:
        row = db.execute(
            text(f"SELECT id FROM {table} WHERE slug = {_sql_slug(slug)} LIMIT 1")
        ).fetchone()
    except Exception:
        return 0
    if not row or not hasattr(row, "id"):
        return 0
    return int(row.id or 0)
