# anim3: contact sheet of play3 shots. usage: python3 tools/sheet.py <dir> <from> <to> <out.jpg> [cols=4] [scale=0.75]
import sys, os
from PIL import Image, ImageDraw
d, a, b, o = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]; C = int(sys.argv[5]) if len(sys.argv) > 5 else 4; S = float(sys.argv[6]) if len(sys.argv) > 6 else 0.75
fs = [os.path.join(d, f'f_{i:04d}.jpg') for i in range(a, b + 1) if os.path.exists(os.path.join(d, f'f_{i:04d}.jpg'))]
im0 = Image.open(fs[0]); w, h = int(im0.width * S), int(im0.height * S); R = (len(fs) + C - 1) // C
sh = Image.new('RGB', (C * w, R * h), 'black'); dr = ImageDraw.Draw(sh)
for k, f in enumerate(fs):
    im = Image.open(f).resize((w, h)); x, y = (k % C) * w, (k // C) * h; sh.paste(im, (x, y)); dr.rectangle([x, y, x + 34, y + 12], fill='black'); dr.text((x + 2, y), os.path.basename(f)[2:6], fill='yellow')
sh.save(o, quality=82); print(o, sh.size)
