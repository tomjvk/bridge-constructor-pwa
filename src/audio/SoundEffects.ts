export class SoundEffects {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private isMuted = false;

  private initContext(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public unlock(): void {
    this.initContext();
  }

  /**
   * Tension Creak: modulated low-frequency groaning when strain exceeds 70%
   */
  public playCreak(intensity = 0.5): void {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140 + Math.random() * 60, now);
      osc.frequency.exponentialRampToValueAtTime(80 + Math.random() * 40, now + 0.35);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);

      const vol = Math.min(0.25, intensity * 0.2);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Audio errors safely swallowed
    }
  }

  /**
   * Structural Snap: sharp transient noise burst simulating wood or road snapping
   */
  public playSnap(): void {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.2; // 200ms
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(300, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
    } catch {
      // Audio errors safely swallowed
    }
  }

  /**
   * Continuous engine rumble matching vehicle speed
   */
  public startEngine(): void {
    this.initContext();
    if (!this.ctx || this.engineOsc || this.isMuted) return;

    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();

      this.engineOsc.type = 'triangle';
      this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

      this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch {
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  public updateEngine(speed: number): void {
    if (!this.ctx || !this.engineOsc) return;
    try {
      const freq = Math.max(45, Math.min(130, 45 + speed * 45));
      this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    } catch {
      // Audio errors safely swallowed
    }
  }

  public stopEngine(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      } catch {}
      this.engineOsc = null;
    }
    if (this.engineGain) {
      try {
        this.engineGain.disconnect();
      } catch {}
      this.engineGain = null;
    }
  }

  /**
   * Victory Fanfare: ascending arpeggio on level completion
   */
  public playWin(): void {
    this.initContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.45);
      });
    } catch {
      // Audio errors safely swallowed
    }
  }
}
