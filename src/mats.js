// Materials: PBR texture sets, CSM/fog preparation, procedural facade + road shaders
import * as THREE from 'three';
import { U } from './env.js';
import { CYBER } from './mapsel.js'; // r6.0: v4.5 cyberpunk / weathering shader parts only on map 霓港
import { SHOTFAST } from './shotfast.js'; // b_verify: test-only ?shotfast

export const M = {}; // material registry
let CSMREF = null; let ANISO = 8;
export function setCSM(csm, aniso) { CSMREF = csm; ANISO = aniso; }

export function prep(mat, key = 'std', patch = null) {
  mat.onBeforeCompile = (s, r) => {
    s.uniforms.uSunDir = U.uSunDir; s.uniforms.uFogSunCol = U.uFogSunCol; s.uniforms.uFogFalloff = U.uFogFalloff;
    if (patch) patch(s);
  };
  // b_verify ?shotfast (test only): unpatched names share one program ('std'): same shader text, so the same pixels, fewer SwiftShader JITs
  mat.customProgramCacheKey = SHOTFAST && !patch ? () => 'std' : () => key;
  return mat;
}

export function texSet(T, name, rep = 1, opts = {}) {
  const d = T[name + '_d'], n = T[name + '_n'], a = T[name + '_arm'];
  for (const t of [d, n, a]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = ANISO; }
  if (d) d.colorSpace = THREE.SRGBColorSpace;
  return { map: d, normalMap: n, roughnessMap: a, aoMap: null, ...opts };
}

const HASH = `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h12(i),h12(i+vec2(1,0)),f.x), mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x), f.y); }
`;

