"""App Store Connect, read into app_store_daily for the Ghost Light app.

Two Apple APIs, because no single one has everything:

  * Analytics Reports API: impressions, product page views, first-time
    downloads, redownloads. Asynchronous by design. You ask once for an
    ONGOING report request; Apple then publishes a daily instance of each
    report about a day in arrears, as gzip CSV segments. The request id is
    kept in app_settings so it is made exactly once.
  * Sales and Trends report: in-app purchase units and developer proceeds
    for one day, as a gzip TSV. Synchronous, available the next morning.

Both authenticate with an App Store Connect API key (ES256 JWT, 20 minutes).
Env on Render:

  ASC_ISSUER_ID     Users and Access → Integrations → App Store Connect API
  ASC_KEY_ID        the key's ID
  ASC_PRIVATE_KEY   the .p8 contents, newlines as \\n or real
  ASC_VENDOR_NUMBER Payments and Financial Reports, top right (sales only)
  ASC_APP_ID        defaults to 6804278673

Missing env is a reported state, not an error: configured() says which are
absent and the admin page prints that instead of a red bar.

Apple's report schemas shift. Parsing is by column NAME, case-insensitive,
and a column that is not there is a zero plus a note in source_note, so a
renamed header shows up as "impressions column not found" rather than as a
silent zero that looks like nobody saw the listing.
"""

from __future__ import annotations

import csv
import gzip
import io
import logging
import os
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional

import httpx
from jose import jwt
from sqlalchemy.orm import Session

from app.models.app_store_daily import AppStoreDaily
from app.services import app_settings

logger = logging.getLogger(__name__)

API = "https://api.appstoreconnect.apple.com"
DEFAULT_APP_ID = "6804278673"
REPORT_REQUEST_KEY = "asc_analytics_report_request_id"

ENGAGEMENT_REPORT = "App Store Discovery and Engagement"
DOWNLOADS_REPORT = "App Store Downloads"


@dataclass(frozen=True)
class Config:
    issuer_id: str
    key_id: str
    private_key: str
    vendor_number: Optional[str]
    app_id: str


def configured() -> tuple[Optional[Config], list[str]]:
    """The config, or the list of env names still missing."""
    issuer = os.getenv("ASC_ISSUER_ID", "").strip()
    key_id = os.getenv("ASC_KEY_ID", "").strip()
    pem = os.getenv("ASC_PRIVATE_KEY", "").strip().replace("\\n", "\n")
    vendor = os.getenv("ASC_VENDOR_NUMBER", "").strip() or None
    app_id = os.getenv("ASC_APP_ID", "").strip() or DEFAULT_APP_ID
    missing = [n for n, v in (("ASC_ISSUER_ID", issuer), ("ASC_KEY_ID", key_id), ("ASC_PRIVATE_KEY", pem)) if not v]
    if missing:
        return None, missing
    return Config(issuer, key_id, pem, vendor, app_id), []


def _token(cfg: Config) -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": cfg.issuer_id, "iat": now, "exp": now + 19 * 60, "aud": "appstoreconnect-v1"},
        cfg.private_key,
        algorithm="ES256",
        headers={"kid": cfg.key_id, "typ": "JWT"},
    )


def _client(cfg: Config) -> httpx.Client:
    return httpx.Client(base_url=API, headers={"Authorization": f"Bearer {_token(cfg)}"}, timeout=60)


# ----------------------------------------------------------------------------
# Analytics Reports API
# ----------------------------------------------------------------------------

def ensure_report_request(db: Session, cfg: Config, client: httpx.Client) -> str:
    """The one ONGOING analytics request for the app. Created on first use."""
    existing = db.query(app_settings.AppSetting).filter(app_settings.AppSetting.key == REPORT_REQUEST_KEY).first()
    if existing and existing.value:
        return existing.value
    # Apple keeps at most one ONGOING request per app; reuse if one exists.
    r = client.get(f"/v1/apps/{cfg.app_id}/analyticsReportRequests", params={"filter[accessType]": "ONGOING"})
    r.raise_for_status()
    data = r.json().get("data") or []
    if data:
        rid = data[0]["id"]
    else:
        r = client.post(
            "/v1/analyticsReportRequests",
            json={
                "data": {
                    "type": "analyticsReportRequests",
                    "attributes": {"accessType": "ONGOING"},
                    "relationships": {"app": {"data": {"type": "apps", "id": cfg.app_id}}},
                }
            },
        )
        r.raise_for_status()
        rid = r.json()["data"]["id"]
    app_settings.set_value(db, REPORT_REQUEST_KEY, rid)
    return rid


def _report_id(client: httpx.Client, request_id: str, name: str) -> Optional[str]:
    r = client.get(f"/v1/analyticsReportRequests/{request_id}/reports", params={"filter[name]": name, "limit": 200})
    r.raise_for_status()
    for item in r.json().get("data") or []:
        if (item.get("attributes") or {}).get("name") == name:
            return item["id"]
    return None


def _daily_instances(client: httpx.Client, report_id: str, limit: int) -> list[dict[str, Any]]:
    r = client.get(
        f"/v1/analyticsReports/{report_id}/instances",
        params={"filter[granularity]": "DAILY", "limit": limit, "sort": "-processingDate"},
    )
    r.raise_for_status()
    return r.json().get("data") or []


