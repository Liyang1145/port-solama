// anim2 test page: retargeted UAL clips on cast protos, grid of frames (rows = clips, cols = time samples). Not shipped.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { setUAL, ualClip } from '../../src/ualanim.js';
const Q = new URLSearchParams(location.search);
const PROTOS = (Q.get('p') || 'hero,f1,m4').split(','); const CLIPS = (Q.get('c') || 'cidle,cwalk,jab,cross,hook').split(','); const NC = +(Q.get('n') || 6);
const CW = 150, CH = 200;
(async () => {
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const ual = await gl.loadAsync('assets/anim_ual.glb'); setUAL(ual);
  const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); const W = CW * NC, H = CH * CLIPS.length * PROTOS.length;
  R.setSize(W, H); R.setScissorTest(true); document.body.appendChild(R.domElement); R.setClearColor(0xdde3ea);
  const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(2, 4, 3); scene.add(sun);
  const grid = new THREE.GridHelper(4, 8, 0x667788, 0x99aabb); scene.add(grid);
  const cam = new THREE.PerspectiveCamera(32, CW / CH, 0.1, 50); const side = Q.has('front') ? 0 : Math.PI / 2 * 0.8;
  const info = [];
  let row = 0;
  for (const pk of PROTOS) {
    const g = await gl.loadAsync('assets/ch_' + pk + '.glb');
    const names = new Set(); g.scene.traverse((o) => names.add(o.name));
    const idle = g.animations.find((a) => a.name === 'Idle');
    const P = { scene: g.scene, clips: { idle }, cal: {} };
    for (const ck of CLIPS) {
      const clip = ualClip(P, ck); const m = SkeletonUtils.clone(g.scene); scene.add(m); m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      const mixer = new THREE.AnimationMixer(m); const a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
      info.push([pk, ck, clip ? +clip.duration.toFixed(2) : null, clip ? clip.userData : null]);
      for (let i = 0; i < NC; i++) {
        mixer.setTime(clip.duration * i / (NC - 1)); m.updateMatrixWorld(true);
        const hips = m.getObjectByName('Hips').getWorldPosition(new THREE.Vector3());
        cam.position.set(hips.x + Math.sin(side) * 3.6, 1.0, hips.z + Math.cos(side) * 3.6); cam.lookAt(hips.x, 0.85, hips.z);
        const x = i * CW, y = H - (row + 1) * CH; R.setViewport(x, y, CW, CH); R.setScissor(x, y, CW, CH); R.render(scene, cam);
      }
      scene.remove(m); row++;
    }
  }
  window.__INFO = info; window.__DONE = true;
})().catch((e) => { window.__ERR = String(e && e.stack || e); window.__DONE = true; });
