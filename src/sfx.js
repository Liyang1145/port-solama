// Tiny synthesized audio (WebAudio): gunshots, horn, siren, engine hum, crash, alert
export class Sfx {
  constructor() { this.ctx = null; this.siren = null; this.engine = null; this.station = -1; this.nextBeat = 0; this.beat = 0; this.paused = false; }
  setPaused(p) {
    this.paused = !!p;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.paused ? 0 : 0.5, this.ctx.currentTime, 0.04);
    if (this.paused && this.ctx) this.radio(false);
  }
  resume() {
    try {
      if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); this.noiseBuf = this.makeNoise(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  }
  makeNoise() { const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  burst(dur, freq, gain, q = 0.7) {
    if (!this.ctx || this.ctx.state !== 'running' || !(gain > 0)) return; const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + dur);
  }
  shot(v = 1) { this.burst(0.25, 2500, 0.9 * v); this.burst(0.5, 400, 0.6 * v); }
  crash(v = 1) { this.burst(0.6, 900, 0.9 * v); }
  reload() { this.burst(0.05, 4000, 0.3); setTimeout(() => this.burst(0.05, 3000, 0.3), 500); }
  tone(f0, dur, type = 'square', gain = 0.15) {
    if (!this.ctx || this.ctx.state !== 'running' || !(gain > 0)) return; const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.value = f0; const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.setValueAtTime(gain, c.currentTime + dur * 0.8); g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur);
  }
  horn(v = 1) { this.tone(392, 0.45, 'sawtooth', 0.08 * v); this.tone(494, 0.45, 'sawtooth', 0.06 * v); }
  alert() { this.tone(880, 0.12, 'sine', 0.1); setTimeout(() => this.tone(660, 0.18, 'sine', 0.1), 130); }
  // v4.3 car radio: three original generative stations (latin groove / synth pop / slow late-night), scheduled ahead on the
  // audio clock; plays only while driving.
  setStation(i) {
    this.station = i; this.nextBeat = 0;
    if (this.radioBus && this.ctx) {
      // swap out the radio bus so previously scheduled long notes stop immediately on station change/mute
      const old = this.radioBus; const t = this.ctx.currentTime;
      old.gain.cancelScheduledValues(t); old.gain.setTargetAtTime(0, t, 0.02);
      setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 250);
      this.radioBus = null;
    }
  }
  note(f, t, dur, type, gain, cut = 3000) { const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.value = f; const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(fl); fl.connect(g); g.connect(this.radioBus); o.start(t); o.stop(t + dur + 0.05); }
  hit(t, freq, dur, gain) { const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = freq > 2000 ? 'highpass' : 'lowpass'; f.frequency.value = freq; const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(this.radioBus); s.start(t); s.stop(t + dur); }
  radio(on) {
    const c = this.ctx;
    if (!on || this.station < 0) {
      this.nextBeat = 0;
      if (this.radioBus) { const t = c.currentTime; this.radioBus.gain.cancelScheduledValues(t); this.radioBus.gain.setTargetAtTime(0, t, 0.03); }
      return;
    }
    if (!this.radioBus) { this.radioBus = c.createGain(); this.radioBus.gain.value = 0.22; this.radioBus.connect(this.master); }
    else { const t = c.currentTime; this.radioBus.gain.setTargetAtTime(0.22, t, 0.03); }
    const ST = [{ bpm: 104, root: 55, prog: [0, 5, 7, 5], wave: 'triangle' }, { bpm: 118, root: 49, prog: [0, 8, 3, 10], wave: 'sawtooth' }, { bpm: 76, root: 46.25, prog: [0, 3, 8, 7], wave: 'sine' }][this.station];
    const spb = 60 / ST.bpm / 2; if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
    while (this.nextBeat < c.currentTime + 0.25) {
      const t = this.nextBeat, b = this.beat++; const bar = Math.floor(b / 8) % 4; const r = ST.root * Math.pow(2, ST.prog[bar] / 12); const step = b % 8;
      if (this.station === 0) { if (step === 0 || step === 3 || step === 6) this.note(r, t, 0.22, 'triangle', 0.5, 900); if (step % 2 === 1) this.hit(t, 6000, 0.04, 0.2); if (step === 2 || step === 5 || step === 7) this.note(r * 4 * [1, 1.26, 1.5][step % 3], t, 0.12, 'square', 0.06, 2500); if (step === 4) this.hit(t, 800, 0.12, 0.3); }
      else if (this.station === 1) { if (step % 2 === 0) this.note(r, t, 0.2, 'sawtooth', 0.32, 700); if (step === 0 || step === 4) this.hit(t, 150, 0.2, 0.7); if (step === 2 || step === 6) this.hit(t, 3000, 0.1, 0.25); if (step % 4 === 0) for (const k of [2, 2.52, 3]) this.note(r * k * 2, t, spb * 3.5, 'sawtooth', 0.03, 1800); }
      else { if (step === 0) for (const k of [2, 2.38, 3, 3.56]) this.note(r * k * 2, t, spb * 7.5, 'sine', 0.05, 1500); if (step === 0 || step === 5) this.note(r, t, 0.5, 'sine', 0.4, 400); if (step === 4) this.hit(t, 4000, 0.06, 0.12); }
      this.nextBeat += spb;
    }
  }
  update(dt, s) {
    if (!this.ctx) return; const c = this.ctx;
    const muted = this.paused || (typeof document !== 'undefined' && document.hidden);
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, c.currentTime, 0.04);
    if (c.state !== 'running' || muted) { this.radio(false); return; }
    this.radio(!!s.car);
    // siren while wanted
    if (s.wanted > 0 && !this.siren) { const o = c.createOscillator(); o.type = 'sine'; const g = c.createGain(); g.gain.value = 0.035; o.connect(g); g.connect(this.master); o.start(); this.siren = { o, g, t: 0 }; }
    if (this.siren) { this.siren.t += dt; this.siren.o.frequency.value = 700 + Math.sin(this.siren.t * 4) * 260; if (s.wanted === 0) { this.siren.o.stop(); this.siren = null; } }
    // engine
    if (s.car && !this.engine) { const o = c.createOscillator(); o.type = 'sawtooth'; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = c.createGain(); g.gain.value = 0.05; o.connect(f); f.connect(g); g.connect(this.master); o.start(); this.engine = { o, g }; }
    if (this.engine) { if (!s.car) { this.engine.o.stop(); this.engine = null; } else { const sp = s.speed; this.engine.o.frequency.value = 45 + (sp % 14) * 9 + sp * 1.5; this.engine.g.gain.value = 0.03 + Math.min(0.05, sp * 0.002); } }
  }
}
