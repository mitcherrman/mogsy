# PPQ2-E contact sheets from the route captures.  python sheet.py  (cwd = this dir)
from PIL import Image, ImageDraw, ImageFont
import os

def font(size):
    for f in ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

def sheet(out, rows, cols, scale, src="route"):
    """rows: [(label, [file stems...])]; one image per cell, scaled."""
    f = font(22)
    cells = []
    for label, stems in rows:
        ims = []
        for s in stems:
            p = os.path.join(src, s + "-view.jpg")
            if not os.path.exists(p):
                p = os.path.join("main-legacy", s + "-view.jpg")
            im = Image.open(p) if os.path.exists(p) else Image.new("RGB", (390, 844), "#333")
            ims.append((s, im.resize((int(im.width * scale), int(im.height * scale)))))
        cells.append((label, ims))
    w = max(sum(im.width + 12 for _, im in ims) for _, ims in cells) + 12
    h = sum(max(im.height for _, im in ims) + 64 for _, ims in cells) + 12
    page = Image.new("RGB", (w, h), "#f4f1ea")
    d = ImageDraw.Draw(page)
    y = 12
    for label, ims in cells:
        d.text((12, y), label, fill="#222", font=f)
        x, y2 = 12, y + 30
        for s, im in ims:
            page.paste(im, (x, y2))
            d.text((x, y2 + im.height + 2), s, fill="#555", font=font(14))
            x += im.width + 12
        y = y2 + max(im.height for _, im in ims) + 34
    page.save(out, quality=85)
    print(out, page.size)

sheet("sheet-390.jpg", [
    ("390x844 - production route, live API", ["pre-390x844", "selected-390x844", "reveal-correct-390x844", "reveal-incorrect-4way-390x844", "source-390x844", "completed-390x844"]),
    ("390x844 - evidence variants (synthetic response rewrites)", ["reveal-evidence_partial-incorrect-4way-390x844", "reveal-evidence_absent-incorrect-4way-390x844", "reveal-long_explanation-incorrect-4way-390x844", "main-legacy-pre-390x844", "main-legacy-reveal-incorrect-4way-390x844", "main-legacy-completed-390x844"]),
], 6, 0.6)
sheet("sheet-1024.jpg", [
    ("1024x768 - production route", ["pre-1024x768", "selected-1024x768", "reveal-incorrect-4way-1024x768"]),
    ("1024x768", ["source-1024x768", "completed-1024x768", "reveal-evidence_partial-correct-4way-1024x768"]),
    ("1024x768 - variants / old page on main", ["reveal-evidence_absent-incorrect-4way-1024x768", "reveal-long_explanation-incorrect-4way-1024x768", "main-legacy-reveal-incorrect-4way-1024x768"]),
], 3, 0.5)
sheet("sheet-1440.jpg", [
    ("1440x900 - production route", ["pre-1440x900", "selected-1440x900", "reveal-incorrect-4way-1440x900"]),
    ("1440x900", ["source-1440x900", "completed-1440x900", "reveal-evidence_partial-incorrect-4way-1440x900"]),
    ("1440x900 - variants / old page on main", ["reveal-evidence_absent-incorrect-4way-1440x900", "reveal-long_explanation-incorrect-4way-1440x900", "main-legacy-reveal-incorrect-4way-1440x900"]),
], 3, 0.42)
