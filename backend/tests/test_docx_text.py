import io
import zipfile

import pytest

from app.services.docx_text import docx_to_text, normalize_upload

_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _docx(body: str, head: str = "") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", f"{head}<w:document {_NS}><w:body>{body}</w:body></w:document>")
    return buf.getvalue()


def _p(*runs: str) -> str:
    return "<w:p>" + "".join(runs) + "</w:p>"


def test_paragraphs_become_lines():
    doc = _docx(
        _p("<w:r><w:t>MAYA</w:t></w:r>")
        + _p("<w:r><w:t>You're late.</w:t></w:r>")
        + _p("<w:r><w:t>DAN</w:t></w:r>")
        + _p("<w:r><w:t>I know</w:t></w:r><w:r><w:t>, I know.</w:t></w:r>")
    )
    assert docx_to_text(doc) == "MAYA\nYou're late.\nDAN\nI know, I know."


def test_tabs_and_breaks_are_kept():
    doc = _docx(_p("<w:r><w:t>INT.</w:t><w:tab/><w:t>KITCHEN</w:t><w:br/><w:t>NIGHT</w:t></w:r>"))
    assert docx_to_text(doc) == "INT.\tKITCHEN\nNIGHT"


def test_normalize_turns_docx_into_txt():
    content, ext = normalize_upload("Sides.DOCX", _docx(_p("<w:r><w:t>Hello</w:t></w:r>")))
    assert (content, ext) == (b"Hello", "txt")


def test_word_file_named_pdf_is_read_as_word():
    content, ext = normalize_upload("ALMOST A THERAPIST.pdf", _docx(_p("<w:r><w:t>Hello</w:t></w:r>")))
    assert (content, ext) == (b"Hello", "txt")


def test_normalize_passes_pdf_and_txt_through():
    assert normalize_upload("a.pdf", b"%PDF") == (b"%PDF", "pdf")
    assert normalize_upload("a.txt", b"hi") == (b"hi", "txt")


@pytest.mark.parametrize("name", ["a.doc", "a.pages", "noextension"])
def test_normalize_refuses_other_formats(name):
    with pytest.raises(ValueError):
        normalize_upload(name, b"x")


def test_not_a_zip_is_refused():
    with pytest.raises(ValueError):
        docx_to_text(b"definitely not a zip")


def test_doctype_is_refused():
    doc = _docx(_p("<w:r><w:t>&x;</w:t></w:r>"), head='<!DOCTYPE d [<!ENTITY x "boom">]>')
    with pytest.raises(ValueError):
        docx_to_text(doc)
