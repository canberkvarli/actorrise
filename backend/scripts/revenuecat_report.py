"""Ghost Light's money as RevenueCat sees it. Read only.

The webhook (app/api/webhooks.py) records what RevenueCat pushes; this asks
RevenueCat directly, so it is the check on the webhook and the answer to "did
someone just cancel?". Needs REVENUECAT_SECRET_KEY (a v2 secret key, read-only
permissions) in backend/.env.

    uv run python scripts/revenuecat_report.py          # overview + every subscription
    uv run python scripts/revenuecat_report.py --sandbox  # include sandbox (test) purchases

Prints no names or emails: RevenueCat only holds anonymous app user ids.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

PROJECT = "1ac791e4"


def _client() -> httpx.Client:
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    key = (os.getenv("REVENUECAT_SECRET_KEY") or "").strip().strip("\"'")
    if not key:
        sys.exit("REVENUECAT_SECRET_KEY is not set in backend/.env")
    return httpx.Client(
        base_url=f"https://api.revenuecat.com/v2/projects/{PROJECT}",
        headers={"Authorization": f"Bearer {key}"},
        timeout=30,
    )


def _pages(c: httpx.Client, path: str):
    url = f"{path}{'&' if '?' in path else '?'}limit=100"
    while url:
        r = c.get(url)
        r.raise_for_status()
        body = r.json()
        yield from body.get("items", [])
        nxt = body.get("next_page")
        # next_page is absolute; strip the base so the client's base_url applies
        url = nxt.split(f"/projects/{PROJECT}", 1)[1] if nxt else None


def _day(ms: int | None) -> str:
    if not ms:
        return "-"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sandbox", action="store_true", help="include sandbox purchases")
    args = ap.parse_args()

    c = _client()

    r = c.get("/metrics/overview")
    r.raise_for_status()
    print("RevenueCat overview")
    for m in r.json().get("metrics", []):
        unit = m.get("unit")
        val = f"${m['value']}" if unit == "$" else m["value"]
        print(f"  {m['name']}: {val}  ({m.get('description', '')})")

    products = {p["id"]: p.get("store_identifier") or p["id"] for p in _pages(c, "/products")}

    subs = []
    customers = 0
    for cust in _pages(c, "/customers"):
        customers += 1
        for s in _pages(c, f"/customers/{cust['id']}/subscriptions"):
            if s.get("environment") != "production" and not args.sandbox:
                continue
            subs.append(s)

    subs.sort(key=lambda s: s.get("starts_at") or 0, reverse=True)
    print(f"\nSubscriptions ({len(subs)}, across {customers} customers), newest first")
    print("  started     customer  country  product                          status     renews?          period ends  gross   proceeds")
    for s in subs:
        rev = s.get("total_revenue_in_usd") or {}
        print(
            f"  {_day(s.get('starts_at'))}  {s['customer_id'][:8]}  {s.get('country') or '-':7}  "
            f"{products.get(s.get('product_id'), s.get('product_id')):32} {s.get('status', ''):10} "
            f"{s.get('auto_renewal_status', ''):16} {_day(s.get('current_period_ends_at'))}   "
            f"${rev.get('gross', 0):<6} ${rev.get('proceeds', 0)}"
        )

    paying = [s for s in subs if s.get("status") == "active" and s.get("gives_access")]
    trialing = [s for s in subs if s.get("status") == "trialing"]
    not_renewing = [s for s in paying + trialing if s.get("auto_renewal_status") == "will_not_renew"]
    gross = sum((s.get("total_revenue_in_usd") or {}).get("gross", 0) for s in subs)
    proceeds = sum((s.get("total_revenue_in_usd") or {}).get("proceeds", 0) for s in subs)
    print(
        f"\nPaid and active: {len(paying)}  In trial: {len(trialing)}  "
        f"Turned off renewal: {len(not_renewing)}  "
        f"Lifetime gross ${gross:.2f}, proceeds ${proceeds:.2f}"
    )


if __name__ == "__main__":
    main()
