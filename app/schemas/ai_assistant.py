from pydantic import field_validator
from app.schemas.my_base_model import CustomBaseModel
import re


class UserQuery(CustomBaseModel):
    query: str = ""

    @field_validator("query")
    def normalize_query(cls, v: str) -> str:
        v = (v or "").strip().replace("\n", " ").replace("\t", " ")
        # Keep only letters, numbers and whitespace – same behavior as vistia chat schema
        v = re.sub(r"[^A-Za-z0-9\s]+", "", v)
        return v

