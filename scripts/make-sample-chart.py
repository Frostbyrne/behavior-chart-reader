"""Draws a fictional STAR behavior chart (made-up student) for demos and
read-accuracy checks, and writes the answer key next to it.

    python3 scripts/make-sample-chart.py fixtures/

Writes sample-chart.html, sample-chart.png (flat scan), sample-chart.jpg
(rotated, skewed "phone photo") and sample-chart.answer.json.
"""
import json, subprocess, sys, pathlib, random

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures")
out.mkdir(parents=True, exist_ok=True)

goals = [
    "Listen and Follow Directions",
    "No shout outs, Calm voice",
    "Kept my hands to myself/ personal space",
    "Stay in your assigned space",
]
periods = ["Arrival & Morning Meeting", "ELA", "Specials", "Specials", "Acceleration", "Math",
           "Recess", "Lunch", "Foundations", "Small Group", "SEL/TDPE", "Science/SS"]
crossed = {3}
# ratings[goal][period]
ratings = [
    [2, 2, 1, None, 2, 2, 2, 2, 1, 1, 2, 2],
    [1, 2, 0, None, 2, 2, 2, 1, 2, 2, 2, 2],
    [2, 2, 2, None, 2, 2, 1, 2, 2, 2, 2, 2],
    [2, 2, 2, None, 2, 2, 2, 2, 2, 1, 2, 2],
]
cell_notes = {(0, 0): "raised hand", (1, 0): "called out x2", (1, 2): "yelling in gym",
              (0, 8): "off task", (0, 9): "needed reminders", (2, 6): "pushed in line"}
period_notes = {2: "adapted PE", 10: "took break"}
icons = ["☀️", "📖", "🎨", "🎨", "🚀", "➗", "🛝", "🍎", "🔤", "👥", "💛", "🔬"]

def faces(sel):
    out = []
    for v, color in ((0, "#e53935"), (1, "#fdd835"), (2, "#43a047")):
        mouth = {0: "frown", 1: "flat", 2: "smile"}[v]
        out.append(f'<div class="face {mouth}" style="background:{color}"></div>')
    nums = "".join(f'<span class="n{"" if sel != v else " sel"}">{v}</span>' for v in (0, 1, 2))
    return f'<div class="faces">{"".join(out)}</div><div class="nums">{nums}</div>'

rows = []
head = "".join(
    f'<th class="p{" x" if i in crossed else ""}"><div class="pn">{period_notes.get(i, "")}</div>'
    f'<div class="ic">{icons[i]}</div><div class="cap">{p}</div></th>' for i, p in enumerate(periods))
rows.append(f'<tr><th class="key">Key:<br>2 = Great Job!<br>1 = OK<br>0 = Difficult time</th>{head}</tr>')
for g, goal in enumerate(goals):
    cells = []
    for p in range(len(periods)):
        note = cell_notes.get((g, p), "")
        cells.append(f'<td class="{"x" if p in crossed else ""}"><div class="hn">{note}</div>{faces(ratings[g][p])}</td>')
    rows.append(f'<tr><th class="goal">{goal}</th>{"".join(cells)}</tr>')

def total(p):
    vals = [ratings[g][p] for g in range(len(goals)) if ratings[g][p] is not None]
    return f"{sum(vals)}/8" if p not in crossed else "/8"
rows.append('<tr><th class="goal">Total</th>' + "".join(
    f'<td class="tot"><span class="hw">{total(p).split("/")[0]}</span>/8</td>' for p in range(len(periods))) + "</tr>")

