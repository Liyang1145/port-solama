// perf_debug1: frame profiler (?prof). Per frame: CPU ms per game system and per render stage, draw calls / triangles per
// render pass (shadow maps, water mirror, probes, composer passes), shader programs, JS heap, plus an anomaly probe
// (floating / sunk / stuck player, camera inside geometry, NaN). Off unless ?prof: the hooks below are not installed.
// Numbers from SwiftShader (headless) are only good for RELATIVE comparisons; calls / tris / programs are machine-independent.
export const PROF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('prof');
const T = {}; const C = {}; let cur = null;
export const prof = {
  on: PROF, T, C, frames: [], t0: 0, last: 0,
  // section timer: prof.mark('label') closes the section that started at the previous mark
  begin() { if (!PROF) return; for (const k in T) delete T[k]; for (const k in C) delete C[k]; this.t0 = this.last = performance.now(); },
  mark(label) { if (!PROF) return; const n = performance.now(); T[label] = (T[label] || 0) + n - this.last; this.last = n; },
  add(label, ms) { T[label] = (T[label] || 0) + ms; },
  count(label, n = 1) { C[label] = (C[label] || 0) + n; },
};
// wrap a method so its time lands in T[label] (works on prototypes and instances); nested wraps are self-time free
export function wrap(o, k, label) {
  if (!PROF || !o || typeof o[k] !== 'function' || o[k].__prof) return;
  const f = o[k]; const g = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[label] = (T[label] || 0) + performance.now() - t; } };
  g.__prof = 1; o[k] = g;
}
// renderer-level counters: every renderer.render() call, shadow map passes, per-pass draw calls / triangles
export function profRenderer(renderer) {
  if (!PROF) return;
  renderer.info.autoReset = false;
  const info = renderer.info.render;
  const r0 = renderer.render.bind(renderer);
  renderer.render = (s, c) => { const t = performance.now(); const k0 = info.calls, t0 = info.triangles; r0(s, c);
    const lbl = cur || 'render:other'; C[lbl + ':calls'] = (C[lbl + ':calls'] || 0) + info.calls - k0; C[lbl + ':tris'] = (C[lbl + ':tris'] || 0) + info.triangles - t0; C.renders = (C.renders || 0) + 1; T['gl:' + lbl] = (T['gl:' + lbl] || 0) + performance.now() - t; };
  const sm = renderer.shadowMap; const s0 = sm.render.bind(sm);
  sm.render = (lights, scene, cam) => { if (!(sm.enabled && (sm.autoUpdate || sm.needsUpdate))) return s0(lights, scene, cam); const k0 = info.calls, t0 = info.triangles; const t = performance.now(); s0(lights, scene, cam);
    C.shadowPasses = (C.shadowPasses || 0) + 1; C['shadow:calls'] = (C['shadow:calls'] || 0) + info.calls - k0; C['shadow:tris'] = (C['shadow:tris'] || 0) + info.triangles - t0; T.shadow = (T.shadow || 0) + performance.now() - t; };
}
export function scope(label, fn) { if (!PROF) return fn(); const k = cur; cur = label; try { return fn(); } finally { cur = k; } }
export function setScope(label) { const k = cur; cur = label; return k; }
export function profPasses(composer) {
  if (!PROF) return;
  for (const p of composer.passes) { const name = 'pass:' + (p.constructor.name || 'Pass') + (p.material && p.material.name ? ':' + p.material.name : '');
    const r0 = p.render.bind(p); p.render = (...a) => { const k = cur; cur = name; const t = performance.now(); try { return r0(...a); } finally { cur = k; T[name] = (T[name] || 0) + performance.now() - t; } }; }
}
