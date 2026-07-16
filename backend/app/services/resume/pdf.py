"""Render an actor résumé to PDF.

Reuses a small Jinja template (mirrors the frontend ResumePreview) and WeasyPrint
for HTML->PDF. WeasyPrint is imported lazily inside the render function so a
missing system library can never break the whole resume router at import time.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html", "xml"]),
)

# Résumé section order (matches frontend CREDIT_CATEGORIES).
_CATEGORY_ORDER = [
    ("theatre", "Theatre"),
    ("film", "Film"),
    ("tv", "Television"),
    ("commercial", "Commercials"),
    ("voiceover", "Voiceover"),
    ("other", "New Media & Other"),
]


def render_resume_pdf(
    *,
    name: str,
    email: Optional[str],
    location: Optional[str],
    union: Optional[str],
    stats: List[str],
    credits: List[Dict[str, Any]],
    training: Optional[str],
    skills: List[str],
    watermark: bool,
) -> bytes:
    """Return the résumé as PDF bytes. Free tier passes watermark=True."""
    grouped = []
    for cid, heading in _CATEGORY_ORDER:
        rows = [c for c in credits if (c.get("category") or "other") == cid]
        if rows:
            grouped.append({"id": cid, "heading": heading, "rows": rows})

    contact = "  ·  ".join([p for p in (location, email) if p])

    html = _env.get_template("resume.html").render(
        name=name,
        contact=contact,
        union=union,
        stats=stats,
        grouped=grouped,
        training=training,
        skills=[s for s in skills if s],
        watermark=watermark,
    )

    # Lazy import — keeps the router importable even if system libs are absent.
    from weasyprint import HTML

    return HTML(string=html).write_pdf()
