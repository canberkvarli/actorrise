"""One row per day of App Store Connect numbers for the Ghost Light app.

Apple keeps installs, impressions and proceeds behind App Store Connect, and
RevenueCat only ever sees a purchase. Without this table the admin could show
who paid but not how many people ever saw the listing, which on 2026-10-06
turned out to be the number that mattered (398 impressions in three weeks).

Filled by services/app_store_connect.sync_recent, read by /api/admin/ghostlight.
"""

from sqlalchemy import Column, Date, DateTime, Float, Integer, String
from sqlalchemy.sql import text as sql_text

from app.core.database import Base


class AppStoreDaily(Base):
    __tablename__ = "app_store_daily"

    day = Column(Date, primary_key=True)
    # App Store Connect Analytics: "App Store Discovery and Engagement" and
    # "App Store Downloads". Null means Apple has not published that day yet.
    impressions = Column(Integer, nullable=True)
    page_views = Column(Integer, nullable=True)
    downloads = Column(Integer, nullable=True)  # first-time
    redownloads = Column(Integer, nullable=True)
    # Sales and Trends daily report: units of in-app purchases and proceeds.
    iap_units = Column(Integer, nullable=True)
    proceeds_usd = Column(Float, nullable=True)
    source_note = Column(String(200), nullable=True)
    fetched_at = Column(DateTime(timezone=True), server_default=sql_text("now()"), onupdate=sql_text("now()"))
