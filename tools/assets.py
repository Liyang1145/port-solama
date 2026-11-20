# Asset pipeline: raw/ (downloaded CC0 sources) -> dist/assets (web-ready)
import cv2, numpy as np, os, shutil, random, math
from PIL import Image, ImageFilter, ImageDraw
R='raw'; D='dist/assets'; os.makedirs(D,exist_ok=True)
K=6.0
skies={'day':'kloofendal_48d_partly_cloudy_puresky','golden':'evening_road_01_puresky','sunset':'belfast_sunset_puresky','dusk':'qwantani_dusk_2_puresky'}
for k,n in skies.items():
    a=cv2.imread(f'{R}/{n}_4k.hdr',cv2.IMREAD_ANYDEPTH|cv2.IMREAD_COLOR)[:,:,::-1].astype(np.float32)
    h,w,_=a.shape; rows=int(h*100/180)  # 90deg .. -10deg
    a=a[:rows]
    a=cv2.resize(a,(4096,int(4096*rows/w)),interpolation=cv2.INTER_AREA)
    # remove the HDRI sun disc (game draws its own sun at the simulated position)
    L=a.mean(2); sy,sx=np.unravel_index(L.argmax(),L.shape)
    yy,xx=np.mgrid[0:a.shape[0],0:a.shape[1]]; dx=np.minimum(abs(xx-sx),a.shape[1]-abs(xx-sx))
    r=np.sqrt(dx**2+(yy-sy)**2)*360/a.shape[1]   # degrees approx
    ring=L[(r>9)&(r<12)]; cap=np.percentile(ring,90) if ring.size else 4
    w=np.clip((r-3)/6,0,1)   # 0 inside 3deg, 1 beyond 9deg
    capL=cap*(1-w)+1e9*w
    sc=np.minimum(1,capL/np.maximum(L,1e-4)); a=a*sc[:,:,None]
    print(k,'sun at',sx/a.shape[1],'cap',cap)
    e=np.clip(np.log2(1+np.minimum(a,2**K-1))/K,0,1)
    Image.fromarray((e*255+0.5).astype(np.uint8)).save(f'{D}/sky_{k}.jpg',quality=93)
    print(k,a.shape)
TARGET={'sand':((0.80,0.74,0.62),0.75),'asphalt':((0.30,0.295,0.285),1.1),'sidewalk':((0.66,0.65,0.62),0.8),'plaster':((0.82,0.82,0.80),0.7),
        'grass':((0.27,0.38,0.13),0.9),'pavers':((0.72,0.58,0.52),0.9),'concrete':((0.70,0.69,0.66),0.8)}
def tex(name,out,size=1024,nsize=1024,armsize=512):
    im=Image.open(f'{R}/tex/{name}_diff_1k.jpg').convert('RGB').resize((size,size),Image.LANCZOS)
    if out in TARGET:
        a=np.asarray(im).astype(np.float32)/255; m=a.mean((0,1)); tgt,k=TARGET[out]
        lum=a.mean(2,keepdims=True); lm=lum.mean()
        a=np.array(tgt)[None,None,:]*(1+(lum/lm-1)*k)   # keep luminance detail, set colour/brightness
        im=Image.fromarray(np.clip(a*255,0,255).astype(np.uint8))
    im.save(f'{D}/{out}_d.jpg',quality=86)
    Image.open(f'{R}/tex/{name}_nor_gl_1k.jpg').convert('RGB').resize((nsize,nsize),Image.LANCZOS).save(f'{D}/{out}_n.jpg',quality=88)
    Image.open(f'{R}/tex/{name}_arm_1k.jpg').convert('RGB').resize((armsize,armsize),Image.LANCZOS).save(f'{D}/{out}_arm.jpg',quality=85)
tex('asphalt_02','asphalt'); tex('pavement_03','pavers'); tex('white_plaster_02','plaster',1024,512)
tex('concrete_floor_02','concrete',1024,512); tex('coast_sand_01','sand'); tex('leafy_grass','grass',1024,512)
tex('concrete_floor_02','sidewalk',1024,512)
# leaves: split individual leaves from Poly Haven island_tree_02 leaf sheet
ld=np.array(Image.open(f'{R}/tex/island_tree_02_leaves_diff_1k.jpg').convert('RGB'))
la=np.array(Image.open(f'{R}/tex/island_tree_02_leaves_alpha_1k.jpg').convert('L'))
n,lab,st,_=cv2.connectedComponentsWithStats((la>128).astype(np.uint8))
leaves=[]
for i in range(1,n):
    x,y,w,h,ar=st[i]
    if ar<4000: continue
    rgba=np.dstack([ld[y:y+h,x:x+w],la[y:y+h,x:x+w]])
    leaves.append(Image.fromarray(rgba,'RGBA'))
