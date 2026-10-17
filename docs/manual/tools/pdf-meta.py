"""Sets the PDF's document properties (Chromium only writes the title) and its bookmarks.
Usage: pdf-meta.py <file.pdf> [outline.json] [meta.json]
  outline.json: [{title, page, children: [{title, page}]}], pages 1-based · meta.json: {title, subject, keywords}"""
import json
import sys
from pypdf import PdfReader, PdfWriter

path = sys.argv[1]
meta = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else {}
writer = PdfWriter(clone_from=PdfReader(path))
writer.add_metadata({
    "/Title": meta.get("title", "Pulkro Cuadrillas · Manual de usuario"),
    "/Author": "Pulkro Compañía de Servicios",
    "/Subject": meta.get("subject", ""),
    "/Keywords": meta.get("keywords", ""),
})
if len(sys.argv) > 2:
    for ch in json.load(open(sys.argv[2], encoding="utf-8")):
        if not ch["page"]:
            continue
        parent = writer.add_outline_item(ch["title"], ch["page"] - 1)
        for sec in ch.get("children", []):
            if sec["page"]:
                writer.add_outline_item(sec["title"], sec["page"] - 1, parent=parent)
    writer.page_mode = "/UseOutlines"
with open(path, "wb") as f:
    writer.write(f)
