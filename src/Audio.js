/* ---------------- AUDIO (Web Audio API, 100 % procédural) ---------------- */
export const A = {
  ctx: null, noise: null, master: null,
  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      this.ambient();
    } catch (e) {}
  },
  t() { return this.ctx.currentTime; },
  env(g, a, peak, dur) {
    const t = this.t();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  osc(type, f0, f1, dur, peak) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(f0, 1), this.t());
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), this.t() + dur);
    this.env(g, 0.012, peak || 0.2, dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.t() + dur + 0.06);
  },
  burst(dur, f, type, peak) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const fl = this.ctx.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.value = f || 1000;
    const g = this.ctx.createGain();
    this.env(g, 0.006, peak || 0.22, dur);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(); s.stop(this.t() + dur + 0.06);
  },
  ambient() {
    const mk = (f, det, vol) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = det;
      g.gain.value = vol; o.connect(g); g.connect(this.master); o.start();
    };
    mk(55, 0, 0.045); mk(82.5, 7, 0.026); mk(110, -6, 0.018);
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 300;
    const g = this.ctx.createGain(); g.gain.value = 0.045;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start();
  },
  step() { this.burst(0.06, 650, 'bandpass', 0.11); },
  jump() { this.burst(0.05, 950, 'bandpass', 0.06); },
  bolt() { this.osc('sawtooth', 720, 120, 0.28, 0.13); this.burst(0.14, 2600, 'highpass', 0.07); },
  hostileBolt() { this.osc('sawtooth', 190, 55, 0.34, 0.17); this.burst(0.2, 520, 'lowpass', 0.14); },
  impact() { this.burst(0.18, 850, 'lowpass', 0.24); },
  hurt() { this.osc('square', 210, 65, 0.32, 0.2); },
  die() { this.osc('sawtooth', 300, 38, 0.6, 0.17); this.burst(0.4, 480, 'lowpass', 0.2); },
  pickup() { this.osc('sine', 780, 790, 0.14, 0.14); setTimeout(() => this.osc('sine', 1170, 1180, 0.22, 0.14), 90); },
  power() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.osc('sine', f, f + 2, 0.5, 0.13), i * 110)); },
  lever() { this.burst(0.12, 300, 'lowpass', 0.3); this.osc('square', 110, 68, 0.16, 0.11); },
  door() { this.burst(1.1, 170, 'lowpass', 0.3); },
  dash() { this.burst(0.24, 2100, 'highpass', 0.15); },
  shield() { this.osc('sine', 290, 610, 0.5, 0.13); },
  key() { this.osc('triangle', 880, 1760, 0.35, 0.14); },
  alert() { this.osc('sawtooth', 150, 320, 0.24, 0.07); },
  talk() { this.osc('sine', 520, 560, 0.07, 0.06); }
};
