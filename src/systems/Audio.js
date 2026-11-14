// Small synthesised sound set (no audio files). Starts on the first click, as browsers require.
export class Audio {
  constructor(game) {
    this.game = game; this.ctx = null; this.muted = false;
    game.events.on('sfx', (name) => this.play(name));
  }
  start() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator(); this.engine.type = 'sawtooth';
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engine.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engine.start();
    } catch { this.ctx = null; }
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  play(name) {
    const s = { open: [300, 0.08, 'triangle', 0.15, 80], pick: [660, 0.07, 'triangle', 0.15, 200], craft: [440, 0.15, 'triangle', 0.2, 300], fit: [180, 0.12, 'square', 0.15, -60],
      pour: [240, 0.3, 'sine', 0.2, 120], swing: [220, 0.1, 'sawtooth', 0.08, -120], hit: [120, 0.12, 'square', 0.25, -70], bite: [90, 0.18, 'sawtooth', 0.25, -40],
      crash: [70, 0.3, 'sawtooth', 0.35, -30], fail: [140, 0.25, 'square', 0.15, -60], start: [90, 0.4, 'sawtooth', 0.2, 60], stop: [110, 0.3, 'sawtooth', 0.12, -60], goal: [520, 0.35, 'triangle', 0.2, 260] }[name];
    if (s) this.tone(...s);
  }
  update() {
    if (!this.ctx) return;
    const v = this.game.vehicle, on = v.engineOn;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(48 + Math.abs(v.speed()) * 4.5 + v.throttle * 22, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.1 + v.throttle * 0.1 : 0, t, 0.1);
  }
}
