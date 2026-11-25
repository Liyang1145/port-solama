# anim3: before/after rows. usage: python3 tools/pair.py out.jpg "label|dirA/f_0003.jpg|dirB/f_0003.jpg" ...
import sys
from PIL import Image, ImageDraw
rows = [a.split('|') for a in sys.argv[2:]]; ims = [[Image.open(p).convert('RGB') for p in r[1:]] for r in rows]
w, h = ims[0][0].size; C = max(len(r) for r in ims); sh = Image.new('RGB', (C * w, len(rows) * (h + 16)), 'black'); d = ImageDraw.Draw(sh)
for i, (r, im) in enumerate(zip(rows, ims)):
    y = i * (h + 16); d.text((4, y + 2), r[0], fill='yellow')
    for j, x in enumerate(im): sh.paste(x.resize((w, h)), (j * w, y + 16))
sh.save(sys.argv[1], quality=85); print(sys.argv[1], sh.size)
