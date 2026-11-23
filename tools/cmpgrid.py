# fix_pt2: old | new comparison sheet. usage: python3 tools/cmpgrid.py out.jpg "label|old.jpg|new.jpg" ...
import sys
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; rows = [a.split('|') for a in sys.argv[2:]]
W, H = 640, 360; LB = 34
import glob
c = glob.glob('/usr/share/fonts/**/DejaVuSans.ttf', recursive=True) + glob.glob('/workspace/work/fonts/Lora.ttf')
F = ImageFont.truetype(c[0], 20) if c else ImageFont.load_default()
sheet = Image.new('RGB', (W * 2 + 6, len(rows) * (H + LB) + 4), (18, 18, 20)); d = ImageDraw.Draw(sheet)
for i, (lab, a, b) in enumerate(rows):
    y = i * (H + LB)
    d.text((8, y + 5), lab + '   (left OLD | right NEW)', fill=(240, 240, 240), font=F)
    for j, p in enumerate((a, b)):
        try:
            im = Image.open(p).convert('RGB').resize((W, H))
        except Exception:
            im = Image.new('RGB', (W, H), (60, 0, 0)); ImageDraw.Draw(im).text((20, 20), 'missing ' + p[-40:], fill=(255, 255, 255), font=F)
        sheet.paste(im, (j * (W + 6), y + LB))
sheet.save(out, quality=86); print(out, sheet.size)