earned = sum(v for r in ratings for v in r if v is not None)
possible = sum(2 for r in ratings for v in r if v is not None)
html = f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Nanum+Pen+Script&display=block" rel="stylesheet">
<style>
body{{margin:0;padding:28px 34px;background:#fbfbf8;font-family:Arial,Helvetica,sans-serif;width:1700px}}
h1{{margin:0;font-size:26px;text-align:center}} h2{{margin:2px 0 10px;font-size:22px;text-align:center;font-weight:normal}}
.line{{font-size:19px;margin:8px 0 14px}} .hw{{font-family:Caveat,cursive;font-size:30px;color:#444}}
table{{border-collapse:collapse;width:100%}} th,td{{border:2px solid #222;text-align:center;vertical-align:middle;position:relative}}
th.key{{font-size:15px;text-align:left;font-style:italic;font-weight:normal;padding:6px;width:150px}}
th.p{{height:118px;width:112px;font-weight:normal}} .ic{{font-size:38px}} .cap{{font-size:12px;font-weight:bold}}
.pn{{position:absolute;top:-4px;left:4px;right:4px;font-family:Caveat;font-size:21px;color:#555;transform:rotate(-6deg)}}
th.goal{{font-size:15px;padding:6px;width:150px}} td{{height:112px;padding:4px}}
.faces{{display:flex;justify-content:center;gap:5px;margin-top:16px}}
.face{{width:23px;height:23px;border-radius:50%;border:1px solid #333;position:relative}}
.face:after{{content:"";position:absolute;left:6px;width:9px;height:4px;border:1.5px solid #222;}}
.smile:after{{top:9px;border-top:none;border-radius:0 0 8px 8px}} .frown:after{{top:13px;border-bottom:none;border-radius:8px 8px 0 0}}
.flat:after{{top:13px;height:0;border-left:none;border-right:none;border-bottom:none}}
.nums{{display:flex;justify-content:center;gap:19px;font-size:15px;margin-top:3px}}
.n{{position:relative;display:inline-block;width:10px}}
.sel:before{{content:"";position:absolute;left:-9px;top:-37px;width:28px;height:58px;border:2.2px solid #555;border-radius:50%;transform:rotate(9deg)}}
.hn{{position:absolute;top:2px;left:4px;right:4px;font-family:Caveat;font-size:20px;line-height:17px;color:#555;transform:rotate(-4deg)}}
td.x,th.x{{background:linear-gradient(transparent 47%,#666 48%,#666 50.5%,transparent 51.5%)}}
td.tot{{height:50px;font-size:20px}}
.foot{{margin-top:14px;font-size:22px;font-weight:bold}} .foot .hw{{font-weight:normal;font-size:32px}}
</style></head><body>
<h1>Westfield's STAR</h1><h2><u>S</u>tudent and <u>T</u>eachers <u>A</u>re <u>R</u>eflecting</h2>
<div class="line">Student Name: <u><b>Jordan Rivera</b></u> &nbsp; Teacher: Ms. Park &nbsp; Date: <span class="hw">10/21/26</span></div>
<table>{''.join(rows)}</table>
<div class="foot">Total: <span class="hw">&nbsp;{earned}&nbsp;</span> / <span class="hw">&nbsp;{possible}&nbsp;</span> &nbsp;&nbsp; → &nbsp; <span class="hw">{round(100*earned/possible)}</span> %</div>
<div class="foot">Notes: <span class="hw">Great afternoon! Took a break before SEL and came back ready.</span></div>
</body></html>"""
(out / "sample-chart.html").write_text(html)
subprocess.run(["google-chrome-stable", "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--virtual-time-budget=6000", "--window-size=1770,1160",
                f"--screenshot={out / 'sample-chart.png'}", (out / "sample-chart.html").resolve().as_uri()],
               check=True, capture_output=True)

from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
img = Image.open(out / "sample-chart.png").convert("RGB")
img = img.rotate(90, expand=True, fillcolor=(240, 240, 236))           # taken in portrait, like the real one
w, h = img.size
pad = Image.new("RGB", (w + 160, h + 160), (196, 192, 186))
pad.paste(img, (80, 80))
# a little perspective, light falloff and blur so it reads like a phone photo
coeffs = np.linalg.lstsq(
    np.array([[x, y, 1, 0, 0, 0, -X * x, -X * y] for (x, y), (X, Y) in
              zip([(0, 0), (pad.width, 0), (pad.width, pad.height), (0, pad.height)],
                  [(30, 10), (pad.width - 10, 40), (pad.width - 40, pad.height - 15), (5, pad.height - 30)])] +
             [[0, 0, 0, x, y, 1, -Y * x, -Y * y] for (x, y), (X, Y) in
              zip([(0, 0), (pad.width, 0), (pad.width, pad.height), (0, pad.height)],
                  [(30, 10), (pad.width - 10, 40), (pad.width - 40, pad.height - 15), (5, pad.height - 30)])]),
    np.array([30, pad.width - 10, pad.width - 40, 5, 10, 40, pad.height - 15, pad.height - 30], dtype=float),
    rcond=None)[0]
photo = pad.transform(pad.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(190, 186, 180))
arr = np.asarray(photo).astype(float)
yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
shade = 1 - 0.13 * ((xx / arr.shape[1]) * 0.6 + (yy / arr.shape[0]) * 0.4)
arr = np.clip(arr * shade[..., None] + np.random.default_rng(7).normal(0, 4, arr.shape), 0, 255)
photo = Image.fromarray(arr.astype("uint8")).filter(ImageFilter.GaussianBlur(0.7))
photo = ImageEnhance.Color(photo).enhance(0.9)
photo.thumbnail((1800, 2400))
photo.save(out / "sample-chart.jpg", quality=86)

answer = {
    "studentName": "Jordan Rivera", "teacher": "Ms. Park", "date": "2026-10-21",
    "goals": goals, "periods": periods, "crossedOut": sorted(crossed), "ratings": ratings,
    "earned": earned, "possible": possible,
}
(out / "sample-chart.answer.json").write_text(json.dumps(answer, indent=2))
print("wrote", out, earned, possible)
