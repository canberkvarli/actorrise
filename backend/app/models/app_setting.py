"""Global app settings - small key/value table for admin-toggleable flags.

Backs runtime switches that admins flip from the console (e.g. whether new
signups get the founding-actor offer email). Read by both the API and the
signup flow.
"""

from app.core.database import Base
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy import text as sql_text


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(String, nullable=True)  # serialized scalar; bools stored as "true"/"false"
    updated_at = Column(
        DateTime(timezone=True),
        server_default=sql_text("(now())"),
        onupdate=sql_text("(now())"),
        nullable=False,
    )
