import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { GameAudio } from '../src/game-audio.ts';
import { SoundSettings } from '../src/sound-settings.ts';

function harness() {
  const state = { sound: false, volume: 0.37 };
  const gains: { value: number; targets: number[] }[] = [];
  const notes: { frequency: number; time: number; type: string; stop: number }[] = [];
  let contexts = 0;
  let musicSources = 0;
  let mediaNodes = 0;
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
    setPlay: (next: () => Promise<void>) => (play = next),
    counts: () => ({ contexts, musicSources, mediaNodes, plays, pauses, resumes, writes, source }),
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
  assert.equal(h.notes.length, 1);
  h.settings.setVolume(0);
  assert.equal(h.state.sound, true);
  assert.equal(h.state.volume, 0);
  h.settings.setEnabled(false, true);
  assert.equal(h.music.paused, true);
  h.audio.play('boss');
  assert.equal(h.notes.length, 1);
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
  assert.equal(h.notes.length, 1);
  h.context.currentTime += 0.08;
  h.audio.play('pickup');
  h.context.currentTime += 0.5;
  h.audio.play('pickup');
  assert.deepEqual(
    h.notes.map((note) => note.frequency),
    [523.25, 587.33, 523.25],
  );
  assert.ok(h.notes.every((note) => note.type === 'triangle' && note.stop > note.time));
  h.audio.play('cast');
  h.context.currentTime += 0.2;
  h.audio.play('cast');
  assert.equal(h.notes.length, 4);
  h.context.currentTime += 0.11;
  h.audio.play('cast');
  assert.equal(h.notes.length, 5);
});

test('多音效编排与常见事件保持原音符，互不共享节流时间', () => {
  const h = harness();
  h.settings.setEnabled(true);
  const cases = new Map([
    ['evolve', [659.25, 987.77, 1318.51]],
    ['chest', [1318.51, 1975.53, 1760]],
    ['heal', [659.25, 987.77]],
    ['iron', [1567.98, 2349.32]],
    ['magnet', [392]],
    ['elite', [150, 1200]],
    ['boss', [73.42, 146.83, 220]],
    ['loot', [98, 196, 293.66, 1567.98]],
    ['cast', [440]],
    ['hurt', [110]],
    ['upgrade', [660]],
    ['breakthrough', [784]],
    ['select', [880]],
    ['lightning', [160]],
    ['win', [1046]],
    ['lose', [147]],
    ['unknown', [523]],
  ]);
  for (const [name, expected] of cases) {
    const previous = h.notes.length;
    h.audio.play(name);
    assert.deepEqual(
      h.notes.slice(previous).map((note) => note.frequency),
      expected,
      name,
    );
    h.audio.play(name);
    assert.equal(h.notes.length, previous + expected.length, `${name} 重复音效应限频`);
  }
});
