class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return !this.muted;
  }

  playTone(freq, type, duration, gainLevel = 0.05) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  playSpawn() {
    this.playTone(440, 'square', 0.08, 0.08);
    setTimeout(() => this.playTone(660, 'square', 0.08, 0.08), 80);
    setTimeout(() => this.playTone(880, 'square', 0.15, 0.08), 160);
  }

  playKeyClick() {
    // Subtle typing tick
    if (Math.random() < 0.25) {
      this.playTone(800 + Math.random() * 400, 'square', 0.02, 0.015);
    }
  }

  playTalk() {
    this.playTone(520 + Math.random() * 150, 'triangle', 0.05, 0.04);
  }

  playSleep() {
    this.playTone(220, 'sine', 0.3, 0.03);
  }

  playPoof() {
    // Noise/puff sound for disappearing
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    try {
      this.playTone(300, 'sawtooth', 0.1, 0.06);
      setTimeout(() => this.playTone(150, 'triangle', 0.15, 0.05), 50);
    } catch {}
  }
}

window.soundSystem = new RetroAudio();
