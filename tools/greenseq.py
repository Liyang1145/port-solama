# grassfix: lawn-green share of the lower half of each play3 shot + isolated spikes (flash = higher than both neighbours by > TH)
# usage: python3 tools/greenseq.py <dir> [TH=0.04]
import sys, os, glob
from PIL import Image
d = sys.argv[1]; TH = float(sys.argv[2]) if len(sys.argv) > 2 else 0.04
fs = sorted(glob.glob(os.path.join(d, 'f_*.jpg'))); G = []
for f in fs:
    im = Image.open(f).convert('RGB').resize((120, 68)); px = im.load(); g = 0
    for y in range(34, 68):
        for x in range(120):
            r, gg, b = px[x, y]
            if gg > r + 25 and gg > b + 15: g += 1
    G.append(g / (120 * 34))
sp = [(os.path.basename(fs[i])[2:6], round(G[i], 3)) for i in range(len(G)) if G[i] - max(G[max(0, i - 1)], G[min(len(G) - 1, i + 1)]) > TH or (0 < i < len(G) - 2 and min(G[i], G[i + 1]) - max(G[i - 1], G[i + 2]) > TH)]
print(d, 'shots', len(G), 'spikes', sp)
