"""Sets the PDF's document properties (Chromium only writes the title) and its bookmarks.
Usage: pdf-meta.py <file.pdf> [outline.json]  (outline.json: [{title, page, children: [{title, page}]}], pages 1-based)"""
import json
import sys
from pypdf import PdfReader, PdfWriter

path = sys.argv[1]
writer = PdfWriter(clone_from=PdfReader(path))
writer.add_metadata({
    "/Title": "Pulkro Cuadrillas · Manual de usuario",
    "/Author": "Pulkro Compañía de Servicios",
    "/Subject": "Control operativo y postventa de cuadrillas de limpieza: guía de uso para Supervisor, Administración y Dirección",
    "/Keywords": "Pulkro, cuadrillas, órdenes, jornadas, evidencias, reportes, postventa, manual",
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
