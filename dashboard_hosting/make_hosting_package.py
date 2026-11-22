"""Turns the single-file dashboard into a folder that can be put on a web host.

Usage (run from the dashboard_hosting folder):
  python make_hosting_package.py PATH/TO/dashboard.html

It only READS dashboard.html; nothing in your thesis folder is changed.
It (re)writes the "site" folder next to this script. Upload that folder to your host.
"""
import base64, json, re, sys, urllib.request, hashlib, shutil
from pathlib import Path
if len(sys.argv) < 2: sys.exit(__doc__)
SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent / "site"; A = OUT/"assets"
old_fonts = None
if (A/"fonts.css").exists():                     # keep fonts from a previous run (no internet needed)
    old_fonts = Path(__file__).resolve().parent / ".fonts_cache"
    shutil.rmtree(old_fonts, ignore_errors=True); shutil.copytree(A, old_fonts, ignore=shutil.ignore_patterns("figures", "*.js", "style.css"))
shutil.rmtree(OUT, ignore_errors=True)
for d in (A/"figures", A/"fonts"): d.mkdir(parents=True, exist_ok=True)
html = SRC.read_text(encoding="utf-8")

style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
s_data = html.index("<script>window.DATA = "); e_data = html.index(";</script>", s_data)
data = json.loads(html[s_data+len("<script>window.DATA = "):e_data].replace("<\\/", "</"))
s_pl = html.index("<script>", e_data); e_pl = html.index("</script>", s_pl+8)
plotly = html[s_pl+8:e_pl]
s_app = html.index("<script>", e_pl); e_app = html.rindex("</script>")
app = html[s_app+8:e_app]
body = html[html.index("</style>")+8:s_data]

# figures -> separate PNG files (smaller page, images load lazily)
for f in data.get("figs") or []:
    m = re.match(r"data:image/png;base64,(.*)", f["src"])
    (A/"figures"/f["file"]).write_bytes(base64.b64decode(m.group(1)))
    f["src"] = "assets/figures/" + f["file"]

# self-host Google Fonts (no third-party requests from visitors)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
furl = re.search(r'<link rel="stylesheet" href="(https://fonts.googleapis.com/[^"]+)"', html).group(1).replace("&amp;", "&")
def dl(m):
    u = m.group(1); name = hashlib.sha1(u.encode()).hexdigest()[:12] + ".woff2"
    (A/"fonts"/name).write_bytes(urllib.request.urlopen(u).read()); return f"url(fonts/{name})"
if old_fonts:
    shutil.copytree(old_fonts/"fonts", A/"fonts", dirs_exist_ok=True)
    css = (old_fonts/"fonts.css").read_text(encoding="utf-8"); shutil.rmtree(old_fonts)
else:
    css = urllib.request.urlopen(urllib.request.Request(furl, headers={"User-Agent": UA})).read().decode()
    css = re.sub(r"url\((https://fonts.gstatic.com/[^)]+)\)", dl, css)
(A/"fonts.css").write_text(css, encoding="utf-8")

body = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", body)
body = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com/[^"]+">', "", body)
title = re.search(r"<title>.*?</title>", html).group(0)

(A/"style.css").write_text(style, encoding="utf-8")
(A/"data.js").write_text("window.DATA = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
(A/"plotly.min.js").write_text(plotly, encoding="utf-8")
(A/"app.js").write_text(app, encoding="utf-8")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'")
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="description" content="Interactive dashboard of daily public transport ridership in Jakarta (data.go.id), from a thesis by Hansel Zorya Ashero.">
{title}
<link rel="stylesheet" href="assets/fonts.css">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
{body.strip()}
<script src="assets/data.js"></script>
<script src="assets/plotly.min.js"></script>
<script src="assets/app.js"></script>
</body>
</html>
'''
(OUT/"index.html").write_text(page, encoding="utf-8")
HEADERS = f"""# Security headers. Netlify and Cloudflare Pages read this file automatically.
/*
  Content-Security-Policy: {CSP}; frame-ancestors 'none'; upgrade-insecure-requests
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000

/assets/*
  Cache-Control: public, max-age=86400
"""
(OUT/"_headers").write_text(HEADERS, encoding="utf-8")
(OUT/"robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
print("Done. Upload this folder:", OUT, "|", len(data.get("figs") or []), "figures")
