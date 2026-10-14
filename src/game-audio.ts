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
const P = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
type ToneSpec = [
  frequency: number,
  delay: number,
  length: number,
  volume: number,
  cutoff?: number,
  glide?: number,
];
type NoiseSpec = [
  length: number,
  volume: number,
  frequency: number,
  q: number,
  glide: number,
  delay?: number,
];
const EVOLVE_NOTES: ToneSpec[] = [P[2], 987.77, P[7]].flatMap((n, i) => [
  [n, i * 0.09, 0.9, 0.05],
  [n * 0.5, i * 0.09, 0.75, 0.018, n * 2.5],
]);
const SOUNDS: Record<string, [ToneSpec[], NoiseSpec[]?]> = {
  evolve: [EVOLVE_NOTES, [[0.55, 0.012, 1100, 2.5, 2.4]]],
  chest: [
    [
      [P[7], 0, 0.7, 0.035],
      [1975.53, 0.06, 0.6, 0.02],
      [P[9], 0.14, 0.8, 0.03],
    ],
    [[0.07, 0.01, 3200, 4, 0.7]],
  ],
  heal: [
    [
      [P[2], 0, 0.3, 0.03],
      [987.77, 0.08, 0.4, 0.03],
      [P[7], 0.14, 0.35, 0.014, 2800],
    ],
  ],
  iron: [
    [
      [P[8], 0, 0.18, 0.02, 4200],
      [2349.32, 0.03, 0.12, 0.012, 5200],
    ],
    [[0.045, 0.012, 3800, 5, 0.6]],
  ],
  magnet: [
    [
      [392, 0, 0.45, 0.03, 0, 3],
      [P[1], 0.04, 0.38, 0.014, 1800, 2],
    ],
    [[0.35, 0.008, 600, 2, 2.8]],
  ],
  elite: [
    [
      [150, 0, 0.22, 0.07, 0, 0.4],
      [1200, 0, 0.05, 0.012, 3000],
    ],
    [[0.14, 0.02, 420, 1.2, 0.35]],
  ],
  boss: [
    [
      [73.42, 0, 0.9, 0.045, 0, 0.65],
      [146.83, 0.08, 0.65, 0.025, 900, 0.75],
      [220, 0.18, 0.7, 0.015],
    ],
    [[0.55, 0.022, 260, 1.5, 0.3]],
  ],
  loot: [
    [
      [98, 0, 1.4, 0.06],
      [196, 0, 1.1, 0.035],
      [293.66, 0, 0.9, 0.02, 1200],
      [P[8], 0.12, 0.8, 0.025],
      [2349.32, 0.18, 0.65, 0.012],
    ],
    [[0.25, 0.014, 900, 1.8, 0.4]],
  ],
  cast: [[[440, 0, 0.16, 0.015, 1600, 1.12]], [[0.075, 0.007, 1800, 2.2, 0.45]]],
  hurt: [
    [
      [110, 0, 0.24, 0.055, 480, 0.48],
      [73.42, 0, 0.2, 0.035, 0, 0.5],
    ],
    [[0.11, 0.025, 340, 1.2, 0.3]],
  ],
  upgrade: [
    [
      [660, 0, 0.28, 0.045],
      [P[4], 0.07, 0.36, 0.04],
      [1320, 0.07, 0.24, 0.014, 3200],
    ],
  ],
  breakthrough: [
    [
      [784, 0, 0.55, 0.05],
      [392, 0, 0.65, 0.028, 1400],
      [987.77, 0.08, 0.55, 0.04],
      [P[6], 0.16, 0.7, 0.045],
    ],
    [[0.45, 0.01, 960, 2, 1.8]],
  ],
  select: [
    [
      [P[4], 0, 0.09, 0.035, 0, 0.94],
      [P[9], 0, 0.045, 0.01, 3600],
    ],
  ],
  lightning: [
    [
      [160, 0, 0.38, 0.055, 640, 0.32],
      [80, 0, 0.48, 0.04, 0, 0.45],
    ],
    [
      [0.09, 0.03, 1600, 1.4, 0.3],
      [0.45, 0.024, 240, 1.1, 0.3, 0.03],
    ],
  ],
  win: [
    [
      [1046, 0, 0.45, 0.045],
      [P[0], 0, 0.65, 0.024, 1800],
      [P[6], 0.08, 0.45, 0.04],
      [P[7], 0.16, 0.5, 0.045],
      [P[8], 0.25, 0.75, 0.05],
    ],
  ],
  lose: [
    [
      [147, 0, 0.45, 0.05, 520, 0.82],
      [110, 0.14, 0.55, 0.04, 0, 0.75],
    ],
  ],
  cache: [
    [
      [P[1], 0, 0.26, 0.03, 2200],
      [P[4], 0.06, 0.32, 0.03],
      [P[6], 0.12, 0.42, 0.028],
    ],
    [[0.05, 0.008, 2600, 3.5, 0.7]],
  ],
};
const noop = () => {};
const ramp = (param: AudioParam, from: number, to: number, start: number, end: number) => {
  param.setValueAtTime(from, start);
  if (to !== from) param.exponentialRampToValueAtTime(to, end);
};

