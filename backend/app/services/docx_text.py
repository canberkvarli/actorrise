"""Word documents, read as plain text.

A .docx is a zip with the body in word/document.xml. Reading it with the
standard library, not python-docx: one paragraph per line is all the scene map
and the parser need, and it keeps a dependency off the Render image.

Uploads convert at the door (`normalize_upload`), so everything past the
endpoint sees a TXT and nothing downstream needs a third branch.
"""

from __future__ import annotations

import re

import io
import zipfile
from typing import Tuple
from xml.etree import ElementTree

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_MAX_XML_BYTES = 50 * 1024 * 1024

SUPPORTED_EXTS = ("pdf", "txt", "text", "docx")
UNSUPPORTED_MESSAGE = "That file could not be read as a script. PDF, Word, text and RTF files work; a photo of the pages does not yet."


def docx_to_text(file_content: bytes) -> str:
    """Every paragraph of the document body, one per line.

    Tabs and line breaks inside a paragraph are kept, because a screenplay
    written in Word leans on them for its layout. Tables are read cell by cell,
    in order, since some sides come laid out as a two-column table.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(file_content)) as z:
            # Sized before it is read: a 10MB upload can unzip to gigabytes.
            if z.getinfo("word/document.xml").file_size > _MAX_XML_BYTES:
                raise ValueError("That Word document is too large to read")
            xml = z.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError) as e:
        raise ValueError("That doesn't look like a Word document") from e

    # Word never writes a DOCTYPE, and refusing one leaves entity tricks
    # nothing to stand on.
    if b"<!DOCTYPE" in xml[:4096].upper():
        raise ValueError("That doesn't look like a Word document")
    root = ElementTree.fromstring(xml)
    lines = []
    for para in root.iter(f"{_W}p"):
        parts = []
        for node in para.iter():
            if node.tag == f"{_W}t":
                parts.append(node.text or "")
            elif node.tag == f"{_W}tab":
                parts.append("\t")
            elif node.tag in (f"{_W}br", f"{_W}cr"):
                parts.append("\n")
        lines.append("".join(parts))
    return "\n".join(lines)


def _as_text(data: bytes) -> str | None:
    """The bytes as text if they plausibly are text: UTF-8 or UTF-16 with a BOM,
    then Latin-1 when almost nothing in it is a control character."""
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        try:
            return data.decode("utf-16")
        except UnicodeDecodeError:
            return None
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    sample = text[:4000]
    if not sample.strip():
        return None
    control = sum(1 for ch in sample if ord(ch) < 32 and ch not in "\n\r\t\f")
    return text if control / max(1, len(sample)) < 0.02 else None


_RTF_WORD = re.compile(r"\\([a-z]+)(-?\d+)? ?")
_RTF_HEX = re.compile(r"\\'([0-9a-fA-F]{2})")


def _rtf_to_text(rtf: str) -> str:
    """Enough of RTF to get the words out: control words dropped, \\par and
    \\line kept as line breaks, hex escapes decoded, braces removed."""
    body = rtf
    # Drop the font, colour and stylesheet tables wholesale.
    body = re.sub(r"\{\\(fonttbl|colortbl|stylesheet|info|\*)[^{}]*(\{[^{}]*\})*[^{}]*\}", "", body)
    body = body.replace("\\par", "\n").replace("\\line", "\n")
    body = _RTF_HEX.sub(lambda m: bytes.fromhex(m.group(1)).decode("latin-1"), body)
    body = _RTF_WORD.sub("", body)
    body = body.replace("{", "").replace("}", "")
    return body


def normalize_upload(filename: str, file_content: bytes) -> Tuple[bytes, str]:
    """The upload's bytes and extension, with Word and RTF already turned into text.

    The bytes decide, not the name. Some writing apps export a Word file and
    call it .pdf (a real side, 2026-10-22, opened as "No /Root object! - Is this
    really a PDF?"), so anything that is a zip is read as Word whatever it says;
    anything that starts %PDF is a PDF whatever it says; and anything that reads
    as text is read as text, whatever it is called, including a file with no
    extension at all, which is how the phone's share sheet sometimes hands one
    over. RTF loses its formatting and keeps its words.

    Raises ValueError for anything that is none of those: an image, a .doc from
    1997, a .pages bundle.
    """
    file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    head = file_content[:8]
    if head.startswith(b"%PDF"):
        return file_content, "pdf"
    if head[:4] == b"PK\x03\x04" or file_ext == "docx":
        return docx_to_text(file_content).encode("utf-8"), "txt"
    if file_ext == "pdf":
        return file_content, "pdf"  # odd bytes under a PDF name: pypdf will say so
    text = _as_text(file_content)
    if text is not None:
        if file_ext == "rtf" or text.lstrip().startswith("{\\rtf"):
            text = _rtf_to_text(text)
        return text.encode("utf-8"), "txt"
    raise ValueError(UNSUPPORTED_MESSAGE)
