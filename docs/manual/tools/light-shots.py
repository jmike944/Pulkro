"""Screen-resolution copies of the screenshots for the light PDF (e-mail / WhatsApp): build/light/shots/*.jpg.
Desktop shots go to at most 1200 px wide (~170 dpi at full text width), phones to 520 px; JPEG quality 74."""
import glob, os, sys
from PIL import Image

root = os.path.join(os.path.dirname(__file__), "..")
out = os.path.join(root, "build", "light", "shots")
os.makedirs(out, exist_ok=True)
for f in glob.glob(os.path.join(root, "shots", "*.jpg")):
    dst = os.path.join(out, os.path.basename(f))
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(f):
        continue
    im = Image.open(f).convert("RGB")
    w, h = im.size
    limit = 520 if h > w * 1.6 else 1200
    if w > limit:
        im = im.resize((limit, round(h * limit / w)), Image.LANCZOS)
    im.save(dst, quality=74, optimize=True)
print("light shots →", os.path.relpath(out, os.getcwd()), file=sys.stderr)