def _instance_rows(client: httpx.Client, instance_id: str) -> Iterable[dict[str, str]]:
    r = client.get(f"/v1/analyticsReportInstances/{instance_id}/segments")
    r.raise_for_status()
    for seg in r.json().get("data") or []:
        url = (seg.get("attributes") or {}).get("url")
        if not url:
            continue
        raw = httpx.get(url, timeout=120).content
        try:
            text = gzip.decompress(raw).decode("utf-8")
        except OSError:
            text = raw.decode("utf-8")
        for row in csv.DictReader(io.StringIO(text), delimiter="\t" if "\t" in text.split("\n", 1)[0] else ","):
            yield {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}


def _num(v: str) -> int:
    try:
        return int(float(v.replace(",", "")))
    except (ValueError, AttributeError):
        return 0


def _sum_events(rows: Iterable[dict[str, str]], wanted: dict[str, tuple[str, ...]]) -> tuple[dict[str, int], list[str]]:
    """Sum the Counts column by event name.

    Apple's engagement/download reports are long: one row per (date, event,
    source, device...). `wanted` maps our field to the event substrings that
    count toward it. Returns sums and the notes for anything not found.
    """
    sums = {k: 0 for k in wanted}
    seen_event_col = False
    for row in rows:
        event = row.get("event") or row.get("event type") or ""
        counts = row.get("counts") or row.get("count") or row.get("units") or "0"
        if event:
            seen_event_col = True
        ev = event.lower()
        for field, needles in wanted.items():
            if any(n in ev for n in needles):
                sums[field] += _num(counts)
    notes = [] if seen_event_col else ["no event column in report"]
    return sums, notes


def sync_analytics(db: Session, cfg: Config, days: int = 30) -> dict[str, Any]:
    """Pull the last `days` daily instances of the two reports into app_store_daily."""
    out: dict[str, Any] = {"engagement_days": 0, "download_days": 0, "notes": []}
    with _client(cfg) as client:
        request_id = ensure_report_request(db, cfg, client)
        for name, wanted, key in (
            (ENGAGEMENT_REPORT, {"impressions": ("impression",), "page_views": ("page view", "product page")}, "engagement_days"),
            (DOWNLOADS_REPORT, {"downloads": ("first-time", "first time"), "redownloads": ("redownload",)}, "download_days"),
        ):
            rid = _report_id(client, request_id, name)
            if not rid:
                out["notes"].append(f"{name}: not available yet (Apple publishes about a day after the request)")
                continue
            for inst in _daily_instances(client, rid, days):
                attrs = inst.get("attributes") or {}
                day_str = attrs.get("processingDate")
                if not day_str:
                    continue
                day = date.fromisoformat(day_str[:10])
                sums, notes = _sum_events(_instance_rows(client, inst["id"]), wanted)
                row = db.get(AppStoreDaily, day) or AppStoreDaily(day=day)
                for field, value in sums.items():
                    setattr(row, field, value)
                if notes:
                    row.source_note = "; ".join(notes)[:200]
                db.add(row)
                out[key] += 1
            db.commit()
    return out


# ----------------------------------------------------------------------------
# Sales and Trends (proceeds + IAP units)
# ----------------------------------------------------------------------------

def sync_sales(db: Session, cfg: Config, days: int = 14) -> dict[str, Any]:
    out: dict[str, Any] = {"sales_days": 0, "notes": []}
    if not cfg.vendor_number:
        out["notes"].append("ASC_VENDOR_NUMBER not set: proceeds and IAP units skipped")
        return out
    with _client(cfg) as client:
        for i in range(1, days + 1):
            day = date.today() - timedelta(days=i)
            r = client.get(
                "/v1/salesReports",
                params={
                    "filter[frequency]": "DAILY",
                    "filter[reportType]": "SALES",
                    "filter[reportSubType]": "SUMMARY",
                    "filter[vendorNumber]": cfg.vendor_number,
                    "filter[reportDate]": day.isoformat(),
                },
                headers={"Accept": "application/a-gzip"},
            )
            if r.status_code == 404:
                continue  # no sales that day, or not published yet
            r.raise_for_status()
            text = gzip.decompress(r.content).decode("utf-8")
            iap_units = 0
            proceeds = 0.0
            for row in csv.DictReader(io.StringIO(text), delimiter="\t"):
                row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
                ptype = row.get("product type identifier", "")
                units = _num(row.get("units", "0"))
                try:
                    dev = float(row.get("developer proceeds", "0") or 0)
                except ValueError:
                    dev = 0.0
                proceeds += dev * units
                if ptype.startswith("IA"):
                    iap_units += units
            drow = db.get(AppStoreDaily, day) or AppStoreDaily(day=day)
            drow.iap_units = iap_units
            drow.proceeds_usd = round(proceeds, 2)
            db.add(drow)
            out["sales_days"] += 1
        db.commit()
    return out


def sync_recent(db: Session) -> dict[str, Any]:
    """Everything, tolerating each half failing on its own. Never raises."""
    cfg, missing = configured()
    if not cfg:
        return {"configured": False, "missing": missing}
    result: dict[str, Any] = {"configured": True, "notes": []}
    for fn in (sync_analytics, sync_sales):
        try:
            part = fn(db, cfg)
            result["notes"].extend(part.pop("notes", []))
            result.update(part)
        except httpx.HTTPStatusError as e:
            body = e.response.text[:300]
            logger.warning("App Store Connect %s failed: %s %s", fn.__name__, e.response.status_code, body)
            result["notes"].append(f"{fn.__name__}: HTTP {e.response.status_code}: {body}")
        except Exception as e:  # noqa: BLE001
            logger.warning("App Store Connect %s failed: %s", fn.__name__, e)
            result["notes"].append(f"{fn.__name__}: {e}")
    result["synced_at"] = datetime.now(timezone.utc).isoformat()
    return result
