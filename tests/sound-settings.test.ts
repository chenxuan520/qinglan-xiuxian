import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundSettings } from '../src/sound-settings.ts';

function harness() {
  const state = { sound: false, volume: 0.37 };
  const events: (string | { sound: boolean; volume: number })[] = [];
  const settings = new SoundSettings(
    state,
    {
      sync: () => events.push({ ...state }),
      play: (name) => events.push(name),
    },
    () => events.push('persist'),
  );
  return { state, settings, events };
}

test('声音开关先成功持久化再同步输出；只有首页显式开声才带选择音效', () => {
  const { state, settings, events } = harness();
  assert.deepEqual(events, []);
  settings.setEnabled(true, true);
  settings.setEnabled(false, true);
  settings.toggle();
  assert.equal(state.sound, true);
  assert.equal(state.volume, 0.37);
  assert.deepEqual(events, [
    'persist',
    { sound: true, volume: 0.37 },
    'select',
    'persist',
    { sound: false, volume: 0.37 },
    'persist',
    { sound: true, volume: 0.37 },
  ]);
});

test('调音量不会解除静音，零音量开声仍保留零音量，明确朗读才恢复默认音量', () => {
  const { state, settings, events } = harness();
  settings.setVolume(0);
  assert.deepEqual(state, { sound: false, volume: 0 });
  settings.toggle();
  assert.deepEqual(state, { sound: true, volume: 0 });
  settings.enableNarration();
  assert.deepEqual(state, { sound: true, volume: 0.6 });
  settings.setVolume(0.23);
  settings.setEnabled(false);
  settings.enableNarration();
  assert.deepEqual(state, { sound: true, volume: 0.23 });
  assert.equal(events.filter((event) => event === 'persist').length, 6);
  assert.ok(!events.includes('select'));
});

test('存档在原对象中替换后读取最新音量和开关，不使用构造时的副本', () => {
  const { state, settings, events } = harness();
  Object.assign(state, { sound: true, volume: 0.71 });
  settings.toggle();
  assert.deepEqual(state, { sound: false, volume: 0.71 });
  assert.deepEqual(events, ['persist', { sound: false, volume: 0.71 }]);
});
