"""One place that answers: have I already written to this person, or to someone
else at their organization?

Canberk, 2026-10-14: "always track the emails we sent, to whom and what. We
don't want to send duplicates, or to two different people at the same
organization." Before this, the record was in four places that did not know
about each other: the outreach tracker (organisations), written.txt (the daily
loop's notes), each week's tracker-append.csv (drafted outreach), and Gmail.

    uv run python scripts/contact_log.py check <address> [--org "<name>"]
    uv run python scripts/contact_log.py add <address> --kind <kind> --subject "<s>" [--org "<name>"]
    uv run --with openpyxl python scripts/contact_log.py import

`check` prints every earlier touch it can find for the address, for its domain
(when the domain is an organisation's, not gmail.com and friends), and for the
organisation name, and exits 1 if there is any. `add` writes one row to the
`contact_log` table (2026-11-02: the record moved from a gitignored CSV into the
database, so a cloud session sees the same history as the laptop). `import`
copies the old files in once; it is safe to run again. The files are still read
when they exist, for anything written before the import.

Gmail is not read here (no credentials in the backend). The loops search
Gmail's sent folder for the address and the domain alongside this check.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
LOG = ROOT / "outputs" / "conversion" / "contacts.csv"
WRITTEN = ROOT / "outputs" / "conversion" / "written.txt"
TRACKER = ROOT / "ActorRise_Outreach_Tracker.xlsx"
APPENDS = ROOT / "outputs" / "marketing"
FIELDS = ["date", "address", "domain", "organization", "kind", "subject"]

# Domains that belong to a person, not an organisation: two people at
# gmail.com are not colleagues.
PERSONAL = {
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "hotmail.co.uk", "outlook.com",
    "live.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me",
    "privaterelay.appleid.com", "msn.com", "ymail.com", "comcast.net", "att.net", "gmx.com",
}


def domain_of(address: str) -> str:
    return address.strip().lower().rsplit("@", 1)[-1]


def norm_org(name: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def _db_rows() -> list[dict]:
    from sqlalchemy import text

    from app.core.database import engine
    with engine.connect().execution_options(postgresql_readonly=True) as conn:
        rows = conn.execute(text(
            "SELECT contacted_on, address, domain, organization, kind, subject, source "
            "FROM contact_log")).mappings().all()
    return [{"date": str(r["contacted_on"] or ""), "address": r["address"], "domain": r["domain"],
             "organization": r["organization"], "kind": r["kind"], "subject": r["subject"],
             "source": f"db:{r['source']}"} for r in rows]


def _file_rows() -> list[dict]:
    """The pre-database record: whatever of it exists on this machine."""
    out: list[dict] = []
    if LOG.exists():
        with LOG.open() as f:
            out += [dict(r, source="contacts.csv") for r in csv.DictReader(f)]
    if WRITTEN.exists():
        for line in WRITTEN.read_text().splitlines():
            addr, _, note = line.partition("#")
            addr = addr.strip().lower()
            if "@" in addr:
                out.append({"address": addr, "domain": domain_of(addr), "organization": "",
                            "kind": "note", "subject": note.strip(), "date": note.strip()[:10],
                            "source": "written.txt"})
    for f in sorted(APPENDS.glob("*/tracker-append.csv")):
        with f.open() as fh:
            for r in csv.DictReader(fh):
                addr = (r.get("Email") or "").strip().lower()
                out.append({"address": addr, "domain": domain_of(addr) if addr else "",
                            "organization": r.get("Organization", ""), "kind": "outreach",
                            "subject": r.get("Status", ""), "date": r.get("Date contacted", ""),
                            "source": str(f.relative_to(ROOT))})
    if TRACKER.exists():
        try:
            import openpyxl  # type: ignore
        except ImportError:
            print("note: openpyxl not installed, tracker not read (run with `uv run --with openpyxl`)",
                  file=sys.stderr)
        else:
            wb = openpyxl.load_workbook(TRACKER, read_only=True)
            for ws in wb.worksheets:
                rows = list(ws.iter_rows(values_only=True))
                head = [str(h or "") for h in rows[0]]
                for vals in rows[1:]:
                    r = dict(zip(head, vals))
                    addr = str(r.get("Email") or "").strip().lower()
                    org = str(r.get("Organization") or r.get("Name") or "")
                    out.append({"address": addr, "domain": domain_of(addr) if "@" in addr else "",
                                "organization": org, "kind": f"tracker:{ws.title}",
                                "subject": str(r.get("Status") or ""), "date": str(r.get("Date contacted") or "")[:10],
                                "source": "tracker"})
    return out


def _rows() -> list[dict]:
    """Every earlier touch, from every source, in one shape."""
    return _db_rows() + _file_rows()


def _date(v: str):
    m = re.match(r"(\d{4}-\d{2}-\d{2})", v or "")
    return dt.date.fromisoformat(m.group(1)) if m else None


def _insert(conn, r: dict) -> None:
    from sqlalchemy import text
    conn.execute(text(
        "INSERT INTO contact_log (contacted_on, address, domain, organization, kind, subject, source) "
        "VALUES (:d, :a, :dom, :o, :k, :s, :src)"),
        {"d": _date(r.get("date", "")), "a": (r.get("address") or "").strip().lower(),
         "dom": r.get("domain") or "", "o": r.get("organization") or "", "k": r.get("kind") or "",
         "s": r.get("subject") or "", "src": r.get("source") or "contact_log"})


def import_files() -> int:
    """Copy the file record into the table, skipping rows it already holds."""
    from app.core.database import engine
    have = {(r["address"], r["kind"], r["subject"], r["date"]) for r in _db_rows()}
    n = 0
    with engine.begin() as conn:
        for r in _file_rows():
            key = ((r.get("address") or "").strip().lower(), r.get("kind") or "", r.get("subject") or "",
                   str(_date(r.get("date", "")) or ""))
            if key in have or not (key[0] or r.get("organization")):
                continue
            have.add(key)
            _insert(conn, r)
            n += 1
    return n


def check(address: str, org: str | None) -> list[dict]:
    a = address.strip().lower()
    d = domain_of(a)
    o = norm_org(org)
    hits = []
    for r in _rows():
        why = None
        if r.get("address") == a:
            why = "same address"
        elif d not in PERSONAL and r.get("domain") == d:
            why = f"same organisation domain ({d})"
        elif o and len(o) > 3 and norm_org(r.get("organization")) == o:
            why = "same organisation name"
        if why:
            hits.append(dict(r, why=why))
    return hits


def add(address: str, kind: str, subject: str, org: str | None) -> None:
    from app.core.database import engine
    with engine.begin() as conn:
        _insert(conn, {"date": dt.date.today().isoformat(), "address": address,
                       "domain": domain_of(address), "organization": org or "", "kind": kind,
                       "subject": subject, "source": "contact_log"})


DUE_SQL = """
with first as (
  select lower(address) a, domain d, min(contacted_on) f, max(organization) org,
         max(subject) subj
  from contact_log
  where kind in ('educator', 'outreach') and address like '%@%'
  group by 1, 2)
