# anim1: new/old frame-sequence montage -> /workspace/work/patches/anim1_compare.jpg (rows: scene x [old, new], columns: frames)
import os, glob, sys
from PIL import Image, ImageDraw, ImageFont
D = os.path.join(os.path.dirname(__file__), '..', 'shots/anim1'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/work/patches/anim1_compare.jpg'
SC = (os.environ.get('SC') or 'start,stop,turn,circle,kerb,sprint,idle').split(','); CW, CH, MAXF = 240, 150, int(os.environ.get('MAXF', '6')); LW = 92
rows = []
for sc in SC:
    for v in ('old', 'new'):
        fs = sorted(glob.glob(f'{D}/{v}_{sc}_*.jpg'), key=lambda p: int(p.rsplit('_', 1)[1][:-4]))
        if fs: rows.append((sc, v, fs[:MAXF]))
W = LW + CW * MAXF; H = CH * len(rows); im = Image.new('RGB', (W, H), (20, 20, 20)); dr = ImageDraw.Draw(im)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except Exception: font = ImageFont.load_default()
for r, (sc, v, fs) in enumerate(rows):
    y = r * CH; dr.rectangle([0, y, LW - 1, y + CH - 1], fill=(40, 90, 40) if v == 'new' else (90, 40, 40)); dr.text((6, y + CH // 2 - 18), sc, fill='white', font=font); dr.text((6, y + CH // 2 + 2), v, fill='white', font=font)
    for i, f in enumerate(fs): im.paste(Image.open(f).convert('RGB').resize((CW, CH)), (LW + i * CW, y))
im.save(OUT, quality=82); print(OUT, im.size, os.path.getsize(OUT))