// r6.3 street pass: storefront interiors as real parallax rooms (ray-traced box room + furniture boxes + people cut-outs),
// one room per 2-bay shop unit, 5 shop kinds with their own fit-out and lighting; lit all day, ~86 % stay lit at night
const SHOPROOM = `
float gLod = 0.0; // 0 = full shelf detail, 1 = averaged (grazing views / far: compressed side-wall shelving read as colour stripes)
vec2 sBox(vec3 ro, vec3 ird, vec3 b0, vec3 b1) { vec3 t0 = (b0 - ro) * ird, t1 = (b1 - ro) * ird; vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z); return b > max(a, 0.0) ? vec2(a, b) : vec2(1e9); }
vec3 sBoxN(vec3 p, vec3 b0, vec3 b1) { vec3 q = (p - (b0 + b1) * 0.5) / max((b1 - b0) * 0.5, vec3(1e-3)); vec3 a = abs(q);
  return a.x > a.y && a.x > a.z ? vec3(sign(q.x), 0.0, 0.0) : (a.y > a.z ? vec3(0.0, sign(q.y), 0.0) : vec3(0.0, 0.0, sign(q.z))); }
// merchandise on shelves: rows every 'pitch' metres, items of varied width / height / colour, dark gap under each shelf lip
vec3 sGoods(vec2 p, float pitch, float sd, vec3 shelfC) {
  float row = floor(p.y / pitch); float fy = fract(p.y / pitch);
  float iw = 0.12 + 0.16 * h12(vec2(row, sd)); float ix = floor(p.x / iw); float fx = fract(p.x / iw);
  float h = h12(vec2(ix, row) + sd); vec3 c = 0.18 + 0.62 * vec3(h12(vec2(ix * 1.3, row + sd)), h12(vec2(ix + 7.1, row * 2.3 + sd)), h12(vec2(ix * 0.7 - 3.0, row + sd * 1.7)));
  c = mix(c, vec3(dot(c, vec3(0.33))), 0.25); // packaging, not candy
  float ih = 0.45 + 0.42 * h; float item = step(0.10, fx) * step(fx, 0.94) * step(0.09, fy) * step(fy, 0.09 + ih) * step(0.12, h);
  float lip = smoothstep(0.09, 0.0, fy); float label = step(abs(fy - (0.09 + ih * 0.55)), ih * 0.14) * item;
  vec3 back = shelfC * 0.55;
  vec3 o = mix(back, c * (0.85 + 0.3 * step(0.5, fx)), item); o = mix(o, mix(o, vec3(0.92), 0.6), label * step(0.5, h12(vec2(ix, row * 3.0))));
  o = mix(o, shelfC * 1.1, lip);
  return mix(o, shelfC * 0.5 + vec3(0.17, 0.16, 0.14), gLod);
}
// a person standing behind the glass (cut-out facing the window): legs, torso, arms, head; returns coverage, colour in c
float sPerson(vec2 q, float sd, out vec3 c) {
  float hgt = 1.62 + 0.2 * h12(vec2(sd, 3.1)); q /= hgt / 1.75;
  float head = step(length((q - vec2(0.0, 1.62)) / vec2(0.105, 0.125)), 1.0);
  float neck = step(abs(q.x), 0.05) * step(1.44, q.y) * step(q.y, 1.52);
  float sh = 0.21 - 0.05 * smoothstep(1.3, 1.48, q.y); float torso = step(abs(q.x), sh) * step(0.86, q.y) * step(q.y, 1.48);
  float arms = step(abs(abs(q.x) - 0.235), 0.045) * step(0.82 + 0.06 * step(0.5, h12(vec2(sd, 9.0))), q.y) * step(q.y, 1.42);
  float hip = step(abs(q.x), 0.17) * step(0.78, q.y) * step(q.y, 0.9);
  float legs = step(abs(abs(q.x) - 0.085), 0.075) * step(0.0, q.y) * step(q.y, 0.84);
  float hair = step(length((q - vec2(0.0, 1.67)) / vec2(0.11, 0.1)), 1.0) * step(0.3, h12(vec2(sd, 5.0)));
  vec3 top = 0.12 + 0.5 * vec3(h12(vec2(sd, 1.0)), h12(vec2(sd, 2.0)), h12(vec2(sd, 4.0))); vec3 bot = mix(vec3(0.10, 0.12, 0.18), vec3(0.45, 0.40, 0.33), step(0.6, h12(vec2(sd, 6.0))));
  vec3 skin = mix(vec3(0.62, 0.45, 0.34), vec3(0.32, 0.21, 0.15), h12(vec2(sd, 7.0)));
  c = legs > 0.5 ? bot : skin; if (torso + arms * step(1.1, q.y) + hip > 0.5) c = top; if (hip > 0.5) c = bot; if (hair > 0.5 && q.y > 1.6) c = vec3(0.06, 0.045, 0.035);
  return clamp(head + neck + torso + arms + hip + legs, 0.0, 1.0);
}
// st: 0 grocery/pharmacy, 1 café, 2 boutique, 3 office/bank; sv: per-unit variation; on: lights on; n: night
vec3 shopRoom(vec2 ro2, vec3 rd, float RW, float RH, float RD, float st, float sv, float n, float on) {
  vec3 ro = vec3(ro2, 0.0);
  vec3 rds = vec3(rd.x >= 0.0 ? max(rd.x, 1e-4) : min(rd.x, -1e-4), rd.y >= 0.0 ? max(rd.y, 1e-4) : min(rd.y, -1e-4), max(rd.z, 0.05)); vec3 ird = 1.0 / rds;
  float tx = rds.x > 0.0 ? (RW - ro.x) * ird.x : -ro.x * ird.x; float ty = rds.y > 0.0 ? (RH - ro.y) * ird.y : -ro.y * ird.y; float tz = RD * ird.z;
  float t = min(min(tx, ty), tz); vec3 nrm = t == tz ? vec3(0.0, 0.0, -1.0) : (t == ty ? vec3(0.0, -sign(rds.y), 0.0) : vec3(-sign(rds.x), 0.0, 0.0));
  float id = t == tz ? 3.0 : (t == ty ? (rds.y > 0.0 ? 1.0 : 2.0) : 0.0); // 0 side, 1 ceiling, 2 floor, 3 back, 4+ furniture
  vec3 b0[3]; vec3 b1[3];
  float sub = floor(sv * 3.0); // grocery / pharmacy / electronics within kind 0
  if (st == 0.0) { float gl = RD - 1.3; b0[0] = vec3(RW * 0.34 - 0.42, 0.0, 1.6); b1[0] = vec3(RW * 0.34 + 0.42, sub == 2.0 ? 1.05 : 1.55, gl);
    b0[1] = vec3(RW * 0.70 - 0.42, 0.0, 1.6); b1[1] = vec3(RW * 0.70 + 0.42, sub == 2.0 ? 1.05 : 1.55, gl); b0[2] = vec3(RW - 1.9, 0.0, 0.55); b1[2] = vec3(RW - 0.25, 1.0, 1.15); }
  else if (st == 1.0) { b0[0] = vec3(0.6, 0.0, RD - 1.6); b1[0] = vec3(RW - 0.4, 1.08, RD - 1.0); // bar counter
    b0[1] = vec3(RW * 0.22 - 0.38, 0.72, 1.2); b1[1] = vec3(RW * 0.22 + 0.38, 0.76, 1.95); b0[2] = vec3(RW * 0.62 - 0.38, 0.72, 2.2); b1[2] = vec3(RW * 0.62 + 0.38, 0.76, 2.95); }
  else if (st == 2.0) { b0[0] = vec3(RW * 0.5 - 0.7, 0.0, RD * 0.45); b1[0] = vec3(RW * 0.5 + 0.7, 0.82, RD * 0.45 + 0.9); // display table
    b0[1] = vec3(RW - 1.7, 0.0, RD - 1.2); b1[1] = vec3(RW - 0.3, 1.0, RD - 0.65); b0[2] = vec3(0.4, 0.0, 0.5); b1[2] = vec3(0.95, 0.12, 1.05); } // till, plinth
  else { b0[0] = vec3(RW * 0.25, 0.0, RD * 0.58); b1[0] = vec3(RW * 0.75, 1.1, RD * 0.58 + 0.7); // reception / teller desk
    b0[1] = vec3(RW - 0.9, 0.0, 0.7); b1[1] = vec3(RW - 0.45, 0.45, 1.15); b0[2] = vec3(0.3, 0.0, RD * 0.3); b1[2] = vec3(0.7, 0.44, RD * 0.3 + 1.6); } // planter, bench
  for (int i = 0; i < 3; i++) { vec2 h = sBox(ro, ird, b0[i], b1[i]); if (h.x < t) { t = h.x; id = 4.0 + float(i); nrm = sBoxN(ro + rds * t, b0[i], b1[i]); } }
  // table legs / bar stools for the café (thin boxes would be lost: draw as the table's shadow column on the floor instead)
  vec3 p = ro + rds * t;
  vec3 wallC = st == 0.0 ? vec3(0.74, 0.75, 0.73) : (st == 1.0 ? vec3(0.62, 0.46, 0.34) : (st == 2.0 ? vec3(0.80, 0.77, 0.72) : vec3(0.66, 0.68, 0.70)));
  wallC *= 0.9 + 0.2 * sv;
  vec3 lc = st == 1.0 ? vec3(1.0, 0.76, 0.52) : (st == 2.0 ? vec3(1.0, 0.92, 0.80) : vec3(0.93, 0.97, 1.0));
  if (st == 0.0 && sub == 1.0) wallC = vec3(0.92, 0.95, 0.95);
  vec3 alb = wallC; float emi = 0.0;
  if (id == 2.0) { // floor
    if (st == 1.0) { vec2 pl = vec2(p.x / 0.18, p.z / 1.2 + floor(p.x / 0.18) * 0.37); alb = vec3(0.42, 0.28, 0.17) * (0.8 + 0.3 * h12(floor(pl))) * (1.0 - 0.3 * smoothstep(0.04, 0.0, fract(pl.x))); }
    else { vec2 tl = p.xz / 0.6; float ck = mod(floor(tl.x) + floor(tl.y), 2.0); float gr = smoothstep(0.03, 0.0, min(fract(tl.x), fract(tl.y)));
      alb = (st == 2.0 ? vec3(0.62, 0.61, 0.6) : (st == 3.0 ? vec3(0.72, 0.68, 0.62) : vec3(0.82, 0.82, 0.8))) * (0.94 + 0.06 * ck) * (1.0 - 0.25 * gr); }
  } else if (id == 1.0) { // ceiling + fixtures
    alb = st == 1.0 ? vec3(0.16, 0.15, 0.14) : vec3(0.88, 0.88, 0.87);
    if (st == 0.0 || st == 3.0) { vec2 tr = vec2(p.x / 1.2, p.z / 1.8); vec2 fr = fract(tr); float fx = step(0.3, fr.x) * step(fr.x, 0.7) * step(0.25, fr.y) * step(fr.y, 0.75); emi = fx * 2.4; alb *= 1.0 - 0.3 * smoothstep(0.02, 0.0, min(fr.x, fr.y)); }
    if (st == 2.0) { float track = step(abs(fract(p.x / (RW * 0.5)) - 0.5), 0.012); vec2 sp = vec2(fract(p.x / (RW * 0.5)) - 0.5, fract(p.z / 1.1) - 0.5); emi = smoothstep(0.06, 0.03, length(sp * vec2(RW * 0.5, 1.1))) * 4.0; alb *= 1.0 - track * 0.8; }
  } else if (id == 3.0 || id == 0.0) { // walls
    vec2 wq = id == 3.0 ? p.xy : vec2(p.z, p.y);
    float skirt = step(wq.y, 0.12);
    if (st == 0.0) {
      if (id == 3.0 && sub == 0.0) { // chiller doors along the back wall: framed glass, cool-lit stock behind
        float dx = fract(wq.x / 0.8); float door = step(0.05, dx) * step(dx, 0.95) * step(0.15, wq.y) * step(wq.y, 2.05);
        vec3 g = sGoods(vec2(wq.x, wq.y - 0.15), 0.38, sv * 9.0, vec3(0.75, 0.78, 0.8));
        alb = mix(vec3(0.75, 0.77, 0.78), g, door); emi = door * 0.9 * step(0.15, wq.y); alb = mix(alb, alb * vec3(0.85, 0.95, 1.1), door);
      } else if (wq.y < 2.0) { alb = sGoods(vec2(wq.x + id * 3.1, wq.y - 0.12), sub == 2.0 ? 0.5 : 0.36, sv * 13.0 + id, vec3(0.82)); if (sub == 2.0) alb = mix(alb, vec3(0.05), step(0.55, fract(wq.y / 0.5)) * step(0.3, h12(floor(wq / vec2(0.5)) + sv)) * 0.85); }
      if (id == 3.0 && wq.y > 2.25 && wq.y < 2.7) { alb = sub == 1.0 ? vec3(0.1, 0.55, 0.3) : vec3(0.75, 0.15, 0.12); alb = mix(alb, vec3(0.95), step(0.5, h12(floor(vec2(wq.x / 0.18, wq.y / 0.15)))) * step(abs(wq.y - 2.475), 0.12)); }
    } else if (st == 1.0) {
      alb = mix(wallC, vec3(0.30, 0.20, 0.13), step(wq.y, 1.05)); // wainscot
      if (id == 3.0) { float sh2 = step(1.35, wq.y) * step(wq.y, 2.05); float bt = step(0.5, h12(vec2(floor(wq.x / 0.11), floor(wq.y / 0.35)) + sv)) * step(0.06, fract(wq.y / 0.35)) * step(fract(wq.y / 0.35), 0.7) * step(abs(fract(wq.x / 0.11) - 0.5), 0.3);
        alb = mix(alb, mix(vec3(0.12, 0.08, 0.05), vec3(0.25, 0.45, 0.3) * (0.6 + h12(vec2(floor(wq.x / 0.11), 1.0))), bt), sh2);
        float board = step(abs(wq.x - RW * 0.5), RW * 0.22) * step(2.2, wq.y) * step(wq.y, 2.85); alb = mix(alb, vec3(0.07, 0.08, 0.07), board);
        alb = mix(alb, vec3(0.9, 0.88, 0.8), board * step(0.55, h12(floor(vec2(wq.x / 0.09, wq.y / 0.11)) + sv)) * step(fract(wq.y / 0.11), 0.4) * 0.8); }
      else { float fr = step(abs(fract(wq.x / 1.6) - 0.5), 0.17) * step(abs(wq.y - 1.7), 0.25); alb = mix(alb, (0.3 + 0.5 * vec3(h12(vec2(floor(wq.x / 1.6), sv)), h12(vec2(floor(wq.x / 1.6), 2.0)), 0.4)) , fr); }
    } else if (st == 2.0) {
      float rail = step(abs(wq.y - 1.62), 0.012); float cx = fract(wq.x / 0.13); float cl = step(wq.y, 1.6) * step(0.15, cx) * step(cx, 0.9) * step(0.2, h12(vec2(floor(wq.x / 0.13), sv)));
        vec3 cc = 0.12 + 0.55 * vec3(h12(vec2(floor(wq.x / 0.39), 1.0 + sv)), h12(vec2(floor(wq.x / 0.39), 2.0)), h12(vec2(floor(wq.x / 0.39), 3.0)));
        cl *= (1.0 - 0.8 * gLod) * step(1.6 - 0.55 - 0.45 * h12(vec2(floor(wq.x / 0.39), 5.0 + sv)), wq.y); // garments hang 0.55-1.0 m below the rail
        if (id == 3.0) { float poster = step(abs(wq.x - RW * 0.5), 0.6) * step(1.0, wq.y) * step(wq.y, 2.6); alb = mix(wallC, vec3(0.55, 0.5, 0.46) * (0.6 + 0.6 * vnoise(wq * 3.0 + sv)), poster); alb = mix(alb, cc, cl * (1.0 - poster)); alb = mix(alb, vec3(0.08), rail * (1.0 - poster)); }
        else { alb = mix(wallC, cc, cl); alb = mix(alb, vec3(0.08), rail); }
    } else {
      if (id == 3.0) { float logo = step(abs(wq.x - RW * 0.5), RW * 0.2) * step(abs(wq.y - 1.9), 0.32); vec3 ac = mix(vec3(0.05, 0.22, 0.42), vec3(0.45, 0.08, 0.1), step(0.5, sv));
        alb = mix(wallC, ac, logo); alb = mix(alb, vec3(0.92), logo * step(abs(wq.y - 1.9), 0.05) * step(abs(wq.x - RW * 0.5), RW * 0.15)); emi = logo * 0.4; }
      else { float dr = step(abs(fract(wq.x / 2.5) - 0.5), 0.2) * step(wq.y, 2.2); alb = mix(wallC, vec3(0.35, 0.33, 0.3), dr); }
    }
    alb = mix(alb, alb * 0.5, skirt);
  } else { // furniture
    float k2 = id - 4.0;
    if (st == 0.0 && k2 < 1.5) { vec2 fq = abs(nrm.x) > 0.5 ? vec2(p.z, p.y) : vec2(p.x, p.y); alb = nrm.y > 0.5 ? vec3(0.4) : sGoods(fq + k2 * 2.3, sub == 2.0 ? 0.5 : 0.34, sv * 7.0 + k2, vec3(0.8)); if (sub == 2.0 && nrm.y > 0.5) { alb = vec3(0.08); emi = step(abs(fract(p.x / 0.6) - 0.5), 0.3) * step(abs(fract(p.z / 0.8) - 0.5), 0.25) * 0.8; } }
    else if (st == 0.0) alb = nrm.y > 0.5 ? vec3(0.25) : mix(vec3(0.82, 0.83, 0.84), vec3(0.15, 0.35, 0.6), step(0.3, p.y) * step(p.y, 0.55));
    else if (st == 1.0) alb = k2 < 0.5 ? (nrm.y > 0.5 ? vec3(0.75, 0.73, 0.7) : vec3(0.28, 0.18, 0.11) * (0.8 + 0.4 * step(0.5, fract(p.x / 0.25)))) : vec3(0.32, 0.21, 0.13);
    else if (st == 2.0) alb = k2 < 0.5 ? (nrm.y > 0.5 ? sGoods(vec2(p.x * 1.4, (p.z - RD * 0.45) * 0.9), 0.3, sv + 3.0, vec3(0.7)) : vec3(0.78, 0.74, 0.68)) : (k2 < 1.5 ? vec3(0.2, 0.19, 0.18) : vec3(0.9));
    else alb = k2 < 0.5 ? (nrm.y > 0.5 ? vec3(0.65, 0.62, 0.58) : vec3(0.42, 0.36, 0.3)) : (k2 < 1.5 ? (p.y > 0.4 ? vec3(0.08, 0.2, 0.07) : vec3(0.3, 0.3, 0.32)) : vec3(0.2, 0.22, 0.25));
  }
  // lighting: ceiling fixtures (soft top-down + wrap), falling off toward the back of deep / dim rooms, café pendants pool light
  float lev = mix(0.62, 0.27, n) * on + (1.0 - on) * mix(0.3, 0.02, n); // night exposure is ~2x day: keep shops from blooming out
  float il = (0.42 + 0.38 * max(nrm.y, 0.0) + 0.12 * max(-nrm.z, 0.0)) * (1.0 - 0.3 * clamp(p.z / RD, 0.0, 1.0)) * (1.0 - 0.25 * step(p.y, 0.4) * (1.0 - nrm.y));
  if (st == 1.0) { float pd = 0.0; for (int j = 0; j < 2; j++) { vec2 c = j == 0 ? vec2(RW * 0.22, 1.57) : vec2(RW * 0.62, 2.57); pd += exp(-dot(p.xz - c, p.xz - c) * 1.8) * (1.0 - smoothstep(0.8, 2.6, abs(p.y - 2.0))); }
    il = il * 0.55 + pd * 0.9 + 0.12 * step(RD - 1.7, p.z) * step(1.2, p.y); }
  // contact shadow under furniture / at the wall foot
  il *= 1.0 - 0.3 * smoothstep(0.35, 0.0, min(min(p.x, RW - p.x), RD - p.z)) * step(p.y, 0.3);
  vec3 col = alb * lc * il * lev + (alb * 0.6 + 0.4) * lc * emi * on * mix(0.55, 0.26, n);
  // café pendants: small glowing globes hanging over each table
  if (st == 1.0) for (int j = 0; j < 2; j++) { vec3 c = j == 0 ? vec3(RW * 0.22, RH - 0.85, 1.57) : vec3(RW * 0.62, RH - 0.85, 2.57); vec3 oc = ro - c; float b = dot(oc, rds) / dot(rds, rds);
    vec3 cp = oc - rds * b; float tq = -b; if (tq > 0.0 && tq * length(rds) < t * length(rds)) { float d = length(cp); col += vec3(1.0, 0.72, 0.42) * (smoothstep(0.09, 0.05, d) * 5.0 + smoothstep(0.3, 0.0, d) * 0.5) * on;
    } float cord = step(abs(ro.x + rds.x * ((c.z - ro.z) / rds.z) - c.x), 0.006) * step(c.y, ro.y + rds.y * ((c.z - ro.z) / rds.z)); if ((c.z - ro.z) / rds.z < t) col = mix(col, vec3(0.02), cord); }
  // people: 0-2 cut-outs per unit at their own depth (behind the counter = staff, in the aisle = customers)
  for (int j = 0; j < 2; j++) {
    float hj = h12(vec2(sv * 31.0, float(j) * 4.7));
    if (hj < (j == 0 ? 0.25 : 0.55)) continue;
    float zp = st == 1.0 && j == 0 ? RD - 0.75 : (st == 3.0 && j == 0 ? RD * 0.58 + 1.0 : 1.1 + hj * (RD - 2.6));
    float xp = st == 0.0 ? (j == 0 ? RW * 0.52 : RW - 1.1) : RW * (0.2 + 0.6 * fract(hj * 7.3));
    float tp = (zp - ro.z) * ird.z; if (tp <= 0.0 || tp > t) continue;
    vec3 pp = ro + rds * tp; vec3 pc; float m = sPerson(vec2(pp.x - xp, pp.y), hj * 17.0 + sv, pc);
    if (m > 0.5) { float pil = (0.5 + 0.35 * smoothstep(0.6, 1.7, pp.y)) * (1.0 - 0.3 * clamp(zp / RD, 0.0, 1.0)); col = pc * lc * pil * lev; t = tp; }
  }
  // depth haze / exposure: far back of the room a touch flatter
  return col * (1.0 - 0.15 * clamp(t * length(rds) / (RD * 1.6), 0.0, 1.0));
}
`;

