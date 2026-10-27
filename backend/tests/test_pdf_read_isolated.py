"""The careful PDF read runs in a child process and falls back to pypdf.

Run in a clean interpreter, the way the server runs it: under pytest the child
would inherit a sys.path that shadows the standard library.
"""

import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

SCRIPT = textwrap.dedent(
    """
    import io, os
    os.environ.pop("PDF_READ_INLINE", None)
    from pypdf import PdfWriter
    from app.services import script_parser as sp

    def main():
        w = PdfWriter(); w.add_blank_page(width=200, height=200)
        buf = io.BytesIO(); w.write(buf); pdf = buf.getvalue()
        assert sp.extract_pdf_text(pdf) == sp._extract_pdf_text_here(pdf)
        sp._PDF_READ_SECONDS = 0.01
        assert sp.extract_pdf_text(pdf) == ""  # out of time: read by pypdf
        print("ok")

    if __name__ == "__main__":
        main()
    """
)


def test_child_read_matches_inline_and_falls_back(tmp_path):
    script = tmp_path / "check.py"
    script.write_text(SCRIPT)
    env = {"PATH": "/usr/bin:/bin", "PYTHONPATH": str(BACKEND)}
    out = subprocess.run(
        [sys.executable, str(script)], cwd=BACKEND, env=env,
        capture_output=True, text=True, timeout=120,
    )
    assert out.stdout.strip().endswith("ok"), out.stderr[-2000:]
