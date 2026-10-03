import os, sys, io
from PIL import Image, ImageChops, ImageStat
OUT = os.path.join(os.path.dirname(__file__), "cand")
SRC = {
 "skyline": "src/academy/academy-skyline.png",
 "library-desktop": "src/academy/hub/academy-library-desktop.png",
 "library-mobile": "src/academy/hub/academy-library-mobile.png",
 "book-frame": "src/assets/academy-book-frame.png",
 "spine": "src/assets/book-spine-flat-v2.png",
 "broadcast-book": "public/images/lol-hub/academy-broadcast-book.png",
 "commons-desktop": "src/academy/hub/academy-commons-desktop.png",
}
BG = (4, 7, 15)  # the page's navy ground
def flat(im):
    if im.mode == "RGBA":
        bg = Image.new("RGBA", im.size, BG + (255,)); bg.alpha_composite(im); return bg.convert("RGB")
    return im.convert("RGB")
def rms(a, b):
    st = ImageStat.Stat(ImageChops.difference(flat(a), flat(b)))
    return (sum(v**2 for v in st.rms) / 3) ** 0.5
def alpha_max(a, b):
    if a.mode != "RGBA": return 0
    return ImageChops.difference(a.getchannel("A"), b.getchannel("A")).getextrema()[1]
for name, p in SRC.items():
    src = Image.open(p); src.load()
    print(f"{name} {src.size} {src.mode} src {os.path.getsize(p)}")
    for q in (80, 85, 90, 95):
        buf = io.BytesIO(); src.save(buf, "WEBP", quality=q, method=6, exact=False); data = buf.getvalue()
        out = os.path.join(OUT, f"{name}-q{q}.webp"); open(out, "wb").write(data)
        dec = Image.open(io.BytesIO(data)); dec.load(); dec = dec.convert(src.mode)
        print(f"   q{q}: {len(data):>8} B  {100*len(data)/os.path.getsize(p):5.1f}%  rms {rms(src, dec):.2f}/255  alphaΔmax {alpha_max(src, dec)}")
