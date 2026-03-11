from sqlalchemy import MetaData
from sqlalchemy.orm import declarative_base

from app.core.config import settings

SCHEMA = settings.SCHEMA_2 or None
METADATA = MetaData(schema=SCHEMA) if SCHEMA else MetaData()

Base = declarative_base(metadata=METADATA)
