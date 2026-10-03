# Final encodes: Pillow, WebP q90, method=6. Sources are never overwritten.
import os
from PIL import Image
SAME = [
 ("src/academy/academy-skyline.png", "src/academy/academy-skyline.webp"),
 ("src/academy/hub/academy-library-desktop.png", "src/academy/hub/academy-library-desktop.webp"),
 ("src/academy/hub/academy-library-mobile.png", "src/academy/hub/academy-library-mobile.webp"),
 ("src/assets/academy-book-frame.png", "src/assets/academy-book-frame.webp"),
 ("src/assets/book-spine-flat-v2.png", "src/assets/book-spine-flat-v2.webp"),
]
RESIZE = [  # (src, dst, width) — premultiplied resample so alpha edges carry no fringe
 ("public/mascot/mogzy-mascot-base-v1.png", "public/mascot/mogzy-mascot-base-v1-512.webp", 512),
 ("public/mascot/mogzy-holding-book-transparent.png", "public/mascot/mogzy-holding-book-transparent-192.webp", 192),
]
for s, d in SAME:
    im = Image.open(s); im.load()
    im.save(d, "WEBP", quality=90, method=6)
    print(d, im.size, os.path.getsize(s), "->", os.path.getsize(d))
for s, d, w in RESIZE:
    im = Image.open(s).convert("RGBA"); h = round(im.height * w / im.width)
    out = im.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    out.save(d, "WEBP", quality=90, method=6)
    print(d, (w, h), os.path.getsize(s), "->", os.path.getsize(d))
