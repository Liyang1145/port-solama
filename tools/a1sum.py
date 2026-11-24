import json,sys
a=json.load(open('shots/anim1/measure_new.json')); b=json.load(open('shots/anim1/measure_old.json'))
print('ramp', a.get('ramp'))
keys=['slideCmPerContact','slideCmPerS','contacts','penMeanCm','penMaxCm','hoverMeanCm','hoverMaxCm']
print('%-14s'%'scene', ' '.join('%17s'%k for k in keys))
for k in a:
  if isinstance(a[k],dict) and 'frames' in a[k]:
    print('%-14s'%k, ' '.join('%8s/%-8s'%(b[k][x] if k in b else '-',a[k][x]) for x in keys))
print('arig', a.get('arig'))
