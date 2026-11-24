# anim2: pack the CC0 Quaternius Universal Animation Library clips we use into dist/assets/anim_ual.glb (skeleton nodes + clips, no mesh).
# Sources (CC0 1.0, see CREDITS.md): UAL1 Standard (glTF from github.com/J-Ponzo/gltf-universal-animation-library, a verbatim
# mirror of quaternius.itch.io/universal-animation-library) and UAL2 Standard (quaternius.itch.io/universal-animation-library-2,
# Unreal-Godot/UAL2_Standard.glb). Both share one rest skeleton (identical rest TRS); UAL1's Rigify DEF- names are mapped to UAL2's.
# Nodes are renamed to the cast's Mixamo-style bone names (unmapped helpers get a 'ual_' prefix); rotations are stored as
# normalized int16 (glTF core allows it), the pelvis translation as float. Runtime retargeting per cast proto: src/ualanim.js.
# usage: python3 tools/ualpack.py <ual1.gltf> <ual2.glb> <out.glb>
import json, struct, sys, base64, os
import numpy as np

def load(p):
    if p.endswith('.glb'):
        b = open(p, 'rb').read(); l = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + l]); o = 20 + l
        bl = struct.unpack('<I', b[o:o + 4])[0]; bins = [b[o + 8:o + 8 + bl]]
    else:
        g = json.load(open(p)); d = os.path.dirname(p); bins = [open(os.path.join(d, bf['uri']), 'rb').read() for bf in g['buffers']]
    return g, bins

CT = {5126: ('f', 4), 5122: ('h', 2), 5123: ('H', 2), 5120: ('b', 1), 5121: ('B', 1), 5125: ('I', 4)}
NC = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}
def acc(g, bins, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]; fmt, sz = CT[a['componentType']]; n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', sz * n)
    buf = bins[bv['buffer']]; arr = np.zeros((a['count'], n), np.float64)
    dt = np.dtype('<' + fmt)
    for k in range(a['count']): arr[k] = np.frombuffer(buf, dt, n, off + k * st)
    if a.get('normalized'): arr = arr / {'h': 32767., 'b': 127., 'H': 65535., 'B': 255.}[fmt]
    return arr

U1 = {'DEF-hips': 'pelvis', 'DEF-spine.001': 'spine_01', 'DEF-spine.002': 'spine_02', 'DEF-spine.003': 'spine_03', 'DEF-neck': 'neck_01', 'DEF-head': 'Head'}
for s, t in (('L', 'l'), ('R', 'r')):
    U1.update({f'DEF-shoulder.{s}': f'clavicle_{t}', f'DEF-upper_arm.{s}': f'upperarm_{t}', f'DEF-forearm.{s}': f'lowerarm_{t}', f'DEF-hand.{s}': f'hand_{t}',
               f'DEF-thigh.{s}': f'thigh_{t}', f'DEF-shin.{s}': f'calf_{t}', f'DEF-foot.{s}': f'foot_{t}', f'DEF-toe.{s}': f'ball_{t}'})
    for k in (1, 2, 3):
        U1[f'DEF-thumb.0{k}.{s}'] = f'thumb_0{k}_{t}'
        for f in ('index', 'middle', 'ring', 'pinky'): U1[f'DEF-f_{f}.0{k}.{s}'] = f'{f}_0{k}_{t}'
TG = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'Head': 'Head'}
for t, S in (('l', 'Left'), ('r', 'Right')):
    TG.update({f'clavicle_{t}': S + 'Shoulder', f'upperarm_{t}': S + 'Arm', f'lowerarm_{t}': S + 'ForeArm', f'hand_{t}': S + 'Hand',
               f'thigh_{t}': S + 'UpLeg', f'calf_{t}': S + 'Leg', f'foot_{t}': S + 'Foot', f'ball_{t}': S + 'ToeBase', f'ball_leaf_{t}': S + 'Toe_End'})
    for k in (1, 2, 3, 4):
        TG[f'thumb_0{k}_{t}' if k < 4 else f'thumb_04_leaf_{t}'] = f'{S}HandThumb{k}'
        for f in ('index', 'middle', 'ring', 'pinky'): TG[f'{f}_0{k}_{t}' if k < 4 else f'{f}_04_leaf_{t}'] = f'{S}Hand{f.capitalize()}{k}'

