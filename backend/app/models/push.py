"""Ghost Light's push: the phones to reach, what was sent, and the widget's key.

A phone hands its Expo push token over once the actor has said yes to
notifications, with its time zone, so "tonight" lands at seven on the actor's
own clock. Each send is written down once per actor, kind and night, so a
scheduler that wakes twice in the hour never knocks twice.

The widget cannot sign in. The app gives it a key of its own (WidgetKey),
which opens nothing but that actor's tonight.
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class PushToken(Base):
    __tablename__ = "push_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(200), nullable=False, unique=True, index=True)
    tz = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    #: Set when Expo says the phone is gone (DeviceNotRegistered) or the actor signs out.
    disabled_at = Column(DateTime(timezone=True), nullable=True)


class PushSend(Base):
    __tablename__ = "push_sends"
    __table_args__ = (UniqueConstraint("user_id", "kind", "day", name="uq_push_send_night"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(24), nullable=False)
    day = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WidgetKey(Base):
    __tablename__ = "widget_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    key = Column(String(48), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