print('leaves',len(leaves))
random.seed(3)
def tint(im,f):
    a=np.array(im).astype(np.float32); a[:,:,:3]*=f; return Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGBA')
# palm frond: 256x1024, rachis along vertical centre, tip at top (v=1)
W,H=256,1024
fr=Image.new('RGBA',(W*2,H*2),(0,0,0,0))
for i in range(64):
    t=i/63; y=int((H*2-60)*(1-t))+30
    L=int((W*0.95)*(math.sin(min(1,t*1.15)*math.pi*0.92)*0.85+0.15))
    for side in(-1,1):
        lf=random.choice(leaves)
        lf=lf.resize((max(6,int(L*0.16)),L*2),Image.LANCZOS)  # narrow leaflet
        g=0.75+random.random()*0.35
        lf=tint(lf,np.array([0.80*g,1.0*g,0.62*g]))
        ang=side*(62+random.random()*12-t*18)
        r=lf.rotate(ang,expand=True,resample=Image.BICUBIC)
        cx=W+side*int(L*0.95*math.sin(math.radians(abs(ang))));
        fr.alpha_composite(r,(int(cx-r.width/2),int(y-r.height/2-L*0.4)))
d=ImageDraw.Draw(fr); d.line([(W,H*2-10),(W,20)],fill=(150,140,90,255),width=7)
fr=fr.resize((W,H),Image.LANCZOS)
# dilate colour into transparent area to avoid dark fringes
a=np.array(fr).astype(np.float32); al=a[:,:,3:4]/255
blur=cv2.GaussianBlur(a[:,:,:3]*al,(0,0),6)/np.maximum(cv2.GaussianBlur(al[:,:,0],(0,0),6)[:,:,None],1e-3)
a[:,:,:3]=np.where(al>0.5,a[:,:,:3],blur)
Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGBA').save(f'{D}/frond.png',optimize=True)
# leaf cluster card 512x512 (broadleaf canopy / shrubs)
S=1024; cl=Image.new('RGBA',(S,S),(0,0,0,0))
for i in range(260):
    r=math.sqrt(random.random())*0.46*S; th=random.random()*6.283
    x=S/2+r*math.cos(th); y=S/2+r*math.sin(th)
    lf=random.choice(leaves); sc=random.uniform(0.28,0.42)
    lf=lf.resize((max(4,int(lf.width*sc)),max(4,int(lf.height*sc))),Image.LANCZOS)
    g=random.uniform(0.55,1.05); lf=tint(lf,np.array([0.85*g,1.0*g,0.7*g]))
    lf=lf.rotate(random.uniform(0,360),expand=True,resample=Image.BICUBIC)
    cl.alpha_composite(lf,(int(x-lf.width/2),int(y-lf.height/2)))
cl=cl.resize((512,512),Image.LANCZOS)
a=np.array(cl).astype(np.float32); al=a[:,:,3:4]/255
blur=cv2.GaussianBlur(a[:,:,:3]*al,(0,0),5)/np.maximum(cv2.GaussianBlur(al[:,:,0],(0,0),5)[:,:,None],1e-3)
a[:,:,:3]=np.where(al>0.5,a[:,:,:3],blur)
Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGBA').save(f'{D}/leafcluster.png',optimize=True)
Image.open(f'{R}/tex/island_tree_02_branches_diff_1k.jpg').convert('RGB').resize((512,512)).save(f'{D}/bark_d.jpg',quality=85)
Image.open(f'{R}/waternormals.jpg').convert('RGB').save(f'{D}/waternormals.jpg',quality=90)
for f in ['Michelle.glb','Soldier.glb']: shutil.copy(f'{R}/models/{f}',f'{D}/{f}')
shutil.copy(f'{R}/Anton-Regular.ttf',f'{D}/Anton-Regular.ttf')
print("ok")