select a, org, f, subj from first
where f between current_date - :max_days and current_date - :min_days
  and not exists (
    select 1 from contact_log l
    where (lower(l.address) = first.a or (l.domain = first.d and l.domain <> ''))
      and l.kind in ('chase', 'reply', 'checkin', 'partner'))
order by f
"""


def due(min_days: int = 7, max_days: int = 30) -> list[dict]:
    """Organisations written to first 7 or more days ago that have had no chase,
    reply or check-in logged since: the teachers owed their one chase. Gmail sent
    and the inbox still decide (a reply that was never logged, a bounce)."""
    from sqlalchemy import text
    from app.core.database import engine
    with engine.connect().execution_options(postgresql_readonly=True) as conn:
        rows = conn.execute(text(DUE_SQL), {"min_days": min_days, "max_days": max_days})
        return [{"address": r[0], "organization": r[1], "date": str(r[2]), "subject": r[3]} for r in rows]


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("address")
    c.add_argument("--org")
    a = sub.add_parser("add")
    a.add_argument("address")
    a.add_argument("--kind", required=True, help="note | educator | checkin | outreach | chase | reply")
    a.add_argument("--subject", required=True)
    a.add_argument("--org")
    du = sub.add_parser("due", help="organisations owed their one chase")
    du.add_argument("--min-days", type=int, default=7)
    du.add_argument("--max-days", type=int, default=30)
    sub.add_parser("import", help="copy contacts.csv, written.txt, tracker-append.csv and the tracker in")
    args = p.parse_args()
    if args.cmd == "import":
        print(f"imported {import_files()} rows")
        return
    if args.cmd == "due":
        rows = due(args.min_days, args.max_days)
        if not rows:
            print("nobody is due a chase")
        for r in rows:
            print(f"{r['date']}  {r['address']}  [{r['organization']}]  '{(r['subject'] or '')[:60]}'")
        return
    if args.cmd == "check":
        hits = check(args.address, args.org)
        if not hits:
            print(f"{args.address}: clear")
            return
        for h in hits:
            print(f"{args.address}: {h['why']} -> {h.get('address')} [{h.get('organization','')}] "
                  f"{h.get('kind')} {h.get('date','')} '{h.get('subject','')[:60]}' ({h['source']})")
        sys.exit(1)
    add(args.address, args.kind, args.subject, args.org)
    print(f"logged {args.address}")


if __name__ == "__main__":
    main()
