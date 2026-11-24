# anim2: new/old frame-sequence montage (rows: scene x [old, new], up to MAXF evenly picked frames) -> argv[1]
import os, glob, sys
from PIL import Image, ImageDraw, ImageFont
D = os.environ.get('D') or os.path.join(os.path.dirname(__file__), '..', 'shots/anim2'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/work/patches/anim2_compare.jpg'
SC = (os.environ.get('SC') or 'crouch,melee,stagger,jump,carin,carout').split(','); CW, CH, MAXF = 200, 150, int(os.environ.get('MAXF', '8')); LW = 92
VS = (os.environ.get('VS') or 'old,new').split(',')
rows = []
for sc in SC:
    for v in VS:
        fs = sorted(glob.glob(f'{D}/{v}_{sc}_*.jpg'), key=lambda p: int(p.rsplit('_', 1)[1][:-4]))
        if len(fs) > MAXF: fs = [fs[round(i * (len(fs) - 1) / (MAXF - 1))] for i in range(MAXF)]
        if fs: rows.append((sc, v, fs))
W = LW + CW * MAXF; H = CH * len(rows); im = Image.new('RGB', (W, H), (20, 20, 20)); dr = ImageDraw.Draw(im)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except Exception: font = ImageFont.load_default()
for r, (sc, v, fs) in enumerate(rows):
    y = r * CH; dr.rectangle([0, y, LW - 1, y + CH - 1], fill=(40, 90, 40) if v.startswith('new') else (90, 40, 40)); dr.text((6, y + CH // 2 - 18), sc, fill='white', font=font); dr.text((6, y + CH // 2 + 2), v, fill='white', font=font)
    for i, f in enumerate(fs): im.paste(Image.open(f).convert('RGB').resize((CW, CH)), (LW + i * CW, y))
im.save(OUT, quality=80); print(OUT, im.size, os.path.getsize(OUT))
