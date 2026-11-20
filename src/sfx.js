// Tiny synthesized audio (WebAudio): gunshots, horn, siren, engine hum, crash, alert
export class Sfx {
  constructor() { this.ctx = null; this.siren = null; this.engine = null; }
  resume() {
    try {
      if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); this.noiseBuf = this.makeNoise(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  }
  makeNoise() { const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  burst(dur, freq, gain, q = 0.7) {
    if (!this.ctx) return; const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + dur);
  }
  shot(v = 1) { this.burst(0.25, 2500, 0.9 * v); this.burst(0.5, 400, 0.6 * v); }
  crash(v = 1) { this.burst(0.6, 900, 0.9 * v); }
  reload() { this.burst(0.05, 4000, 0.3); setTimeout(() => this.burst(0.05, 3000, 0.3), 500); }
  tone(f0, dur, type = 'square', gain = 0.15) {
    if (!this.ctx) return; const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.value = f0; const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.setValueAtTime(gain, c.currentTime + dur * 0.8); g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur);
  }
  horn(v = 1) { this.tone(392, 0.45, 'sawtooth', 0.08 * v); this.tone(494, 0.45, 'sawtooth', 0.06 * v); }
  alert() { this.tone(880, 0.12, 'sine', 0.1); setTimeout(() => this.tone(660, 0.18, 'sine', 0.1), 130); }
  update(dt, s) {
    if (!this.ctx) return; const c = this.ctx;
    // siren while wanted
    if (s.wanted > 0 && !this.siren) { const o = c.createOscillator(); o.type = 'sine'; const g = c.createGain(); g.gain.value = 0.035; o.connect(g); g.connect(this.master); o.start(); this.siren = { o, g, t: 0 }; }
    if (this.siren) { this.siren.t += dt; this.siren.o.frequency.value = 700 + Math.sin(this.siren.t * 4) * 260; if (s.wanted === 0) { this.siren.o.stop(); this.siren = null; } }
    // engine
    if (s.car && !this.engine) { const o = c.createOscillator(); o.type = 'sawtooth'; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = c.createGain(); g.gain.value = 0.05; o.connect(f); f.connect(g); g.connect(this.master); o.start(); this.engine = { o, g }; }
    if (this.engine) { if (!s.car) { this.engine.o.stop(); this.engine = null; } else { const sp = s.speed; this.engine.o.frequency.value = 45 + (sp % 14) * 9 + sp * 1.5; this.engine.g.gain.value = 0.03 + Math.min(0.05, sp * 0.002); } }
  }
}
