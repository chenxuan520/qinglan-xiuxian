import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { GameAudio } from '../src/game-audio.ts';
import { SoundSettings } from '../src/sound-settings.ts';

function harness() {
  const state = { sound: false, volume: 0.37 };
  const gains: { value: number; targets: number[] }[] = [];
  const notes: { frequency: number; time: number; type: string; stop: number }[] = [];
  const filters: { type: string; frequency: number; q: number }[] = [];
  const noises: { time: number; stop: number; loop: boolean }[] = [];
  let contexts = 0;
  let musicSources = 0;
  let mediaNodes = 0;
  let buffers = 0;
  let plays = 0;
  let pauses = 0;
  let resumes = 0;
  let writes = 0;
  let source = '';
  let play: () => Promise<void> = async () => {
    music.paused = false;
  };
  const music = {
    loop: false,
    paused: true,
    pause() {
      pauses++;
      this.paused = true;
    },
    play() {
      plays++;
      return play();
    },
  };
  const context = {
    currentTime: 1,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    async resume() {
      resumes++;
      this.state = 'running';
    },
    createGain() {
      const gain = {
        value: 1,
        targets: [] as number[],
        setTargetAtTime(value: number) {
          this.targets.push(value);
        },
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      };
      gains.push(gain);
      return { gain, connect() {} };
    },
    createBiquadFilter() {
      const filter = { type: 'lowpass', frequency: 0, q: 1 };
      filters.push(filter);
      return {
        get type() {
          return filter.type;
        },
        set type(value: string) {
          filter.type = value;
        },
        frequency: {
          setValueAtTime(frequency: number) {
            filter.frequency = frequency;
          },
          exponentialRampToValueAtTime() {},
        },
        Q: {
          setValueAtTime(q: number) {
            filter.q = q;
          },
        },
        connect() {},
      };
    },
    createBuffer(_channels: number, length: number) {
      buffers++;
      const data = new Float32Array(length);
      return {
        getChannelData: () => data,
      };
    },
    createBufferSource() {
      const item = { time: 0, stop: 0, loop: false };
      return {
        buffer: null as unknown,
        loop: false,
        connect() {},
        start(time: number) {
          item.time = time;
          item.loop = this.loop;
          noises.push(item);
        },
        stop(time: number) {
          item.stop = time;
        },
      };
    },
    createMediaElementSource(element: unknown) {
      assert.equal(element, music);
      mediaNodes++;
      return { connect() {} };
    },
    createOscillator() {
      const note = { frequency: 0, time: 0, type: '', stop: 0 };
      return {
        type: '',
        frequency: {
          setValueAtTime(frequency: number, time: number) {
            Object.assign(note, { frequency, time });
          },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        start() {
          note.type = this.type;
          notes.push(note);
        },
        stop(time: number) {
          note.stop = time;
        },
      };
    },
  };
  const audio = new GameAudio(state, {
    createContext() {
      contexts++;
      return context as unknown as AudioContext;
    },
    createMusic(url: string) {
      musicSources++;
      source = url;
      return music as unknown as HTMLAudioElement;
    },
  });
  const settings = new SoundSettings(state, audio, () => writes++);
  return {
    state,
    audio,
    settings,
    music,
    context,
    gains,
    notes,
    filters,
    noises,
    setPlay: (next: () => Promise<void>) => (play = next),
    counts: () => ({
      contexts,
      musicSources,
      mediaNodes,
      buffers,
      plays,
      pauses,
      resumes,
      writes,
      source,
    }),
  };
}

test('静音初始化、普通音效与静音时调音量均不创建音乐；显式开声才开始播放', () => {
  const h = harness();
  h.audio.sync();
  h.audio.play('select');
  h.settings.setVolume(0.23);
  assert.equal(h.state.sound, false);
  assert.equal(h.counts().contexts, 0);
  assert.equal(h.counts().plays, 0);
  assert.equal(h.notes.length, 0);
  assert.equal(h.counts().writes, 1);

  h.settings.toggle();
  assert.equal(h.counts().contexts, 1);
  assert.equal(h.counts().musicSources, 1);
  assert.equal(h.counts().mediaNodes, 1);
  assert.equal(h.counts().plays, 1);
  assert.match(h.counts().source, /\/assets\/audio\/qinglan-mist\.m4a(?:\?|$)/);
  assert.equal(h.music.loop, true);
  assert.deepEqual(h.gains[0].targets, [0.23]);
  assert.equal(h.gains[1].value, 0.4);
});

test('总音量和静音同时作用于同一音乐输出，切换与存档内容替换不重复创建音源', async () => {
  const h = harness();
  h.settings.setEnabled(true, true);
  await setImmediate();
  assert.equal(h.notes.length, 2);
  h.settings.setVolume(0);
  assert.equal(h.state.sound, true);
  assert.equal(h.state.volume, 0);
  h.settings.setEnabled(false, true);
  assert.equal(h.music.paused, true);
  h.audio.play('boss');
  assert.equal(h.notes.length, 2);
  assert.equal(h.state.volume, 0);
  h.settings.toggle();
  await setImmediate();
  assert.equal(h.state.volume, 0, '普通开启声音保留零音量');
  Object.assign(h.state, { volume: 0.71 });
  h.audio.sync();
  assert.deepEqual(h.gains[0].targets, [0.37, 0, 0, 0, 0.71]);
  assert.equal(h.counts().contexts, 1);
  assert.equal(h.counts().musicSources, 1);
  assert.equal(h.counts().mediaNodes, 1);
  assert.equal(h.counts().plays, 2);
});

test('播放未完成时不重复请求，被浏览器拒绝后可在下一次操作重试', async () => {
  const h = harness();
  let reject!: (reason: Error) => void;
  h.setPlay(() => new Promise<void>((_, fail) => (reject = fail)));
  h.context.state = 'suspended';
  h.settings.setEnabled(true);
  h.audio.sync();
  h.settings.setVolume(0.28);
  assert.equal(h.counts().resumes, 1);
  assert.equal(h.counts().plays, 1);
  reject(new Error('NotAllowedError'));
  await setImmediate();
  assert.equal(h.state.sound, true);
  h.setPlay(async () => {
    h.music.paused = false;
  });
  h.audio.sync();
  await setImmediate();
  assert.equal(h.music.paused, false);
  assert.equal(h.counts().plays, 2);
  assert.equal(h.counts().contexts, 1);
});

test('暂停的音频上下文不播放音效，恢复后连续拾取保持原音阶与节流规则', () => {
  const h = harness();
  h.settings.setEnabled(true);
  h.context.state = 'suspended';
  h.audio.play('pickup');
  assert.equal(h.notes.length, 0);
  h.context.state = 'running';
  h.audio.play('pickup');
  h.context.currentTime += 0.02;
  h.audio.play('pickup');
  assert.equal(h.notes.length, 2);
  h.context.currentTime += 0.08;
  h.audio.play('pickup');
  h.context.currentTime += 0.5;
  h.audio.play('pickup');
  assert.deepEqual(
    h.notes.map((note) => note.frequency),
    [523.25, 1046.5, 587.33, 1174.66, 523.25, 1046.5],
  );
  assert.ok(h.notes.every((note) => note.stop > note.time));
  h.audio.play('cast');
  h.context.currentTime += 0.2;
  h.audio.play('cast');
  assert.equal(h.notes.length, 7);
  h.context.currentTime += 0.11;
  h.audio.play('cast');
  assert.equal(h.notes.length, 8);
});

test('多音效编排、滤波泛音与复用的噪声层互不共享节流时间', () => {
  const h = harness();
  h.settings.setEnabled(true);
  const cases = new Map([
    ['evolve', { notes: [659.25, 329.625, 987.77, 493.885, 1318.51, 659.255], noises: 1 }],
    ['chest', { notes: [1318.51, 1975.53, 1760], noises: 1 }],
    ['heal', { notes: [659.25, 987.77, 1318.51], noises: 0 }],
    ['iron', { notes: [1567.98, 2349.32], noises: 1 }],
    ['magnet', { notes: [392, 587.33], noises: 1 }],
    ['elite', { notes: [150, 1200], noises: 1 }],
    ['boss', { notes: [73.42, 146.83, 220], noises: 1 }],
    ['loot', { notes: [98, 196, 293.66, 1567.98, 2349.32], noises: 1 }],
    ['cast', { notes: [440], noises: 1 }],
    ['hurt', { notes: [110, 73.42], noises: 1 }],
    ['upgrade', { notes: [660, 880, 1320], noises: 0 }],
    ['breakthrough', { notes: [784, 392, 987.77, 1174.66], noises: 1 }],
    ['select', { notes: [880, 1760], noises: 0 }],
    ['lightning', { notes: [160, 80], noises: 2 }],
    ['win', { notes: [1046, 523.25, 1174.66, 1318.51, 1567.98], noises: 0 }],
    ['lose', { notes: [147, 110], noises: 0 }],
    ['cache', { notes: [587.33, 880, 1174.66], noises: 1 }],
    ['unknown', { notes: [523], noises: 0 }],
  ]);
  for (const [name, expected] of cases) {
    const previousNotes = h.notes.length;
    const previousNoises = h.noises.length;
    h.audio.play(name);
    assert.deepEqual(
      h.notes.slice(previousNotes).map((note) => note.frequency),
      expected.notes,
      name,
    );
    assert.equal(h.noises.length - previousNoises, expected.noises, `${name} 噪声层数量`);
    h.audio.play(name);
    assert.equal(h.notes.length, previousNotes + expected.notes.length, `${name} 重复音效应限频`);
    assert.equal(h.noises.length, previousNoises + expected.noises, `${name} 重复噪声应限频`);
  }
  assert.equal(h.counts().buffers, 1, '全部噪声瞬态共用单个噪声缓冲');
  assert.ok(h.filters.some((f) => f.type === 'bandpass' && f.frequency >= 1600));
  assert.ok(h.filters.some((f) => f.type === 'lowpass' && f.frequency <= 420));
});
