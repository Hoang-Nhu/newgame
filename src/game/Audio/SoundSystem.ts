import { CharacterClass } from '../types';

export class SoundSystem {
  private ctx: AudioContext | null = null;
  public muted = false;

  public unlock(): void {
    if (this.muted) return;
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

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public playComboAttack(charClass: CharacterClass, comboHit: 1 | 2 | 3): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    if (charClass === 'SwordMaster') {
      if (comboHit === 1) {
        this.playNoiseSweep(now, 0.11, 1400, 480, 0.08);
      } else if (comboHit === 2) {
        this.playNoiseSweep(now, 0.14, 1800, 560, 0.1);
      } else {
        // Hit 3: Rising knockup heavy slash + metallic ring
        this.playNoiseSweep(now, 0.22, 2200, 260, 0.13);
        this.playTone(now, 'triangle', 320, 680, 0.22, 0.09);
      }
    } else if (charClass === 'Tank') {
      if (comboHit === 1) {
        this.playTone(now, 'triangle', 160, 75, 0.13, 0.11);
      } else if (comboHit === 2) {
        this.playTone(now, 'sawtooth', 190, 65, 0.16, 0.09);
      } else {
        // Hit 3: Seismic stun slam
        this.playTone(now, 'sine', 140, 38, 0.34, 0.18);
        this.playNoiseSweep(now, 0.24, 520, 110, 0.12);
      }
    } else if (charClass === 'Archer') {
      if (comboHit === 1) {
        this.playTone(now, 'triangle', 760, 320, 0.09, 0.07);
      } else if (comboHit === 2) {
        this.playTone(now, 'triangle', 900, 420, 0.08, 0.06);
        this.playTone(now + 0.04, 'triangle', 980, 460, 0.08, 0.06);
      } else {
        // Hit 3: Frost slow heavy gale shot
        this.playTone(now, 'sine', 1240, 520, 0.22, 0.1);
        this.playNoiseSweep(now, 0.18, 2800, 900, 0.07);
      }
    } else if (charClass === 'Mage') {
      if (comboHit === 1) {
        this.playTone(now, 'sine', 520, 880, 0.11, 0.07);
      } else if (comboHit === 2) {
        this.playTone(now, 'sine', 640, 1040, 0.13, 0.08);
      } else {
        // Hit 3: Arcane detonation boom
        this.playTone(now, 'sawtooth', 420, 90, 0.26, 0.12);
        this.playTone(now, 'sine', 880, 220, 0.28, 0.09);
      }
    } else if (charClass === 'Support') {
      if (comboHit === 1) {
        this.playTone(now, 'sine', 660, 880, 0.12, 0.06);
      } else if (comboHit === 2) {
        this.playTone(now, 'sine', 784, 1046, 0.14, 0.07);
      } else {
        // Hit 3: Harmonic heal chime chord
        this.playTone(now, 'sine', 523.25, 523.25, 0.32, 0.08);
        this.playTone(now + 0.03, 'sine', 659.25, 659.25, 0.32, 0.07);
        this.playTone(now + 0.06, 'sine', 783.99, 1046.5, 0.34, 0.07);
      }
    } else {
      // Specialist
      if (comboHit === 1) {
        this.playNoiseSweep(now, 0.08, 3000, 1100, 0.06);
      } else if (comboHit === 2) {
        this.playNoiseSweep(now, 0.09, 3400, 950, 0.07);
        this.playTone(now, 'triangle', 920, 540, 0.09, 0.06);
      } else {
        // Hit 3: Void warp teleport strike
        this.playTone(now, 'sine', 300, 1280, 0.16, 0.09);
        this.playNoiseSweep(now + 0.05, 0.16, 2600, 420, 0.1);
      }
    }
  }

  private playTone(
    startTime: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    volume: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private playNoiseSweep(
    startTime: number,
    duration: number,
    startFreq: number,
    endFreq: number,
    volume: number
  ): void {
    if (!this.ctx) return;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, endFreq), startTime + duration);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(startTime);
    noise.stop(startTime + duration + 0.02);
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