# clip key -> (source, clip name)
CLIPS = {'cidle': (1, 'Crouch_Idle_Loop'), 'cwalk': (1, 'Crouch_Fwd_Loop'), 'jab': (1, 'Punch_Jab'), 'cross': (1, 'Punch_Cross'), 'hook': (2, 'Melee_Hook'),
         'hitC': (1, 'Hit_Chest'), 'hitH': (1, 'Hit_Head'), 'knock': (2, 'Hit_Knockback'), 'jstart': (1, 'Jump_Start'), 'jland2': (1, 'Jump_Land'), 'climb': (2, 'ClimbUp_1m'), 'getup': (2, 'LayToIdle')}

def main(p1, p2, out):
    g1, b1 = load(p1); g2, b2 = load(p2)
    N2 = g2['nodes']; par = {}
    for i, n in enumerate(N2):
        for c in n.get('children', []): par[c] = i
    keep = [i for i, n in enumerate(N2) if n['name'] != 'Mannequin' and 'mesh' not in n]
    idx = {o: k for k, o in enumerate(keep)}
    nodes = []
    for o in keep:
        n = N2[o]; nm = TG.get(n['name'], 'ual_' + n['name']); d = {'name': nm}
        for k in ('translation', 'rotation', 'scale'):
            if k in n: d[k] = n[k]
        ch = [idx[c] for c in n.get('children', []) if c in idx]
        if ch: d['children'] = ch
        nodes.append(d)
    name2node = {N2[o]['name']: idx[o] for o in keep}
    root = [idx[o] for o in keep if o not in par]
    blob = bytearray(); views = []; accs = []
    def push(arr, ctype, typ, norm=False, minmax=False):
        nonlocal blob
        while len(blob) % 4: blob += b'\0'
        raw = arr.tobytes(); views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(raw)}); blob += raw
        a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if norm: a['normalized'] = True
        if minmax: a['min'] = [float(arr.min())]; a['max'] = [float(arr.max())]
        accs.append(a); return len(accs) - 1
    anims = []; stats = []
    for key, (src, cn) in CLIPS.items():
        g, bins = (g1, b1) if src == 1 else (g2, b2)
        A = next(a for a in g['animations'] if a['name'] == cn); Ng = g['nodes']
        ch, smp = [], []; tcache = {}; nrot = 0
        for c in A['channels']:
            nm = Ng[c['target']['node']]['name']; nm = U1.get(nm, nm) if src == 1 else nm
            path = c['target']['path']
            if nm not in name2node or path == 'scale': continue
            if path == 'translation' and nm != 'pelvis': continue
            s = A['samplers'][c['sampler']]; t = acc(g, bins, s['input'])[:, 0].astype(np.float32); v = acc(g, bins, s['output'])
            if path == 'rotation' and len(v) > 1 and np.abs(v - v[0]).max() < 1e-5: t = t[:1]; v = v[:1]
            if path == 'translation' and len(v) > 1 and np.abs(v - v[0]).max() < 1e-6: t = t[:1]; v = v[:1]
            tk = t.tobytes()
            if tk not in tcache: tcache[tk] = push(t, 5126, 'SCALAR', minmax=True)
            if path == 'rotation':
                v = v / np.linalg.norm(v, axis=1, keepdims=True); oi = push(np.round(v * 32767).astype('<i2'), 5122, 'VEC4', norm=True); nrot += 1
            else: oi = push(v.astype('<f4'), 5126, 'VEC3')
            smp.append({'input': tcache[tk], 'output': oi, 'interpolation': s.get('interpolation', 'LINEAR')})
            ch.append({'sampler': len(smp) - 1, 'target': {'node': name2node[nm], 'path': path}})
        anims.append({'name': key, 'channels': ch, 'samplers': smp}); stats.append((key, cn, nrot, float(max(accs[s['input']]['max'][0] for s in smp))))
    gl = {'asset': {'version': '2.0', 'generator': 'port-solana tools/ualpack.py', 'copyright': 'Quaternius Universal Animation Library 1+2 (Standard), CC0 1.0'},
          'scene': 0, 'scenes': [{'nodes': root}], 'nodes': nodes, 'animations': anims, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    while len(blob) % 4: blob += b'\0'
    js = json.dumps(gl, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    tot = 12 + 8 + len(js) + 8 + len(blob)
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, tot)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
    for s in stats: print(*s)
    print(out, tot, 'bytes')

if __name__ == '__main__': main(*sys.argv[1:4])
