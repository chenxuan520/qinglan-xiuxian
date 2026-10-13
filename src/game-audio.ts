import { assetUrl } from './asset-url.ts';
import type { SaveData } from './progress.ts';

type SoundState = Pick<SaveData, 'sound' | 'volume'>;
type AudioPlatform = {
  createContext(): AudioContext;
  createMusic(source: string): HTMLAudioElement;
};
const browserAudio: AudioPlatform = {
  createContext: () => new AudioContext(),
  createMusic: (source) => new Audio(source),
};

const SOUND_GAPS: Record<string, number> = { cast: 0.3, pickup: 0.045, elite: 0.08, iron: 0.1 };
const PICKUP_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

/** 持有唯一音乐源和音效输出；构造时不创建音源或开始播放。 */
export class GameAudio {
  private readonly settings: SoundState;
  private readonly platform: AudioPlatform;
  private audio: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicStarting = false;
  private pickupStreak = 0;
  private readonly lastSounds: Record<string, number> = {};

  constructor(settings: SoundState, platform: AudioPlatform = browserAudio) {
    this.settings = settings;
    this.platform = platform;
  }

  private tone(
    frequency: number,
    start: number,
    length: number,
    volume: number,
    type: OscillatorType = 'sine',
    glide = 1,
  ) {
    const osc = this.audio!.createOscillator(),
      gain = this.audio!.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (glide !== 1)
      osc.frequency.exponentialRampToValueAtTime(frequency * glide, start + length * 0.6);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }
  play(name: string) {
    if (!this.settings.sound || !this.audio || this.audio.state !== 'running') return;
    const now = this.audio.currentTime;
    const previous = this.lastSounds[name] ?? -Infinity;
    if (now - previous < (SOUND_GAPS[name] ?? 0.035)) return;
    this.lastSounds[name] = now;
    if (name === 'pickup') {
      // 连续拾取沿五声音阶逐级升高，停顿后回到起音。
      this.pickupStreak =
        now - previous < 0.4 ? Math.min(this.pickupStreak + 1, PICKUP_NOTES.length - 1) : 0;
      this.tone(PICKUP_NOTES[this.pickupStreak], now, 0.11, 0.014, 'triangle');
    } else if (name === 'evolve') {
      for (const [index, note] of [659.25, 987.77, 1318.51].entries())
        this.tone(note, now + index * 0.09, 0.9, 0.05);
    } else if (name === 'chest') {
      this.tone(1318.51, now, 0.7, 0.035);
      this.tone(1975.53, now + 0.06, 0.6, 0.02);
      this.tone(1760, now + 0.14, 0.8, 0.03);
    } else if (name === 'heal') {
      this.tone(659.25, now, 0.3, 0.03);
      this.tone(987.77, now + 0.08, 0.4, 0.03);
    } else if (name === 'iron') {
      this.tone(1567.98, now, 0.18, 0.02, 'triangle');
      this.tone(2349.32, now + 0.03, 0.12, 0.012, 'triangle');
    } else if (name === 'magnet') {
      this.tone(392, now, 0.45, 0.03, 'sine', 3);
    } else if (name === 'elite') {
      this.tone(150, now, 0.22, 0.07, 'sine', 0.4);
      this.tone(1200, now, 0.05, 0.012, 'triangle');
    } else if (name === 'boss') {
      this.tone(73.42, now, 0.9, 0.045, 'sine', 0.65);
      this.tone(146.83, now + 0.08, 0.65, 0.025, 'triangle', 0.75);
      this.tone(220, now + 0.18, 0.7, 0.015);
    } else if (name === 'loot') {
      this.tone(98, now, 1.4, 0.06);
      this.tone(196, now, 1.1, 0.035);
      this.tone(293.66, now, 0.9, 0.02);
      this.tone(1567.98, now + 0.12, 0.8, 0.025);
    } else this.genericSound(name, now);
  }
  private genericSound(name: string, now: number) {
    const notes: Record<string, number> = {
      cast: 440,
      hurt: 110,
      upgrade: 660,
      breakthrough: 784,
      select: 880,
      lightning: 160,
      boss: 98,
      win: 1046,
      lose: 147,
    };
    this.tone(
      notes[name] || 523,
      now,
      0.35,
      name === 'cast' ? 0.015 : 0.06,
      name === 'hurt' ? 'triangle' : 'sine',
      name === 'hurt' ? 0.5 : 1.5,
    );
  }
  sync() {
    if (!this.settings.sound) {
      if (this.masterGain && this.audio)
        this.masterGain.gain.setTargetAtTime(0, this.audio.currentTime, 0.02);
      this.music?.pause();
      return;
    }
    this.audio ??= this.platform.createContext();
    if (!this.masterGain) {
      this.masterGain = this.audio.createGain();
      this.masterGain.connect(this.audio.destination);
    }
    this.masterGain.gain.setTargetAtTime(this.settings.volume, this.audio.currentTime, 0.02);
    if (!this.music) {
      this.music = this.platform.createMusic(assetUrl('assets/audio/qinglan-mist.m4a'));
      this.music.loop = true;
      const musicGain = this.audio.createGain();
      musicGain.gain.value = 0.4;
      this.audio.createMediaElementSource(this.music).connect(musicGain);
      musicGain.connect(this.masterGain);
    }
    // 音乐独立加载，不阻塞场景；播放被浏览器拦截时，在下次操作重试。
    if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {});
    if (this.music.paused && !this.musicStarting) {
      this.musicStarting = true;
      void this.music
        .play()
        .catch(() => {})
        .finally(() => {
          this.musicStarting = false;
        });
    }
  }
}