// ---------------------------------------------------------------- building facades ----
// geometry attributes: uv = facade metres (u along wall, v height), aWin = (style, floorH, winW, seed), aCol = wall colour, aGlass = glass tint
// styles: 0 curtain wall, 1 condo (balcony bands), 2 punched windows (stucco), 3 storefront, 4 blank wall/roof, 5 deco ribbon windows
export function buildingMaterial(T) {
  const ts = texSet(T, 'plaster', 1);
  const cs = texSet(T, 'concrete', 1);
  const mat = new THREE.MeshStandardMaterial({ map: ts.map, normalMap: ts.normalMap, roughnessMap: ts.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) });
  ts.map.repeat.set(0.25, 0.25); ts.normalMap.repeat.set(0.25, 0.25); ts.roughnessMap.repeat.set(0.25, 0.25);
  const uniforms = { tConc: { value: cs.map }, uNight: U.uNight, uTime: U.uTime, uDbg: { value: +(new URLSearchParams(location.search).get('dbg') || 0) } };
  return prep(mat, 'building', (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aWin; attribute vec3 aCol; attribute vec3 aGlass; attribute vec3 aUp; flat varying vec4 vWin; flat varying vec3 vCol; flat varying vec3 vGlass; flat varying vec3 vUp; varying vec2 vUvM; varying vec3 vWPb;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vWin = aWin; vCol = aCol; vGlass = aGlass; vUp = aUp; vUvM = uv; vWPb = (modelMatrix * vec4(position,1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tConc; uniform float uNight; uniform float uTime; uniform float uDbg; flat varying vec4 vWin;
vec3 neonPal(float h){ h = fract(h); return h < 0.3 ? vec3(1.0, 0.17, 0.84) : h < 0.58 ? vec3(0.1, 0.94, 1.0) : h < 0.8 ? vec3(0.55, 0.36, 1.0) : vec3(1.0, 0.32, 0.45); } flat varying vec3 vCol; flat varying vec3 vGlass; flat varying vec3 vUp; varying vec2 vUvM; varying vec3 vWPb;
${HASH}${SHOPROOM}`)
      .replace('#include <map_fragment>', `
float style = floor(vWin.x + 0.5); float fh = vWin.y; float ww = vWin.z; float seed = vWin.w;
vec2 cf = vec2(vUvM.x / ww, vUvM.y / fh); vec2 cid = floor(cf); vec2 f = fract(cf);
float rnd = h12(cid + seed * 17.0); float rnd2 = h12(cid.yx * 1.7 + seed * 3.1);
float isGlass = 0.0; float frame = 0.0; float lit = 0.0; float interior = 0.0; float shade = 1.0; float isMetal = 0.0; float posterM = 0.0; vec3 posterC = vec3(1.0);
vec3 wall = vCol;
vec4 texelColor = texture2D(map, vMapUv);
vec3 baseTex = texelColor.rgb / 0.82;
vec3 conc = baseTex;
// r6.1 tangent frame from screen derivatives (window recess parallax)
vec3 rP_ = vWPb; vec3 rdp1 = dFdx(rP_), rdp2 = dFdy(rP_); vec2 rdu1 = dFdx(vUvM), rdu2 = dFdy(vUvM);
vec3 rNg = normalize(cross(rdp1, rdp2) + 1e-7); if (dot(rNg, cameraPosition - rP_) < 0.0) rNg = -rNg;
vec3 rd2p = cross(rdp2, rNg), rd1p = cross(rNg, rdp1);
vec3 rTt = normalize(rd2p * rdu1.x + rd1p * rdu2.x + 1e-6), rBt = normalize(rd2p * rdu1.y + rd1p * rdu2.y + 1e-6);
vec3 rV = normalize(rP_ - cameraPosition);
vec3 vt_ = vec3(dot(rV, rTt), dot(rV, rBt), max(dot(rV, -rNg), 0.08));
float reveal = 0.0, revealK = 1.0;
float age = fract(seed * 0.618 + 0.13); // per-building age: grime, bleaching, streak strength
if (style == 0.0) { // curtain wall: glass with thin metal mullions + spandrel bands
  float mx = 1.0 - step(0.03, f.x) * step(f.x, 0.97);
  float my = 1.0 - step(0.035, f.y) * step(f.y, 0.985);
  float span = step(f.y, 0.16);
  frame = max(mx, my); isGlass = 1.0 - frame; isMetal = frame;
  interior = (1.0 - span);
  baseTex = vec3(0.75);
} else if (style == 1.0) { // condo: floor-to-ceiling glass behind balcony bands (slabs are geometry)
  float mx = 1.0 - step(0.025, f.x) * step(f.x, 0.975);
  float band = step(f.y, 0.20);
  frame = max(mx, band); isGlass = 1.0 - frame; interior = 1.0;
  baseTex = conc * 1.25;
} else if (style == 2.0 || style == 5.0) { // punched / ribbon windows in stucco
  float x0 = style == 5.0 ? 0.0 : 0.2; float x1 = style == 5.0 ? 1.0 : 0.8;
  float wx = step(x0, f.x) * step(f.x, x1); float wy = step(0.28, f.y) * step(f.y, 0.80);
  // r6.1 recessed openings: march the view ray D metres into the wall; outside the opening at that depth it hits the reveal
  // (jamb / head soffit / sill) instead of the frame + glass, so windows read as holes in a thick wall at any angle
  float open_ = wx * wy; float Dr = style == 5.0 ? 0.13 : 0.21;
  vec2 g = f + vt_.xy * (Dr / vt_.z) / vec2(ww, fh) * open_;
  if (style == 5.0) g.x = clamp(g.x, 0.0, 1.0);
  float gin = step(x0, g.x) * step(g.x, x1) * step(0.28, g.y) * step(g.y, 0.80);
  reveal = open_ * (1.0 - gin); revealK = g.y > 0.80 ? 0.40 : (g.y < 0.28 ? 1.02 : 0.72);
  f = mix(f, g, open_ * gin);
  float inner = step(x0 + 0.03, f.x) * step(f.x, x1 - 0.03) * step(0.31, f.y) * step(f.y, 0.77) * (1.0 - reveal);
  isGlass = inner; frame = wx * wy * (1.0 - inner) * (1.0 - reveal);
  if (style == 5.0) { float mul = 1.0 - step(0.02, fract(f.x * 3.0)) * step(fract(f.x * 3.0), 0.98); frame = max(frame, mul * wx * wy * (1.0 - reveal)); isGlass *= 1.0 - mul; }
  else { float sash = inner * max(step(abs(f.x - 0.5), 0.011), step(abs(f.y - 0.555), 0.010)); frame = max(frame, sash); isGlass *= 1.0 - sash; } // v4.1 casement mullion + meeting rail
  // reveal shadow under the eyebrow
  shade = 1.0 - 0.35 * step(0.80, f.y) * step(f.y, 0.86) * wx;
  interior = 1.0;
} else if (style == 3.0) { // storefront
  float mx = 1.0 - step(0.025, f.x) * step(f.x, 0.975);
  float wy = step(0.06, f.y) * step(f.y, 0.80);
  isGlass = wy * (1.0 - mx); frame = (1.0 - isGlass) * step(f.y, 0.82); isMetal = frame * 0.6; interior = 1.0;
  lit = 0.0;
  // window posters / decals and a door push-bar on some bays (GTA6 storefronts are covered in signage)
  float ph = h12(cid + seed * 9.1);
  // r6.3: posters are poster-sized (≈0.55 x 0.8 m at eye level) with a white border, a picture block and text lines; 30 % of bays
  float pw_ = 0.55 / max(ww, 1.0), ph_ = 0.8 / max(fh, 1.0); float px0 = 0.12 + ph * 0.5, py0 = 1.05 / max(fh, 1.0);
  posterM = step(0.7, ph) * step(px0, f.x) * step(f.x, px0 + pw_) * step(py0, f.y) * step(f.y, py0 + ph_);
  vec2 pq = vec2((f.x - px0) / pw_, (f.y - py0) / ph_);
  vec3 pcA = 0.15 + 0.6 * vec3(fract(ph * 13.7), fract(ph * 7.9), fract(ph * 3.3));
  float inner_ = step(0.06, pq.x) * step(pq.x, 0.94) * step(0.05, pq.y) * step(pq.y, 0.95);
  float pic = step(0.38, pq.y) * step(pq.y, 0.9); float txt = step(0.1, pq.y) * step(pq.y, 0.32) * step(0.5, fract(pq.y * 9.0)) * step(pq.x, 0.25 + 0.6 * fract(floor(pq.y * 9.0) * 0.37 + ph));
  posterC = mix(vec3(0.9, 0.89, 0.86), mix(pcA * 1.2, pcA * (0.6 + 0.6 * pq.y), pic), inner_ * max(pic, 0.0)); posterC = mix(posterC, vec3(0.12), txt * inner_);
  float door = step(0.82, h12(cid.xx + seed)) * step(0.55, f.x) * step(f.x, 0.95);
  frame = max(frame, door * (step(abs(f.y - 0.42), 0.015) + step(abs(f.x - 0.75), 0.008) * wy) );
} else { // blank
  shade = 1.0;
}
// weathering / dirt streaks at the bottom of walls and under windows
float grime = vnoise(vec2(vUvM.x * 0.7, vUvM.y * 0.08 + seed)) * 0.07 + smoothstep(2.0, 0.0, vUvM.y) * 0.08;
// r6.1 material layering on both maps (the v4.5 霓港 layer generalised): water streaks running down from each sill,
// splash-back plinth, macro repaint / sun-bleach variation, per-building age, concrete patches, projecting sill + drop shadow
float streak = 0.0, sill = 0.0, sillSh = 0.0;
float sn0 = vnoise(vec2(vUvM.x * 9.0, cid.y * 3.1 + seed)) * 0.6 + vnoise(vec2(vUvM.x * 23.0, seed)) * 0.4;
if (style == 2.0 || style == 5.0) {
  float x0s = style == 5.0 ? 0.0 : 0.2; float x1s = style == 5.0 ? 1.0 : 0.8;
  float fx_ = fract(cf.x), fy_ = fract(cf.y);
  float inCol = step(x0s + 0.02, fx_) * step(fx_, x1s - 0.02);
  streak = inCol * smoothstep(0.28, 0.0, fy_) * smoothstep(0.45, 0.8, sn0) * ${CYBER ? '0.26' : '0.15'} * (0.5 + age);
  sill = step(x0s - 0.04, fx_) * step(fx_, x1s + 0.04) * step(0.245, fy_) * step(fy_, 0.28);
  sillSh = step(x0s - 0.03, fx_) * step(fx_, x1s + 0.03) * smoothstep(0.245, 0.225, fy_) * step(0.19, fy_);
}
// long run-off streaks below the parapet / every few floors (stronger on 霓港's rain-soaked concrete)
float roofStreak = smoothstep(0.55, 0.85, vnoise(vec2(vUvM.x * 1.3, seed * 2.0)) * 0.7 + vnoise(vec2(vUvM.x * 5.1, vUvM.y * 0.05)) * 0.3) * (style == 3.0 || style == 4.0 ? 0.0 : 1.0);
float macro = vnoise(vUvM * vec2(0.09, 0.05) + seed * 1.7);
float micro = vnoise(vUvM * vec2(1.9, 2.3) + seed) * 0.6 + vnoise(vUvM * 7.0) * 0.4;
float plinth = smoothstep(${CYBER ? '1.1' : '0.75'}, 0.0, vUvM.y) * (0.6 + 0.4 * vnoise(vec2(vUvM.x * 2.0, seed)));
vec3 concP = texture2D(tConc, vUvM * 0.21).rgb * vec3(0.95, 0.93, 0.9);
float patchC = smoothstep(0.66, 0.72, vnoise(vUvM * 0.33 + seed * 5.0)) * step(style, 2.5) * step(1.5, style);
vec3 wallCol = baseTex * min(wall, vec3(0.9)) * 0.9 * (1.0 - grime) * shade; // v4.0: stucco albedo capped (sunlit walls no longer clip)
wallCol *= (0.9 + 0.2 * macro) * (0.95 + 0.1 * micro) * (1.0 - streak) * (1.0 - plinth * ${CYBER ? '0.30' : '0.20'}) * (1.0 - sillSh * 0.3);
${CYBER ? `wallCol *= 1.0 - roofStreak * smoothstep(30.0, 6.0, mod(vUvM.y, 36.0)) * 0.18 * (0.4 + age); // rain run-off
wallCol = mix(wallCol, concP * 0.8, patchC * 0.55);` : `// 索拉纳港: sun-bleached stucco (paler + less saturated high up and on old buildings), warm dust at the foot
{ float lumW = dot(wallCol, vec3(0.299, 0.587, 0.114)); float bleach = (0.15 + 0.35 * age) * smoothstep(3.0, 18.0, vUvM.y) * (0.6 + 0.4 * macro);
  wallCol = mix(wallCol, vec3(lumW) * vec3(1.06, 1.04, 1.0), bleach * 0.45);
  wallCol = mix(wallCol, wallCol * vec3(0.86, 0.80, 0.72), plinth * 0.5);
  wallCol *= 1.0 - roofStreak * smoothstep(14.0, 4.0, mod(vUvM.y, 18.0)) * 0.07 * age;
  wallCol = mix(wallCol, concP * vec3(0.95, 0.92, 0.86), patchC * 0.25 * age); }`}
wallCol = mix(wallCol, vec3(0.86, 0.85, 0.82) * baseTex, sill * 0.85);
vec3 frameCol = style == 0.0 || style == 3.0 ? vec3(0.06, 0.065, 0.07) + wall * 0.15 : vec3(0.85, 0.85, 0.82);
// interiors behind glass: blinds / curtains for residential windows
float blind = (style == 2.0 || style == 5.0 || style == 1.0) ? step(1.0 - fract(f.y * 1.0 + 0.0), 0.0) : 0.0;
float bl = (style == 2.0 || style == 5.0 || style == 1.0) ? step(0.55, rnd2) * step(mix(0.55, 0.95, rnd), f.y) : 0.0;
vec3 glassCol = vGlass * (0.8 + 0.4 * rnd2);
float gEdge = 1.0 - smoothstep(0.0, 0.09, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 1.6); // dust at the pane edges
float gDirt = gEdge * 0.5 + smoothstep(0.55, 0.9, vnoise(vUvM * 3.1 + seed)) * 0.25;
glassCol = mix(glassCol, glassCol * vec3(1.05, 1.0, 0.92) + 0.015, gDirt * 0.5);
glassCol *= 1.0 - 0.45 * smoothstep(0.70, 0.77, f.y) * step(1.5, style) * step(style, 2.5); // reveal shadow under the lintel
glassCol = mix(glassCol, vec3(0.55, 0.52, 0.47), bl * 0.8);
// fade the procedural grid to its average when it gets smaller than a pixel (prevents moire)
vec2 fw = fwidth(cf); float aa = smoothstep(0.18, 0.6, max(fw.x, fw.y));
float avgG = style == 0.0 ? 0.80 : (style == 1.0 ? 0.76 : (style == 5.0 ? 0.48 : (style == 3.0 ? 0.70 : (style == 2.0 ? 0.22 : 0.0))));
isGlass = mix(isGlass, avgG, aa); frame = mix(frame, (1.0 - avgG) * (style == 2.0 || style == 5.0 ? 0.15 : 0.7), aa); shade = mix(shade, 1.0, aa); bl *= 1.0 - aa;
frameCol *= 0.88 + 0.24 * vnoise(vUvM * vec2(13.0, 17.0) + seed); // r6.1 paint wear / dirt on frames
vec3 col = mix(wallCol, frameCol, frame);
reveal *= 1.0 - aa; col = mix(col, wallCol * revealK * (1.0 - 0.25 * (1.0 - revealK)), reveal); // r6.1 recess reveal (head soffit darkest)
col = mix(col, glassCol, isGlass);
posterM *= 1.0 - aa; col = mix(col, posterC, posterM); isGlass *= 1.0 - posterM;
diffuseColor.rgb *= col;
${CYBER ? `float litChance = style == 3.0 ? 0.86 : (style == 0.0 ? 0.36 : 0.42);` : `float litChance = style == 3.0 ? 0.86 : (style == 0.0 ? 0.42 : 0.5);`}
lit = max(lit, step(rnd, litChance));
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
roughnessFactor *= mix(texelRoughness.g * 0.9 + 0.1, 0.35 + 0.2 * micro, frame);
roughnessFactor *= 0.9 + 0.2 * micro;
${CYBER ? `roughnessFactor = mix(roughnessFactor, 0.32, clamp(streak * 3.0 + roofStreak * 0.5 + plinth * 0.6, 0.0, 1.0) * (0.35 + 0.65 * uNight)); // wet run-off / splash zone` : ``}
roughnessFactor = mix(roughnessFactor, mix(0.02 + 0.06 * rnd2 + gDirt * 0.25, 0.6, bl), isGlass);
`)
      .replace('#include <metalnessmap_fragment>', `
float metalnessFactor = mix(isMetal * 0.7, (style == 0.0 ? 0.9 : (style == 3.0 ? 0.45 : 0.6)) * (1.0 - bl), isGlass);
`)
      .replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, max(isGlass, frame)));
// r6.1 procedural relief on the wall: trowelled stucco (索拉纳港) / board-formed concrete with tie holes (霓港), fades out with distance
{ float wallOnly = (1.0 - isGlass) * (1.0 - frame) * (1.0 - reveal) * (1.0 - aa);
${CYBER ? `  float hb = (vnoise(vUvM * vec2(3.0, 1.2) + seed) * 0.5 + vnoise(vUvM * 9.0) * 0.25) * 0.006 - smoothstep(0.035, 0.0, abs(fract(vUvM.y / 1.2) - 0.5) - 0.465) * 0.004
           - smoothstep(0.06, 0.0, length(fract(vUvM / vec2(0.9, 0.6)) - 0.5)) * 0.003;` : `  float hb = (vnoise(vUvM * vec2(2.3, 2.9) + seed) * 0.55 + vnoise(vUvM * 8.5 + 3.0) * 0.3 + vnoise(vUvM * 23.0) * 0.15) * 0.007;`}
  hb *= wallOnly;
  vec2 dH = vec2(dFdx(hb), dFdy(hb));
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition); vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
  float fDet = dot(sX, R1) * faceDirection; vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
  normal = normalize(abs(fDet) * normal - vGrad); }
// per-pane tilt: neighbouring panes reflect slightly different parts of the sky/street (real glazing is never perfectly flat)
normal = normalize(normal + vec3((rnd - 0.5) * 0.06 + (vnoise(vUvM * 0.7) - 0.5) * 0.02, (rnd2 - 0.5) * 0.04, 0.0) * isGlass);
`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ // r6.1 ambient occlusion on the indirect light only: wall foot, recess reveals, under sills (sunlit faces keep their direct light)
  float aoB = mix(0.50, 1.0, smoothstep(0.1, 2.4, vUvM.y)) * (1.0 - reveal * 0.45) * (1.0 - sillSh * 0.35);
  reflectedLight.indirectDiffuse *= aoB; reflectedLight.indirectSpecular *= mix(1.0, aoB, 0.7);
  // light2 street-canyon sky occlusion + bounce gradient: the lower floors of a street wall see less open sky (cooler, darker
  // fill) but more warm light bounced off the sunlit pavement; upper floors see the open sky. Shadowed walls get a vertical
  // falloff instead of one flat IBL value. Fades out at night (street lamps take over).
  float hy = vUvM.y; float dayK = 1.0 - uNight;
  float skyV = mix(${CYBER ? '0.60' : '0.68'}, 1.0, smoothstep(0.5, ${CYBER ? '30.0' : '18.0'}, hy));
  vec3 grad = mix(${CYBER ? 'vec3(1.0, 0.98, 0.95)' : 'vec3(1.10, 1.0, 0.86)'}, vec3(0.97, 1.0, 1.05), smoothstep(1.0, 14.0, hy));
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), grad * skyV, dayK);
  reflectedLight.indirectSpecular *= mix(1.0, mix(0.75, 1.0, skyV), dayK);
}`)
      .replace('#include <emissivemap_fragment>', `
#include <emissivemap_fragment>
{
  vec3 warm = mix(vec3(1.0, 0.62, 0.32), vec3(0.85, 0.9, 1.0), step(0.72, rnd2));
  float n = uNight;
  // light2 night window variety: three colour temperatures (incandescent / warm LED / cool) and a per-room dimmer, so a lit
  // facade reads as many households instead of one uniform orange grid
  warm = mix(warm, vec3(1.0, 0.80, 0.58), step(0.42, rnd2) * step(rnd2, 0.72));
  warm *= mix(0.42, 1.35, h12(vec2(rnd, rnd2) * 13.7 + seed));
${CYBER ? `  warm = mix(warm, neonPal(rnd * 3.7 + seed * 0.1) * 0.9 + 0.1, step(0.78, rnd) * n * 0.8); // some rooms lit in magenta / cyan at night
` : ``}  // fake room depth: darker towards the window centre, a bright ceiling band, random furniture silhouettes
  float ceil = smoothstep(0.66, 0.74, f.y) * (1.0 - smoothstep(0.76, 0.8, f.y));
  float depthF = 0.55 + 0.45 * smoothstep(0.0, 0.35, abs(f.x - 0.5));
  float furn = step(0.5, h12(vec2(floor(vUvM.x * 1.3), seed))) * step(f.y, 0.42);
  vec3 room = warm * (depthF * (1.0 - furn * 0.6) + ceil * 1.6);
  if (style == 3.0) { // v3.4 shop interior: pale back wall, small merchandise on shelf rows, counter, ceiling troffers
    float rows = fract(f.y * 7.0);
    float shelfBand = step(0.10, f.y) * step(f.y, 0.60);
    vec2 gid = floor(vec2(vUvM.x * 10.0, f.y * 7.0)); float gh = h12(gid + seed * 5.3);
    vec3 goods = mix(vec3(0.62, 0.58, 0.52), vec3(fract(gh * 7.31), fract(gh * 3.17), fract(gh * 5.73)), 0.5);
    float gx = fract(vUvM.x * 10.0);
    float item = step(0.22, gh) * step(0.12, gx) * step(gx, 0.88) * step(0.18, rows) * step(rows, 0.86);
    float shelfLine = smoothstep(0.09, 0.0, rows);
    float aisle = step(0.78, h12(vec2(floor(vUvM.x * 0.45), seed)));
    vec3 wallC = mix(vec3(0.92, 0.88, 0.82), vec3(0.82, 0.88, 0.92), step(0.5, rnd2));
    float troffer = step(0.72, f.y) * step(f.y, 0.75) * step(0.35, fract(vUvM.x * 0.5)) * step(fract(vUvM.x * 0.5), 0.65);
    room = wallC * mix(0.40, 0.2, uNight) * depthF + shelfBand * (1.0 - aisle) * (goods * item * 0.75 + shelfLine * 0.28)
         + vec3(1.0, 0.98, 0.92) * troffer * 1.1 + vec3(0.9, 0.85, 0.78) * step(f.y, 0.2) * aisle * 0.3;
    room *= mix(vec3(1.0), warm, 0.45);
    // r6.1 not every shop is a grocery: per-shop interior type (2-bay units) -> café / boutique / office as well
    float stype = floor(h12(vec2(seed * 3.7, floor(cid.x * 0.5))) * 4.0);
    if (stype == 1.0) { // café / restaurant: warm darker room, table + chair silhouettes, pendant lamps, a counter at the back
      vec3 wc = vec3(0.55, 0.38, 0.26) * (0.8 + 0.4 * rnd2);
      float tx = fract(vUvM.x * 0.55); float table = step(0.28, f.y) * step(f.y, 0.31) * step(0.2, tx) * step(tx, 0.62) + step(f.y, 0.29) * step(abs(tx - 0.41), 0.02);
      float chair = step(f.y, 0.36) * step(0.12, f.y) * (step(abs(tx - 0.12), 0.03) + step(abs(tx - 0.72), 0.03));
      float pend = smoothstep(0.05, 0.0, length(vec2((tx - 0.41) * 2.0, f.y - 0.6))) ;
      float cord = step(0.6, f.y) * step(abs(tx - 0.41), 0.004);
      room = wc * mix(0.30, 0.18, uNight) * depthF; room = mix(room, vec3(0.06, 0.04, 0.03), clamp(table + chair + cord, 0.0, 1.0));
      room += vec3(1.0, 0.72, 0.4) * pend * 2.2 + vec3(1.0, 0.75, 0.45) * smoothstep(0.6, 0.0, abs(f.y - 0.58)) * 0.12;
    } else if (stype == 2.0) { // boutique: bright white room, clothes on rails, track spots
      vec3 wc = vec3(0.92, 0.9, 0.88);
      float rail = step(abs(f.y - 0.58), 0.006); float gx = fract(vUvM.x * 4.0); vec2 gid2 = vec2(floor(vUvM.x * 4.0), seed);
      float cloth = step(0.30, f.y) * step(f.y, 0.57) * step(0.15, gx) * step(gx, 0.85) * step(0.25, h12(gid2));
      vec3 cc = 0.25 + 0.6 * vec3(h12(gid2 + 1.3), h12(gid2 + 2.1), h12(gid2 + 3.7));
      // vis-sweep: was an L1 distance -> hard white diamonds on every boutique window; now a round track-light head + a soft
      // downward wash on the wall below it
      vec2 sd = vec2((fract(vUvM.x * 0.7) - 0.5) * 0.3, (f.y - 0.73) * 0.6);
      float spot = smoothstep(0.03, 0.012, length(sd)) + smoothstep(0.16, 0.0, length(vec2(sd.x * 1.5, max(-sd.y, 0.0) * 0.45))) * step(f.y, 0.73) * 0.3;
      room = wc * mix(0.30, 0.22, uNight) * depthF; room = mix(room, cc * 0.45, cloth); room = mix(room, vec3(0.1), rail);
      room += vec3(1.0, 0.95, 0.85) * spot * 0.8;
    } else if (stype == 3.0) { // office / bank: cool white, reception desk, a plant, ceiling panels
      vec3 wc = vec3(0.78, 0.82, 0.86);
      float desk = step(0.12, f.y) * step(f.y, 0.30) * step(0.25, fract(vUvM.x * 0.3)) * step(fract(vUvM.x * 0.3), 0.75);
      // vis-sweep: the potted plant was a soft green blur dot; now a pot + a lobed leaf crown with a crisp (AA) edge
      vec2 pq = vec2((fract(vUvM.x * 0.3 + 0.37) - 0.5) * 2.5, (f.y - 0.38) * 1.6); float pa = atan(pq.y, pq.x);
      float pr = 0.085 * (0.78 + 0.22 * sin(pa * 7.0 + seed * 3.0)) - length(pq); float paw = max(fwidth(pr), 1e-4);
      float plant = smoothstep(-paw, paw, pr);
      float pot = step(abs(pq.x), 0.04) * step(-0.2, pq.y) * step(pq.y, -0.07);
      room = wc * mix(0.32, 0.22, uNight) * depthF; room = mix(room, vec3(0.32, 0.28, 0.25), desk); room = mix(room, vec3(0.06, 0.15, 0.05) * (0.8 + 0.4 * h12(floor(pq * 40.0))), plant * step(f.y, 0.5)); room = mix(room, vec3(0.30, 0.18, 0.12), pot);
      room += vec3(0.9, 0.95, 1.0) * troffer * 1.2;
    }
  }
  if (style == 3.0 && isGlass > 0.01 && aa < 0.99) { // r6.3 parallax shop room (near); far bays keep the flat interior above
    float unit = floor(cid.x * 0.5); float st3 = floor(h12(vec2(seed * 3.7, unit)) * 4.0); float sv = h12(vec2(unit * 1.37 + 0.5, seed * 2.9));
    float RW = 2.0 * ww; float ux = (cid.x - unit * 2.0 + f.x) * ww; float RD = 4.2 + 3.2 * h12(vec2(seed, unit + 0.5));
    float onU = max(1.0 - n, step(h12(vec2(unit, seed * 5.3)), 0.86));
    vec3 rdS = vec3(vt_.xy, max(vt_.z, 0.06));
    gLod = max(smoothstep(0.42, 0.16, rdS.z / length(rdS)), smoothstep(0.02, 0.06, max(fw.x * ww, fw.y * fh)));
    vec3 roomS = shopRoom(vec2(clamp(ux, 0.02, RW - 0.02), clamp(f.y * fh, 0.05, fh * 0.86 - 0.05)), rdS, RW, fh * 0.86, RD, st3, sv, n, onU);
    float fresS = pow(1.0 - clamp(rdS.z / length(rdS), 0.0, 1.0), 4.0);
    totalEmissiveRadiance += roomS * isGlass * (1.0 - aa) * (1.0 - fresS * 0.8) * (1.0 - posterM);
  }
  float inside = isGlass * interior * (style == 3.0 ? max(lit, 1.0 - n) : lit) * (0.55 + 0.45 * rnd2); // v4.4 shops are open by day (unlit bays read as black slabs)
  float k = style == 3.0 ? (0.95 - n * 0.25) * aa : (n * 0.8); // v4.3 lit shop interiors read through the glass by day (no black storefronts)
  // v4.1 interior mapping (parallax rooms): ray-box intersection of the view ray with a room behind each window cell.
  if (style != 3.0 && style != 4.0 && isGlass > 0.01 && aa < 0.99) {
    vec3 P = vWPb; vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 du1 = dFdx(vUvM), du2 = dFdy(vUvM);
    vec3 Ng = normalize(cross(dp1, dp2)); if (dot(Ng, cameraPosition - P) < 0.0) Ng = -Ng;
    vec3 d2p = cross(dp2, Ng), d1p = cross(Ng, dp1);
    vec3 Tt = normalize(d2p * du1.x + d1p * du2.x + 1e-6), Bt = normalize(d2p * du1.y + d1p * du2.y + 1e-6);
    vec3 V = normalize(P - cameraPosition);
    vec3 rd = vec3(dot(V, Tt), dot(V, Bt), max(dot(V, -Ng), 0.05));
    float RW = ww, RH2 = fh, RD = max(ww, 3.2) * (1.0 + rnd * 0.6);
    vec3 ro = vec3(f.x * RW, f.y * RH2, 0.0);
    float tx = rd.x > 0.0 ? (RW - ro.x) / max(rd.x, 1e-4) : ro.x / max(-rd.x, 1e-4);
    float ty = rd.y > 0.0 ? (RH2 * 0.96 - ro.y) / max(rd.y, 1e-4) : (ro.y - RH2 * 0.03) / max(-rd.y, 1e-4);
    float tz = RD / rd.z;
    float t = min(min(tx, ty), tz); vec3 hp = ro + rd * t;
    vec3 wallP = mix(vec3(0.80, 0.76, 0.70), vec3(0.70, 0.76, 0.80), step(0.5, rnd2)) * (0.8 + 0.3 * h12(cid + 3.3));
    vec3 rc; float depthK = 1.0 - 0.55 * clamp(hp.z / RD, 0.0, 1.0);
    if (t == tz) { // back wall: a picture or a doorway
      vec2 bq = vec2(hp.x / RW, hp.y / RH2); rc = wallP;
      float pic = step(0.6, rnd) * step(abs(bq.x - 0.5), 0.16) * step(abs(bq.y - 0.55), 0.10); rc = mix(rc, vec3(0.25, 0.35, 0.45) * (0.6 + rnd2), pic);
      float door = step(rnd, 0.3) * step(abs(bq.x - 0.25), 0.1) * step(bq.y, 0.7); rc = mix(rc, rc * 0.45, door);
    } else if (t == ty) rc = rd.y > 0.0 ? vec3(0.92, 0.9, 0.86) : mix(vec3(0.36, 0.25, 0.17), vec3(0.42, 0.40, 0.38), step(0.5, rnd)) * 0.9;
    else rc = wallP * 0.82;
    // furniture silhouette (sofa / bookcase / desk) on a plane part-way into the room
    float fz = RD * (0.35 + 0.3 * rnd2); float tf = (fz - ro.z) / rd.z; vec3 fp = ro + rd * tf;
    float fx0 = RW * (0.1 + 0.3 * rnd), fx1 = fx0 + RW * (0.35 + 0.25 * rnd2);
    float fh2 = RH2 * mix(0.28, 0.62, step(0.6, h12(cid + 7.7)));
    if (tf < t && fp.x > fx0 && fp.x < fx1 && fp.y < fh2 && fp.y > 0.0) { rc = mix(vec3(0.22, 0.18, 0.16), vec3(0.35, 0.3, 0.26), rnd) ; depthK *= 0.9; }
    // curtains just behind the glass
    float cw = RW * (0.08 + 0.2 * step(0.5, h12(cid + 1.1)));
    float curt = max(step(ro.x, cw), step(RW - cw, ro.x));
    vec3 curtC = mix(vec3(0.85, 0.82, 0.74), vec3(0.75, 0.55, 0.45), step(0.7, rnd2));
    float lamp = smoothstep(RW * 0.5, 0.0, length(hp.xz - vec2(RW * 0.5, RD * 0.5))) * step(RH2 * 0.9, hp.y);
    vec3 nightL = warm * (0.7 * depthK + lamp * 1.5);
    vec3 dayL = vec3(0.95, 0.97, 1.0) * exp(-hp.z / RD * 1.4) * 0.9 + 0.08;
    vec3 roomI = rc * mix(dayL * 0.34, nightL * lit, n);
    roomI = mix(roomI, curtC * mix(0.30, 0.55 * lit + 0.04, n), curt * 0.92);
    float fres = pow(1.0 - clamp(rd.z, 0.0, 1.0), 4.0);
    totalEmissiveRadiance += roomI * isGlass * (1.0 - aa) * (1.0 - fres * 0.85) * (1.0 - bl * 0.7);
    k *= aa; // far windows keep the old flat lit-window look
  }
  totalEmissiveRadiance += room * inside * k;
${CYBER ? `  // v4.5 cyberpunk night: LED bands every few floors + a corner strip on towers, neon fascia over storefronts
  if (n > 0.01) {
    vec3 pc = neonPal(seed * 0.137 + 0.05);
    float fl = cid.y;
    if (style == 0.0 || style == 1.0 || (style == 2.0 && vUvM.y > 16.0 && fract(seed * 0.31) < 0.5)) {
      float every = style == 1.0 ? 4.0 : 6.0;
      // bands on absolute height so they stay continuous lines (>= 1.5 px) from the air; chase light runs along the facade
      float per = fh * every; float yy = mod(vUvM.y + floor(seed) * fh, per);
      float bh = max(0.22, fwidth(vUvM.y) * 1.6);
      float bandM = smoothstep(bh, bh * 0.4, yy) * step(6.0, vUvM.y);
      float chase = 0.55 + 0.45 * sin(vUvM.x * 0.35 - uTime * 2.2 + seed);
      float cw = max(0.5, fwidth(vUvM.x) * 1.6);
      float corner = smoothstep(cw, cw * 0.3, vUvM.x) * step(0.5, fract(seed * 0.73)) * step(4.0, vUvM.y);
      totalEmissiveRadiance += pc * (bandM * chase * 4.0 + corner * 3.0) * n;
    }
    if (style == 3.0) {
      float fas = smoothstep(0.835, 0.845, f.y) * smoothstep(0.875, 0.865, f.y);
      totalEmissiveRadiance += neonPal(seed * 0.21 + cid.x * 0.37) * fas * 6.0 * n;
    }
    // r6.1 neon light actually falling on the surfaces around it: each storefront fascia throws its own colour up the wall
    // above it and down over the frames / piers (falls off with distance from the tube), weighted by the surface albedo
    { float wallLit = (1.0 - isGlass * 0.85);
      float bay = floor(vUvM.x / max(ww, 0.5));
      float yF = style == 3.0 ? fh * 0.855 : 4.0; float dy = vUvM.y - yF;
      float fall = exp(-max(dy, 0.0) / 2.2) * step(-0.2, dy) + exp(min(dy, 0.0) / 1.4) * (1.0 - step(-0.2, dy)) * 0.8;
      fall *= smoothstep(13.0, 2.0, vUvM.y);
      vec3 spillC = neonPal(seed * 0.21 + bay * 0.37);
      totalEmissiveRadiance += spillC * diffuseColor.rgb * fall * wallLit * n * 1.6; }
  }
` : ``}  // coloured facade up-lighting on the Art Deco hotels at night
  float wallM = (1.0 - isGlass) * (1.0 - frame * 0.5);
  float grad = 0.12 + 0.88 * exp(-max(vUvM.y - 4.4, 0.0) / 4.5); // v4.3 wash concentrated above the shop band, not a whole-facade tint
  totalEmissiveRadiance += vUp * diffuseColor.rgb * wallM * grad * n * 0.9;
}
`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
if (uDbg == 1.0) gl_FragColor = vec4(vec3(isGlass), 1.0);
if (uDbg == 2.0) gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
if (uDbg == 3.0) gl_FragColor = vec4(totalEmissiveRadiance, 1.0);
if (uDbg == 4.0) gl_FragColor = vec4(roughnessFactor, metalnessFactor, 0.0, 1.0);
if (uDbg == 5.0) gl_FragColor = vec4(diffuseColor.rgb, 1.0);
`);
  });
}

