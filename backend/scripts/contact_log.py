"""One place that answers: have I already written to this person, or to someone
else at their organization?

Canberk, 2026-10-14: "always track the emails we sent, to whom and what. We
don't want to send duplicates, or to two different people at the same
organization." Before this, the record was in four places that did not know
about each other: the outreach tracker (organisations), written.txt (the daily
loop's notes), each week's tracker-append.csv (drafted outreach), and Gmail.

    uv run python scripts/contact_log.py check <address> [--org "<name>"]
    uv run python scripts/contact_log.py add <address> --kind <kind> --subject "<s>" [--org "<name>"]

`check` prints every earlier touch it can find for the address, for its domain
(when the domain is an organisation's, not gmail.com and friends), and for the
organisation name, and exits 1 if there is any. `add` appends one row to the
log. The log is outputs/conversion/contacts.csv: gitignored, because it names people.

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


def _rows() -> list[dict]:
    """Every earlier touch, from every source, in one shape."""
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
    LOG.parent.mkdir(parents=True, exist_ok=True)
    new = not LOG.exists()
    with LOG.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if new:
            w.writeheader()
        w.writerow({"date": dt.date.today().isoformat(), "address": address.strip().lower(),
                    "domain": domain_of(address), "organization": org or "", "kind": kind, "subject": subject})


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
    args = p.parse_args()
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
