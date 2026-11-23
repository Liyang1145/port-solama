// marina_a: sheltered-water zones (finger canals, the 鹈鹕游艇港 basin) shared between marina.js (fills them while the city is
// built) and water.js (calmer, greener water, no surf line on the bulkheads). water.js is built before the city, so whichever
// side runs second copies the zones into the shader uniforms.
export const CALM_MAX = 20;
export const CALM = { zones: [], u: null };
export function setCalm(zones) { CALM.zones = zones.slice(0, CALM_MAX); syncCalm(); }
export function syncCalm() {
  if (!CALM.u) return; const { seg, hw, n } = CALM.u;
  CALM.zones.forEach((z, i) => { seg.value[i].set(z.A[0], z.A[1], z.B[0], z.B[1]); hw.value[i] = z.hw; });
  n.value = CALM.zones.length;
}