// r6.4 b_ground (霓港 only): ground-detail shader text in the road / sidewalk programs (?noground = old text)
const BG = CYBER && !(typeof location !== 'undefined' && /[?&]noground\b/.test(location.search));
// --------------------------------------------------------------------- road surface ----
// attributes: aRd = (across m, along m, segment length, kind) ; kind 0 = 4-lane two-way, 1 = intersection, 2 = 2-lane, 3 = 6-lane causeway
export function roadMaterial(T, refl) {
  const ts = texSet(T, 'asphalt', 1);
  const mat = new THREE.MeshStandardMaterial({ map: ts.map, normalMap: ts.normalMap, roughnessMap: ts.roughnessMap, roughness: 1, metalness: 0, color: 0xffffff, normalScale: new THREE.Vector2(1, 1) , ...(CYBER ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } : {}) }); // v4.5 roads win the depth test over land caps / terrain 3–4 cm below
  for (const t of [ts.map, ts.normalMap, ts.roughnessMap]) t.repeat.set(7 / 3.5, 7 / 3.5);
  const uniforms = { uWet: U.uWet, uNight: U.uNight, tRefl: refl.tex, uReflMat: refl.mat, uReflOn: refl.on, uLampP: U.uLampP, uLampC: U.uLampC };
  return prep(mat, 'road', (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aRd; varying vec4 vRd; varying vec3 vRW;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vRd = aRd; vRW = (modelMatrix * vec4(position, 1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet; uniform float uNight; uniform sampler2D tRefl; uniform mat4 uReflMat; uniform float uReflOn; varying vec4 vRd; varying vec3 vRW; uniform vec4 uLampP[10]; uniform vec3 uLampC[10];
${HASH}
float bandM(float x, float c, float w){ return smoothstep(w*0.5+0.02, w*0.5-0.02, abs(x-c)); }`)
      .replace('#include <map_fragment>', `
vec4 texelColor = texture2D(map, vMapUv);
float u = vRd.x, v = vRd.y, L = vRd.z, kind = floor(vRd.w + 0.5);
float au = abs(u);
vec3 paintW = vec3(0.86, 0.86, 0.82), paintY = vec3(0.86, 0.66, 0.16);
float wpaint = 0.0, ypaint = 0.0, bikeM = 0.0, bikeG = 0.0;
float wear = vnoise(vRW.xz * 0.35) * 0.6 + vnoise(vRW.xz * 2.3) * 0.4;
if (kind == 0.0 || kind == 3.0) {
  float hw = kind == 3.0 ? 10.5 : 7.0;
  ypaint = max(bandM(u, 0.18, 0.12), bandM(u, -0.18, 0.12));
  float dash = step(fract(v / 9.0), 0.36);
  wpaint = bandM(au, 3.5, 0.13) * dash + bandM(au, hw - 0.35, 0.15);
  if (kind == 3.0) wpaint += bandM(au, 7.0, 0.13) * dash;
  // crosswalks + stop lines at both ends
  float e = min(v, L - v);
  float zebra = step(0.5, fract(u / 1.1)) * step(1.0, e) * step(e, 4.2) * step(au, hw - 0.5);
${BG ? `  // b_ground: worn zebra — paint gone in the wheel paths, ragged stripe ends, a few stripes faded as a whole
  { float zs = floor(u / 1.1); float zh = h12(vec2(zs, floor(L * 0.37)));
    float wp = smoothstep(0.42, 0.2, abs(abs(fract(au / 3.5) - 0.5) - 0.25) * 3.5 / 1.4);
    float zn = vnoise(vRW.xz * 5.5) * 0.55 + vnoise(vRW.xz * 19.0) * 0.45;
    float keep = step(wp * 0.62 + (1.0 - smoothstep(0.0, 0.9, min(e - 1.0, 4.2 - e))) * 0.35 + zh * 0.25, zn + 0.18);
    zebra *= keep * mix(1.0, 0.55, step(0.8, zh)); }
` : ``}  float stopl = bandM(e, 5.0, 0.45) * step(0.3, u * sign(v - L * 0.5) * -1.0) * step(au, hw - 0.5);
  wpaint = max(wpaint, max(zebra, stopl));
  if (e < 5.4) ypaint *= step(5.4, e);
  // v3.4 lane arrows before the stop line (GTA6_REFERENCE §6 road markings)
  float laneC = au < 3.5 ? 1.75 : 5.25; float ue = abs(au - laneC);
  float inb = step(0.3, u * sign(v - L * 0.5) * -1.0) * step(au, 6.6);
  float shaft = step(ue, 0.11) * step(9.0, e) * step(e, 11.6);
  float head = step(11.6, e) * step(e, 13.0) * step(ue, 0.42 * (13.0 - e) / 1.4);
  wpaint = max(wpaint, (shaft + head) * inb * step(30.0, L));
  // green bike lanes on island/bayfront streets (not the beachfront drive with its parking lane)
  bikeM = (kind == 0.0 && vRW.x > -620.0 && (vRW.x < 268.0 || vRW.x > 312.0)) ? 1.0 : 0.0;
  float bikeBand = bandM(au, 6.15, 0.95) * bikeM * step(5.4, e);
  float bikeDash = step(e, 22.0) * step(fract(v / 3.0), 0.5);
  bikeG = bikeBand * mix(1.0, bikeDash, step(e, 22.0));
  wpaint = max(wpaint, bandM(au, 5.6, 0.12) * bikeM * step(5.4, e));
} else if (kind == 2.0) {
  ypaint = max(bandM(u, 0.15, 0.1), bandM(u, -0.15, 0.1));
  wpaint = bandM(au, 3.9, 0.14);
}
float paintMask = clamp(wpaint + ypaint, 0.0, 1.0) * (0.55 + 0.45 * smoothstep(0.25, 0.75, wear));
vec3 asph = texelColor.rgb * diffuse;
// tyre tracks: darker, smoother bands in each lane centre
float lanePos = abs(fract((au) / 3.5) - 0.5);
float tracks = (kind == 1.0) ? 0.0 : smoothstep(0.32, 0.18, abs(lanePos - 0.25)) * 0.2;
// patches / sealed cracks
float patchN = smoothstep(0.62, 0.66, vnoise(vRW.xz * 0.06 + 3.0));
asph *= (1.0 - tracks) * (1.0 - patchN * 0.25) * (0.9 + 0.2 * wear);
${CYBER ? `// v4.5 sealed crack lines + oil drips down the lane centres + lighter aggregate where the binder wore off
float crk = smoothstep(0.035, 0.0, abs(vnoise(vRW.xz * 0.35) - 0.5)) * smoothstep(0.5, 0.7, vnoise(vRW.xz * 0.045 + 11.0));
float oil = (kind == 1.0 ? 0.0 : smoothstep(0.18, 0.0, abs(lanePos - 0.0))) * smoothstep(0.55, 0.8, vnoise(vRW.xz * vec2(0.9, 0.9) + 3.7)) * 0.5;
asph = mix(asph, asph * 0.45, max(crk * 0.8, oil));
asph *= 1.0 + 0.12 * smoothstep(0.7, 0.9, vnoise(vRW.xz * 1.7));
` : ``}${BG ? `// b_ground: utility-cut patches (darker newer asphalt, sealed seam, paint cut through) + alligator cracking in the wheel paths
float bgPatch = 0.0;
if (kind != 1.0) { float li = floor(au / 3.5); float pv = fract(v / 21.0 + li * 0.37) * 21.0; float pc = floor(v / 21.0 + li * 0.37);
  vec2 hp = vec2(h12(vec2(pc, li + 3.0)), h12(vec2(pc + 7.1, li))); float uu = au - li * 3.5;
  float a0 = 3.0 + hp.x * 8.0, a1 = a0 + 2.2 + hp.y * 5.0, b0 = 0.3 + hp.y * 0.8, b1 = b0 + 1.4 + hp.x * 1.2;
  float inP = step(a0, pv) * step(pv, a1) * step(b0, uu) * step(uu, b1) * step(h12(vec2(pc, li + 11.0)), 0.3);
  float edge = min(min(pv - a0, a1 - pv), min(uu - b0, b1 - uu));
  bgPatch = inP; asph = mix(asph, asph * vec3(0.66, 0.66, 0.7), inP); asph *= 1.0 - inP * smoothstep(0.06, 0.0, edge) * 0.55;
  paintMask *= 1.0 - inP * 0.7;
  float trk = smoothstep(0.3, 0.12, abs(lanePos - 0.25)) * (1.0 - inP);
  vec2 cq = vRW.xz * 2.2; vec2 ci = floor(cq), cf = fract(cq); float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)); vec2 pp = o + vec2(h12(ci + o), h12(ci + o + 17.0)) - cf; float dd = dot(pp, pp); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; }
  float net = smoothstep(0.07, 0.0, sqrt(d2) - sqrt(d1)) * trk * smoothstep(0.55, 0.75, vnoise(vRW.xz * 0.08 + 5.0));
  asph = mix(asph, asph * 0.5, net * 0.85); }
` : ``}vec3 col = mix(asph, wpaint > ypaint ? paintW : paintY, paintMask);
col = mix(col, vec3(0.16, 0.42, 0.20) * (0.8 + 0.3 * wear), bikeG * (0.7 + 0.3 * smoothstep(0.2, 0.7, wear)));
paintMask = max(paintMask, bikeG * 0.8);
// wet: darker, puddles
float pud = smoothstep(${CYBER ? '0.48, 0.62' : '0.56, 0.68'}, vnoise(vRW.xz * 0.11) * 0.7 + vnoise(vRW.xz * 0.6) * 0.3 + tracks * 0.6); // vis-sweep A: fewer puddles (the whole night road read as a flooded mirror)
${BG ? `// b_ground: water collects at the drain inlets (positions = ground.js drainAt) and in the gutter along the kerb
if (kind == 0.0 || kind == 2.0) { float hwd = kind == 0.0 ? 7.0 : 4.5; float sd = step(0.0, u); float vv = v - sd * 15.0; float dc = floor(vv / 30.0);
  float dh = fract(dc * 0.6180339887 + sd * 0.37 + fract(L * 0.0137)), dh2 = fract(dc * 0.4142135 + sd * 0.71 + fract(L * 0.0291));
  float vd = (dc + 0.5 + (dh - 0.5) * 0.5) * 30.0; float ed = min(vd + sd * 15.0, L - vd - sd * 15.0);
  float rq = length(vec2((vv - vd) * 0.5, (au - (hwd - 0.3)) * 0.95)) + (vnoise(vRW.xz * 1.4) - 0.5) * 0.45;
  float dpud = smoothstep(1.05, 0.6, rq) * step(0.18, dh2) * step(8.0, ed);
  float gut = smoothstep(hwd - 1.1, hwd - 0.3, au) * smoothstep(0.5, 0.72, vnoise(vRW.xz * 0.32 + 9.0)) * step(5.4, min(v, L - v));
  pud = max(pud, max(dpud, gut * 0.9)); }
` : ``}float wet = uWet;
col *= mix(1.0, 0.45, wet);
diffuseColor.rgb = col;
float paintF = paintMask;
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
roughnessFactor = clamp(texelRoughness.g * 1.05, 0.55, 1.0) - tracks * 0.25;
roughnessFactor = mix(roughnessFactor, 0.55, paintF);
roughnessFactor = mix(roughnessFactor, mix(${CYBER ? '0.32' : '0.42'}, ${CYBER ? '0.11' : '0.07'}, pud), wet); // vis-sweep A: 0.32/0.03 -> 0.42/0.07 (damp asphalt, not glass) // r6.1 B: puddles 0.03 -> 0.11 (lamp specular was a tiny over-bright hot spot)
`)
      .replace('#include <normal_fragment_maps>', `
#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, max(paintF * 0.7, wet * pud)));
`)
      .replace('#include <emissivemap_fragment>', `
#include <emissivemap_fragment>
if (uReflOn > 0.5 && wet > 0.01) {
  vec4 rc = uReflMat * vec4(vRW, 1.0);
  vec2 ruv = rc.xy / rc.w + normal.xz * 0.02 * (1.0 - pud);
  // wet asphalt is not a mirror: smear the reflection along the view's vertical (classic streaky night reflections of
  // lamps, signals and neon), sharper in puddles
  float sm = mix(${CYBER ? '0.022' : '0.032'}, 0.006, pud);
  vec3 rcol = texture2D(tRefl, ruv).rgb * 0.28
    + (texture2D(tRefl, ruv + vec2(0.0, sm)).rgb + texture2D(tRefl, ruv - vec2(0.0, sm)).rgb) * 0.22
    + (texture2D(tRefl, ruv + vec2(0.0, sm * 2.6)).rgb + texture2D(tRefl, ruv - vec2(0.0, sm * 2.6)).rgb) * 0.14;
  rcol = min(rcol, vec3(12.0));
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
  totalEmissiveRadiance += rcol * wet * mix(${CYBER ? '0.16' : '0.08'}, ${CYBER ? '0.6' : '0.5'}, pud) * clamp(fres * 1.0 + 0.06, 0.0, 1.0);
}
// light2 wet-road lamp streaks (independent of the mirror pass): the mirror direction of the view ray is compared with the
// direction to each nearby lamp head; a narrow-horizontal / long-vertical lobe gives the elongated streaks of light a wet
// road shows under street lamps (sharp in puddles, long and soft on damp asphalt). Warm sodium/LED on 索拉纳港, neon tints on 霓港.
if (wet > 0.01) {
  vec3 V = normalize(vRW - cameraPosition); vec3 R = vec3(V.x, -V.y, V.z); vec2 rh = normalize(R.xz + 1e-5);
  float sh = mix(0.030, 0.010, pud), sv = mix(${CYBER ? '0.30' : '0.24'}, 0.07, pud) * (1.0 + (1.0 - paintF) * 0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    vec4 lp = uLampP[i]; if (lp.w <= 0.0) continue;
    vec3 d = lp.xyz - vRW; float dl = length(d); d /= dl;
    float dh = length(rh - normalize(d.xz + 1e-5));             // ~ azimuth error (rad)
    float dv = asin(clamp(R.y, -1.0, 1.0)) - asin(clamp(d.y, -1.0, 1.0));
    acc += uLampC[i] * lp.w * exp(-dh * dh / (sh * sh) - dv * dv / (sv * sv)) * smoothstep(110.0, 50.0, dl);
  }
  float fr2 = 0.04 + 0.96 * pow(1.0 - clamp(-V.y, 0.0, 1.0), 5.0);
  totalEmissiveRadiance += acc * wet * mix(${CYBER ? '0.55, 1.6' : '0.30, 1.0'}, pud) * clamp(fr2 * 1.6 + 0.12, 0.0, 1.0) * (1.0 - paintF * 0.5);
}
`);
  });
}

export function simpleMats(T) {
  const side = texSet(T, 'sidewalk', 1); for (const t of [side.map, side.normalMap, side.roughnessMap]) t.repeat.set(1 / 3, 1 / 3);
  M.sidewalk = prep(new THREE.MeshStandardMaterial({ map: side.map, normalMap: side.normalMap, roughnessMap: side.roughnessMap, color: 0xffffff, roughness: 1 }), 'sidewalk', (s) => {
    s.uniforms.uWet = U.uWet;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWet;' + (BG ? HASH : ''))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, uWet);\ndiffuseColor.rgb *= mix(1.0, 0.6, uWet);\n{ vec2 g = abs(fract(vSWP.xz / 1.6) - 0.5); float j = smoothstep(0.485, 0.497, max(g.x, g.y)); diffuseColor.rgb *= 1.0 - j * 0.35; }' + (CYBER ? (BG ? `
{ // r6.4 b_ground 霓港 pavers: slab-to-slab tone, dirtier / wider joints in places, replaced (lighter) and cracked slabs, oily stains
  vec2 sp = vSWP.xz; vec2 cl = floor(sp / 1.6); float hs = h12(cl + 41.0), hs2 = h12(cl + 93.0); vec2 lc = fract(sp / 1.6);
  diffuseColor.rgb *= 0.9 + 0.2 * hs; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.17, 1.13), step(0.93, hs2));
  vec2 g2 = abs(lc - 0.5); float jw = 0.485 - 0.012 * step(0.6, vnoise(sp * 0.7)); float jd = smoothstep(jw, jw + 0.01, max(g2.x, g2.y)); diffuseColor.rgb *= 1.0 - jd * 0.22 * vnoise(sp * 2.3 + 4.0);
  float ck = step(0.8, hs) * smoothstep(0.014, 0.0, abs(lc.y - 0.5 - 0.22 * sin(lc.x * 5.0 + hs * 30.0))) * step(abs(lc.x - 0.5), 0.25 + 0.25 * hs2); diffuseColor.rgb *= 1.0 - ck * 0.45;
  float stn = smoothstep(0.62, 0.8, vnoise(sp * 0.45 + 2.0)) * smoothstep(0.4, 0.7, vnoise(sp * 3.1)); diffuseColor.rgb *= 1.0 - stn * 0.25; roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, stn); }` : '') : `
{ // r6.3 索拉纳港 pavement wear: dark joint-sealant lines get dirtier, flattened gum spots, drip / coffee stains, a few hairline cracks per slab
  vec2 sp = vSWP.xz; vec2 cl = floor(sp / 1.6); float hs = fract(sin(dot(cl, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 gq = sp * 7.0; vec2 gi = floor(gq); float gh = fract(sin(dot(gi, vec2(41.3, 289.1))) * 15731.7); float gum = step(0.993, gh) * smoothstep(0.32, 0.18, length(fract(gq) - 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, gum);
  vec2 sq = sp * 0.55; vec2 si = floor(sq); float sh = fract(sin(dot(si, vec2(7.7, 113.3))) * 9134.1); float stain = step(0.82, sh) * smoothstep(0.42, 0.1, length(fract(sq) - 0.5 + (sh - 0.9) * 0.4));
  diffuseColor.rgb *= 1.0 - stain * 0.16;
  vec2 lc = fract(sp / 1.6); float ck = step(0.72, hs) * smoothstep(0.012, 0.0, abs(lc.y - 0.5 - 0.25 * sin(lc.x * 6.0 + hs * 20.0)) ) * step(abs(lc.x - 0.5), 0.3 + 0.2 * hs);
  diffuseColor.rgb *= 1.0 - ck * 0.35; }`))
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec3 vSWP;');
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWP;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSWP = (modelMatrix * vec4(position,1.0)).xyz;');
  });
  const pav = texSet(T, 'pavers', 1); for (const t of [pav.map, pav.normalMap, pav.roughnessMap]) t.repeat.set(1 / 2.5, 1 / 2.5);
  M.pavers = prep(new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, roughnessMap: pav.roughnessMap, color: 0xffffff, roughness: 1, ...(CYBER ? { polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -2 } : {}) }), 'pavers');
  const conc = texSet(T, 'concrete', 1); for (const t of [conc.map, conc.normalMap, conc.roughnessMap]) t.repeat.set(1 / 4, 1 / 4);
  M.concrete = prep(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.roughnessMap, color: 0xffffff, roughness: 1 }), 'concrete');
  const sand = texSet(T, 'sand', 1); for (const t of [sand.map, sand.normalMap, sand.roughnessMap]) t.repeat.set(1 / 6, 1 / 6);
  if (CYBER) {
  // v4.5: sand albedo 1.22 -> 0.98 (noon beach no longer glares), dune-scale tone variation, wind ripples (normal), a wrack line
  // of dark debris at the high-water mark, wet sand darker + glossier toward the sea
  M.sand = prep(new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normalMap, roughnessMap: sand.roughnessMap, color: new THREE.Color().setRGB(0.90, 0.86, 0.78), roughness: 1 }), 'sand', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSandW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSandW = (modelMatrix*vec4(position,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSandW;' + HASH)
      .replace('#include <map_fragment>', `#include <map_fragment>
float vSandY = vSandW.y; float wetS = smoothstep(-0.55, -0.9, vSandY);
float dune = vnoise(vSandW.xz * 0.025) * 0.6 + vnoise(vSandW.xz * 0.11) * 0.4;
diffuseColor.rgb *= mix(vec3(0.93, 0.90, 0.85), vec3(1.04, 1.0, 0.94), dune);
float wrack = smoothstep(0.12, 0.0, abs(vSandY + 0.42)) * smoothstep(0.45, 0.75, vnoise(vSandW.xz * vec2(0.6, 0.15)));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.19, 0.12), wrack * 0.55);
diffuseColor.rgb *= mix(1.0, 0.55, wetS);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float rp = sin(vSandW.x * 2.6 + vnoise(vSandW.xz * 0.3) * 6.0) * (1.0 - wetS) * 0.12; normal = normalize(normal + (viewMatrix * vec4(rp, 0.0, rp * 0.3, 0.0)).xyz); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, wetS);');
  });
  } else {
  M.sand = prep(new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normalMap, roughnessMap: sand.roughnessMap, color: new THREE.Color().setRGB(1.22, 1.18, 1.10), roughness: 1 }), 'sand', (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSandY;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSandY = (modelMatrix*vec4(position,1.0)).y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSandY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat wetS = smoothstep(-0.55, -0.9, vSandY); diffuseColor.rgb *= mix(1.0, 0.55, wetS);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, wetS);');
  });
  }
  const grass = texSet(T, 'grass', 1); for (const t of [grass.map, grass.normalMap, grass.roughnessMap]) t.repeat.set(1 / 4, 1 / 4);
  // v4.5 lawns: a second texture scale + world-space macro noise (greener swales, sun-dried patches, worn earth) kills the tiling
  const lawn = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvLW = (modelMatrix*vec4(position,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;' + HASH).replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 t2 = texture2D(map, vMapUv * 0.27 + 0.43).rgb; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + t2 * 0.5, 0.5);
  float m = vnoise(vLW.xz * 0.013) * 0.6 + vnoise(vLW.xz * 0.06) * 0.3 + vnoise(vLW.xz * 0.31) * 0.1;
  diffuseColor.rgb *= mix(vec3(0.82, 0.95, 0.74), vec3(1.18, 1.08, 0.78), smoothstep(0.3, 0.75, m));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.30, 0.22), smoothstep(0.80, 0.9, vnoise(vLW.xz * 0.09 + 7.0)) * 0.3);${CYBER ? '' : `
  // vis-sweep (map A, GTA6 Florida look): St. Augustine lawns read olive / sun-bleached, not lime -> 25% desaturate, warmer
  { float gl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(vec3(gl), diffuseColor.rgb, 0.75) * vec3(1.03, 0.97, 0.88); }`} }`);
  };
  M.grass = prep(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, color: 0xffffff, roughness: 1 }), 'grass', lawn); // vis-sweep: lawn macro-variation on both maps (map A lawns were one flat tiled green, aerials showed the 4 m tile)
  // v4.4 land caps under the open world: pushed back in depth so district pavers / roads drawn just above never z-fight from the air
  const po = { polygonOffset: false }; // v4.5: was 3 / 12 -> at grazing distances the caps fell behind the water plane 1 m below (white 'shallows' instead of land)
  M.land = prep(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, color: new THREE.Color().setRGB(0.92, 0.95, 0.86), roughness: 1, ...po }), 'grass', lawn);
  M.landc = prep(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.roughnessMap, color: 0xffffff, roughness: 1, ...po }), 'concrete');
  // r5.0 mainland / pearl-island ground: sits 6 cm below the road ribbons (polygonOffset pushed it behind the water at grazing angles)
  // vis-sweep: the district ground showed as hectares of bare grey concrete between the lots (aerials looked unfinished) ->
  // world-space mix of worn concrete, gravel/dirt and patchy lawn (vacant lots / yards), macro tone so the 4 m tile never repeats
  M.mgroundC = prep(new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughnessMap: conc.roughnessMap, color: 0xaaa69e, roughness: 1 }), 'mgc', (s) => {
    s.uniforms.tG = { value: grass.map };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvLW = (modelMatrix*vec4(position,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tG; varying vec3 vLW;' + HASH).replace('#include <map_fragment>', `#include <map_fragment>
{ float m = vnoise(vLW.xz * 0.017) * 0.65 + vnoise(vLW.xz * 0.08) * 0.25 + vnoise(vLW.xz * 0.5) * 0.1;
  vec3 g = texture2D(tG, vLW.xz * 0.25).rgb * mix(vec3(0.80, 0.92, 0.70), vec3(1.10, 1.02, 0.74), vnoise(vLW.xz * 0.05 + 3.0));
  vec3 dirt = vec3(0.33, 0.30, 0.25) * (0.85 + 0.3 * vnoise(vLW.xz * 0.7));
  diffuseColor.rgb *= 0.84 + 0.2 * vnoise(vLW.xz * 0.03 + 9.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, dirt, smoothstep(0.36, 0.46, m) * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, g, smoothstep(0.44, 0.56, m)); }`);
  });
  // r6.3 (ground_a): mainland open ground — big dry-grass / bare-soil swathes break the lawn up from the air, and beyond the modelled
  // city (x < -3600, |z| > 2900) a painted, footprint-anti-aliased city pattern (street grid, arterials, roof speckle, canopy) so the
  // horizon reads as more city instead of a green blanket
  const lawnA = (s) => { lawn(s); if (CYBER) return; s.uniforms.uNight = U.uNight; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; float gFarGlow = 0.0;').replace('#include <color_fragment>', `#include <color_fragment>
{ float dry = smoothstep(0.52, 0.78, vnoise(vLW.xz * 0.004 + 1.7) * 0.7 + vnoise(vLW.xz * 0.021) * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.28, 1.10, 0.70), dry * 0.6);
  float soil = smoothstep(0.70, 0.86, vnoise(vLW.xz * 0.012 + 5.3) * 0.65 + vnoise(vLW.xz * 0.09) * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.36, 0.27) * (0.85 + 0.3 * vnoise(vLW.xz * 0.5)), soil * 0.45);
  float far = max(smoothstep(-3590.0, -3680.0, vLW.x), smoothstep(2890.0, 2980.0, abs(vLW.z))) * step(vLW.x, -950.0);
  if (far > 0.0) {
    vec2 q = vLW.xz; vec2 cl = vec2(118.0, 104.0); vec2 g = abs(fract(q / cl) - 0.5) * cl; float rd = 1.0 - smoothstep(4.0, 6.0, min(g.x, g.y));
    vec2 art = vec2(472.0, 416.0); vec2 ga = abs(fract((q + 59.0) / art) - 0.5) * art; float ar = 1.0 - smoothstep(6.5, 9.0, min(ga.x, ga.y));
    float h = h12(floor(q / 16.0)); float hb = h12(floor(q / cl) + 7.0);
    vec3 roofC = h < 0.28 ? vec3(0.60, 0.37, 0.27) : h < 0.52 ? vec3(0.50, 0.50, 0.50) : h < 0.72 ? vec3(0.84, 0.82, 0.77) : vec3(0.19, 0.28, 0.12);
    vec2 inL = fract(q / 16.0); float bl = step(0.16, inL.x) * step(inL.x, 0.8) * step(0.18, inL.y) * step(inL.y, 0.74);
    vec3 blk = mix(diffuseColor.rgb, roofC, bl * step(0.18, hb));
    blk = mix(blk, vec3(0.34, 0.34, 0.35) + 0.25 * step(0.5, fract(q.x / 2.7)) * 0.0, step(hb, 0.12) * 0.85);
    vec3 cityC = mix(blk, vec3(0.21, 0.21, 0.22), max(rd, ar));
    float fw = length(fwidth(q)); vec3 avg = diffuseColor.rgb * 0.45 + vec3(0.40, 0.38, 0.35) * 0.55;
    cityC = mix(cityC, avg, smoothstep(5.0, 16.0, fw));
    diffuseColor.rgb = mix(diffuseColor.rgb, cityC, far);
    gFarGlow = far * mix(max(rd, ar * 1.6) * 0.9, 0.22, smoothstep(5.0, 16.0, fw)); } }`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += gFarGlow * uNight * vec3(1.0, 0.62, 0.3) * 0.5;'); };
  M.mgroundG = prep(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, color: 0xffffff, roughness: 1 }), 'mgg2', lawnA);
  M.pool = prep(new THREE.MeshStandardMaterial({ color: 0x2aa9bd, roughness: 0.06, metalness: 0.0, emissive: 0x0a3a44, emissiveIntensity: 0.6 }), 'pool');
  M.roof = prep(new THREE.MeshStandardMaterial({ map: conc.map, color: 0x9a948c, roughness: 0.95 }), 'roof');
  M.white = prep(new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.7, map: T.plaster_d }), 'whitep');
  M.metal = prep(new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.45, metalness: 0.85 }), 'metal');
  M.darkmetal = prep(new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 }), 'dmetal');
  M.glassRail = prep(new THREE.MeshStandardMaterial({ color: 0x8fb4b8, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.45 }), 'grail');
  M.neon = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, color: 0x222222 }), 'neon', (s) => {
    s.uniforms.uNight = U.uNight;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (0.25 + uNight * 5.0);');
  });
  // r6.1: building trims / piers / cornices / pylons (vertex-coloured relief geometry) were flat plastic next to the textured
  // walls -> tri-planar plaster (索拉纳港) / concrete (霓港) texture, macro colour noise, dirt at the foot, soot under ledges
  { const tpl = CYBER ? T.concrete_d : T.plaster_d; tpl.wrapS = tpl.wrapT = THREE.RepeatWrapping;
  M.vcol = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'vcol', (s) => {
    s.uniforms.tPl = { value: tpl };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVW; varying vec3 vVN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  { vec4 wq = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wq = instanceMatrix * wq;
  #endif
    vVW = (modelMatrix * wq).xyz; vVN = normalize(mat3(modelMatrix) * objectNormal); }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tPl; varying vec3 vVW; varying vec3 vVN;' + HASH)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 bw = pow(abs(vVN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 tx = texture2D(tPl, vVW.zy * 0.25).rgb * bw.x + texture2D(tPl, vVW.xz * 0.25).rgb * bw.y + texture2D(tPl, vVW.xy * 0.25).rgb * bw.z;
    float cl = dot(vColor.rgb, vec3(0.299, 0.587, 0.114)); float k = smoothstep(0.18, 0.55, cl);
    float mac = vnoise(vVW.xz * 0.07 + vVW.y * 0.05) * 0.6 + vnoise(vVW.xy * 0.9 + vVW.zz * 0.7) * 0.4;
    diffuseColor.rgb *= mix(vec3(1.0), clamp(tx / ${CYBER ? '0.44' : '0.63'}, 0.6, 1.25), 0.55 * k) * (0.92 + 0.14 * mac);
    diffuseColor.rgb *= 1.0 - smoothstep(${CYBER ? '1.2' : '0.8'}, 0.0, vVW.y) * 0.22 * k;           // splash / dust at the foot
    diffuseColor.rgb *= 1.0 - smoothstep(-0.2, -0.9, vVN.y) * 0.18;                                    // soffits / undersides darker
  }`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= 0.9 + 0.2 * vnoise(vVW.xz * 2.1 + vVW.y);');
  }); }
  M.vcolCloth = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 'vcolc');
  M.bark = prep(new THREE.MeshStandardMaterial({ map: T.bark_d, color: 0xb0a490, roughness: 0.95 }), 'bark');
  T.bark_d.colorSpace = THREE.SRGBColorSpace; T.bark_d.wrapS = T.bark_d.wrapT = THREE.RepeatWrapping;
  return M;
}
