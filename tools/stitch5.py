# perf_debug5: shots/pd5/S/<v>_<scene>.rgba -> /workspace/work/patches/perf5_compare_<scene>.jpg (old left | new right, labels) + crops
import json, sys, os
from PIL import Image, ImageDraw
S = os.path.join(os.path.dirname(__file__), '..', 'shots/pd5/S')
def load(v, sc):
    j = json.load(open(f'{S}/{v}_{sc}.json')); raw = open(f'{S}/{v}_{sc}.rgba', 'rb').read()
    im = Image.frombytes('RGBA', (j['w'], j['h']), raw).transpose(Image.FLIP_TOP_BOTTOM).convert('RGB'); return im, j
for sc in sys.argv[1:]:
    try: a, ja = load('old', sc); b, jb = load('new', sc)
    except Exception as e: print('skip', sc, e); continue
    w, h = a.size; out = Image.new('RGB', (w * 2 + 8, h + 28), (20, 20, 20)); out.paste(a, (0, 28)); out.paste(b, (w + 8, 28)); d = ImageDraw.Draw(out)
    d.text((6, 6), f"OLD ?oldsprobe&oldrefl...  calls {ja['calls']} tris {ja['tris']/1e6:.1f}M", fill=(255, 220, 120)); d.text((w + 14, 6), f"NEW (default)  calls {jb['calls']} tris {jb['tris']/1e6:.1f}M", fill=(140, 255, 160))
    p = f'/workspace/work/patches/perf5_compare_{sc}.jpg'; out.save(p, quality=88); print(p, out.size)