/** 持有唯一音乐源和音效输出；构造时不创建音源或开始播放。 */
export class GameAudio {
  play: (name: string) => void;
  sync: () => void;

  constructor(settings: SoundState, platform: AudioPlatform = browserAudio) {
    let audio: AudioContext | null = null,
      master: GainNode | null = null,
      noiseBuffer: AudioBuffer | null = null,
      music: HTMLAudioElement | null = null,
      starting = false,
      streak = 0;
    const last: Record<string, number> = {};
    const emit = (
      source: AudioScheduledSourceNode,
      node: AudioNode,
      start: number,
      len: number,
      vol: number,
    ) => {
      const gain = audio!.createGain();
      ramp(gain.gain, 0.0001, vol, start, start + Math.min(0.01, len * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
      node.connect(gain);
      gain.connect(master!);
      source.start(start);
      source.stop(start + len + 0.02);
    };
    const filter = (
      input: AudioNode,
      type: BiquadFilterType,
      freq: number,
      endFreq: number,
      start: number,
      end: number,
      q = 1,
    ) => {
      const node = audio!.createBiquadFilter();
      node.type = type;
      ramp(node.frequency, freq, endFreq, start, end);
      node.Q.setValueAtTime(q, start);
      input.connect(node);
      return node;
    };
    const tone = (freq: number, start: number, len: number, vol: number, cutoff = 0, glide = 1) => {
      const osc = audio!.createOscillator();
      osc.type = cutoff > 0 ? 'triangle' : 'sine';
      ramp(osc.frequency, freq, freq * glide, start, start + len * 0.65);
      emit(
        osc,
        cutoff > 0
          ? filter(osc, 'lowpass', cutoff, Math.max(80, cutoff * 0.35), start, start + len)
          : osc,
        start,
        len,
        vol,
      );
    };
    const noise = (
      start: number,
      len: number,
      vol: number,
      freq: number,
      q: number,
      glide: number,
    ) => {
      if (!noiseBuffer) {
        noiseBuffer = audio!.createBuffer(1, 22050, 22050);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0, seed = 0x6d2b79f5; i < data.length; i++) {
          seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) + 0x9e3779b9) | 0;
          data[i] = ((seed ^ (seed >>> 14)) >>> 0) / 0x80000000 - 1;
        }
      }
      const source = audio!.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      emit(
        source,
        filter(
          source,
          freq < 500 ? 'lowpass' : 'bandpass',
          freq,
          freq * glide,
          start,
          start + len * 0.75,
          q,
        ),
        start,
        len,
        vol,
      );
    };
    this.play = (name) => {
      if (!settings.sound || !audio || audio.state !== 'running') return;
      const now = audio.currentTime,
        prev = last[name] ?? -Infinity;
      if (now - prev < (SOUND_GAPS[name] ?? 0.035)) return;
      last[name] = now;
      if (name === 'pickup') {
        streak = now - prev < 0.4 ? Math.min(streak + 1, P.length - 1) : 0;
        const note = P[streak];
        tone(note, now, 0.11, 0.014, note * 4);
        tone(note * 2, now, 0.055, 0.004);
        return;
      }
      const spec = SOUNDS[name];
      if (!spec) return tone(523, now, 0.35, 0.06, 0, 1.5);
      for (const [freq, delay, len, vol, cutoff, glide] of spec[0])
        tone(freq, now + delay, len, vol, cutoff, glide);
      for (const [len, vol, freq, q, glide, delay = 0] of spec[1] ?? [])
        noise(now + delay, len, vol, freq, q, glide);
    };
    this.sync = () => {
      if (!settings.sound) {
        if (master && audio) master.gain.setTargetAtTime(0, audio.currentTime, 0.02);
        music?.pause();
        return;
      }
      audio ??= platform.createContext();
      if (!master) {
        master = audio.createGain();
        master.connect(audio.destination);
      }
      master.gain.setTargetAtTime(settings.volume, audio.currentTime, 0.02);
      if (!music) {
        music = platform.createMusic(assetUrl('assets/audio/qinglan-mist.m4a'));
        music.loop = true;
        const gain = audio.createGain();
        gain.gain.value = 0.4;
        audio.createMediaElementSource(music).connect(gain);
        gain.connect(master);
      }
      if (audio.state === 'suspended') void audio.resume().catch(noop);
      if (music.paused && !starting) {
        starting = true;
        void music
          .play()
          .catch(noop)
          .finally(() => {
            starting = false;
          });
      }
    };
  }
}
