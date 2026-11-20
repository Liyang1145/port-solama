# cap embedded image size in a GLB (re-encode webp), repack BIN chunk. usage: texcap.py in.glb out.glb maxdim
import json,struct,io,sys
from PIL import Image
src,dst,cap=sys.argv[1],sys.argv[2],int(sys.argv[3])
b=open(src,'rb').read();jl=struct.unpack('<I',b[12:16])[0];j=json.loads(b[20:20+jl]);bin0=20+jl+8;binlen=struct.unpack('<I',b[20+jl:24+jl])[0];BIN=b[bin0:bin0+binlen]
imgbv={im['bufferView']:im for im in j.get('images',[]) if 'bufferView' in im}
import re
SMALL=re.compile(r'Eye|Teeth|Tongue|Mouth|lash|brow|details|Palette',re.I)
imcap={}  # image index -> cap
def texsrc(ti):
    t=j['textures'][ti]; return t.get('extensions',{}).get('EXT_texture_webp',{}).get('source',t.get('source'))
for m in j.get('materials',[]):
    small=bool(SMALL.search(m.get('name','')))
    pb=m.get('pbrMetallicRoughness',{})
    for key,ref in list(pb.items())+[(k,v) for k,v in m.items()]:
        if not key.endswith('Texture') or not isinstance(ref,dict): continue
        c=cap//2 if (small or key in ('normalTexture','metallicRoughnessTexture','occlusionTexture')) else cap
        si=texsrc(ref['index'])
        if si is not None: imcap[si]=max(imcap.get(si,0),c)
bvcap={j['images'][i]['bufferView']:c for i,c in imcap.items() if 'bufferView' in j['images'][i]}
out=bytearray();changed=0
segs=[]
for i,bv in enumerate(j['bufferViews']):
    mo=bv.get('extensions',{}).get('EXT_meshopt_compression')
    if mo and mo.get('buffer',0)==0: segs.append((i,mo))
    elif bv.get('buffer',0)==0: segs.append((i,bv))
for i,bv in segs:
    d=BIN[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
    if i in imgbv:
        I=Image.open(io.BytesIO(d))
        cp=bvcap.get(i,cap)
        if max(I.size)>cp:
            s=cp/max(I.size);I=I.resize((max(1,round(I.size[0]*s)),max(1,round(I.size[1]*s))),Image.LANCZOS)
            o=io.BytesIO();I.save(o,'WEBP',quality=82,method=4);d=o.getvalue();imgbv[i]['mimeType']='image/webp';changed+=1
    while len(out)%4: out.append(0)
    bv['byteOffset']=len(out);bv['byteLength']=len(d);out+=d
while len(out)%4: out.append(0)
j['buffers'][0]['byteLength']=len(out)
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
tot=12+8+len(js)+8+len(out)
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,tot)+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out))
print(src.split('/')[-1],'resized',changed,len(b)//1024,'->',tot//1024,'KB')
