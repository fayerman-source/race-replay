export class SfxManager {
  constructor() {
    this.enabled = true;
    this.audioContext = null;
    this.lastPlayed = {};
  }

  init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported:", e);
    }
  }

  ensureContext() {
    if (!this.audioContext) {
      this.init();
    }
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  playStartHorn() {
    if (!this.canPlay("start", 1000)) return;
    
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Create a horn-like sound (two tones)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = "sawtooth";
    osc2.type = "square";
    
    // Descending "ready set go" tone
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(440, now + 0.3);
    osc2.frequency.setValueAtTime(660, now);
    osc2.frequency.exponentialRampToValueAtTime(330, now + 0.3);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);

    this.lastPlayed["start"] = Date.now();
  }

  playLapBell() {
    if (!this.canPlay("bell", 2000)) return;
    
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Bell-like tone with harmonics
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    // High pitched bell
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(2000, now);
    
    // Harmonic
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(4000, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.0);
    osc2.stop(now + 1.0);

    this.lastPlayed["bell"] = Date.now();
  }

  playFinishWhistle() {
    if (!this.canPlay("finish", 500)) return;
    
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Whistle sound - rising then falling
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.linearRampToValueAtTime(2500, now + 0.2);
    osc.frequency.linearRampToValueAtTime(1500, now + 0.5);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    osc.start(now);
    osc.stop(now + 0.6);

    this.lastPlayed["finish"] = Date.now();
  }

  playCrowdCheer() {
    if (!this.canPlay("cheer", 3000)) return;
    
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Simulate crowd with noise
    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);

    this.lastPlayed["cheer"] = Date.now();
  }

  canPlay(key, cooldownMs) {
    const last = this.lastPlayed[key] || 0;
    return Date.now() - last > cooldownMs;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  isEnabled() {
    return this.enabled;
  }
}
