"""Word documents, read as plain text.

A .docx is a zip with the body in word/document.xml. Reading it with the
standard library, not python-docx: one paragraph per line is all the scene map
and the parser need, and it keeps a dependency off the Render image.

Uploads convert at the door (`normalize_upload`), so everything past the
endpoint sees a TXT and nothing downstream needs a third branch.
"""

from __future__ import annotations

import io
import zipfile
from typing import Tuple
from xml.etree import ElementTree

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_MAX_XML_BYTES = 50 * 1024 * 1024

SUPPORTED_EXTS = ("pdf", "txt", "text", "docx")
UNSUPPORTED_MESSAGE = "Only PDF, Word (.docx) and TXT files are supported"


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


def normalize_upload(filename: str, file_content: bytes) -> Tuple[bytes, str]:
    """The upload's bytes and extension, with a .docx already turned into text.

    The bytes decide, not the name. Some writing apps export a Word file and
    call it .pdf (a real side, 2026-10-22, opened as "No /Root object! - Is this
    really a PDF?"), so anything that is a zip is read as Word whatever it says.

    Raises ValueError for anything that is not a script format we read.
    """
    file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if file_ext not in SUPPORTED_EXTS:
        raise ValueError(UNSUPPORTED_MESSAGE)
    if file_ext == "docx" or file_content[:4] == b"PK\x03\x04":
        return docx_to_text(file_content).encode("utf-8"), "txt"
    return file_content, file_ext
