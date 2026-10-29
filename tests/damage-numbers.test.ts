import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE_NUMBERS_KEY, DamageNumbersPreference } from '../src/damage-numbers.ts';

test('伤害数字默认显示，读取本机关闭偏好且读取异常不阻断游戏', () => {
  for (const stored of [null, '1', 'unexpected', '0']) {
    const applied: boolean[] = [];
    const preference = new DamageNumbersPreference(
      () => ({ getItem: () => stored, setItem: () => assert.fail('读取时不得写入') }),
      (value) => applied.push(value),
    );
    assert.equal(preference.enabled, stored !== '0');
    assert.deepEqual(applied, [stored !== '0']);
  }
  const preference = new DamageNumbersPreference(
    () => {
      throw new Error('storage unavailable');
    },
    (enabled) => assert.equal(enabled, true),
  );
  assert.equal(preference.enabled, true);
});

test('伤害显示先保存成功再应用，失败保留原值，恢复写入后可以重试并回读', () => {
  const stored = new Map([
    [DAMAGE_NUMBERS_KEY, '1'],
    ['unrelated', 'unchanged'],
  ]);
  let failing = true;
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem(key: string, value: string) {
      if (failing) throw new DOMException('full', 'QuotaExceededError');
      stored.set(key, value);
    },
  };
  const applied: boolean[] = [];
  const preference = new DamageNumbersPreference(
    () => storage,
    (value) => applied.push(value),
  );
  assert.equal(preference.toggle(), false);
  assert.equal(preference.enabled, true);
  assert.equal(stored.get(DAMAGE_NUMBERS_KEY), '1');
  assert.deepEqual(applied, [true]);
  failing = false;
  assert.equal(preference.toggle(), true);
  assert.equal(preference.enabled, false);
  assert.equal(stored.get(DAMAGE_NUMBERS_KEY), '0');
  assert.deepEqual(applied, [true, false]);
  const restored = new DamageNumbersPreference(
    () => storage,
    () => {},
  );
  assert.equal(restored.enabled, false);
  assert.equal(restored.toggle(), true);
  assert.equal(stored.get(DAMAGE_NUMBERS_KEY), '1');
  assert.equal(stored.get('unrelated'), 'unchanged');
});
