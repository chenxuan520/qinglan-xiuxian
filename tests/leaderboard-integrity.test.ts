import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freshSave, readSave, type SaveData } from '../src/progress.ts';
import { projectLeaderboardFactsV1 } from '../src/leaderboard-facts-v1.ts';
import {
  canonicalFacts,
  createFactsSeal,
  factsSealInput,
  inspectSaveIntegrity,
  migrateSealedSave,
  verifyFactsSeal,
  type FactsVersions,
} from '../src/leaderboard-integrity.ts';
import { debugGrant, type DebugGrant } from '../src/debug-resources.ts';
import { leaderboardSettings } from '../src/leaderboard-preference.ts';

async function sealed() {
  const save = readSave(JSON.stringify(freshSave())).save;
  save.factsSeal = await createFactsSeal(projectLeaderboardFactsV1(save));
  return save;
}
test('规范化按键排序、集合排序、保留有序数组和精确数字；UTF-8摘要与独立Node实现一致', async () => {
  const a = {
    z: ['青岚', 2.125],
    a: { b: false, a: null },
    completed: [2, 0],
    rootElements: ['wood', 'metal'],
    forge: { sword: 1, fire: 0 },
  };
  const b = {
    forge: { sword: 1 },
    rootElements: ['wood', 'metal'],
    completed: [0, 2],
    a: { a: null, b: false },
    z: ['青岚', 2.125],
  };
  assert.equal(factsSealInput(a), factsSealInput(b));
  assert.equal(canonicalFacts({ z: 2, a: 1 }), '{"a":1,"z":2}');
  assert.notEqual(factsSealInput(a), factsSealInput({ ...a, rootElements: ['metal', 'wood'] }));
  const seal = await createFactsSeal(a);
  assert.equal(seal.h, createHash('sha256').update(factsSealInput(a)).digest('hex'));
  assert.deepEqual(seal, await createFactsSeal(b));
  assert.equal(await verifyFactsSeal(b, seal), true);
  assert.equal(await verifyFactsSeal(b, { ...seal, v: 99 }), false);
  assert.equal(await verifyFactsSeal(b, null), false);
});
test('进行中也封存真实成长，读取补零键和无关字段迁移不会误判', async () => {
  const fresh = freshSave();
  const before = await createFactsSeal(projectLeaderboardFactsV1(fresh));
  const after = readSave(JSON.stringify(fresh)).save;
  assert.equal(projectLeaderboardFactsV1(fresh).ending, null);
  assert.deepEqual(await createFactsSeal(projectLeaderboardFactsV1(after)), before);
  fresh.cultivation++;
  assert.notDeepEqual(await createFactsSeal(projectLeaderboardFactsV1(fresh)), before);
  const save = await sealed();
  const raw = { ...save, unrelatedFutureSetting: 25 };
  const restored = await migrateSealedSave(
    raw,
    () => Object.assign(structuredClone(save), { unrelatedFutureSetting: 99 }),
    'import',
  );
  assert.equal(restored.factsTampered, false);
  assert.deepEqual(restored.factsSeal, save.factsSeal);
});
test('手改计分字段、删哈希、未知版本或只翻转已改动标记均不洗白', async () => {
  const original = await sealed();
  const modifications = [
    (s: SaveData) => {
      s.cultivation++;
    },
    (s: SaveData) => {
      s.forge[s.starter] = 10;
    },
    (s: SaveData) => {
      s.completed = [0];
    },
    (s: SaveData) => {
      s.age++;
    },
    (s: SaveData) => {
      delete (s as Partial<SaveData>).factsSeal;
    },
    (s: SaveData) => {
      s.factsSeal!.v = 999;
    },
  ];
  for (const change of modifications) {
    const modified = structuredClone(original);
    change(modified);
    assert.equal(await inspectSaveIntegrity(modified, 'local'), true);
    const migrated = await migrateSealedSave(
      modified,
      () => readSave(JSON.stringify(modified)).save,
      'import',
    );
    assert.equal(migrated.factsTampered, true);
    assert.equal(await inspectSaveIntegrity(migrated, 'local'), true);
  }
  const changed = structuredClone(original);
  changed.factsTampered = true;
  changed.factsSeal = await createFactsSeal(projectLeaderboardFactsV1(changed), 1, true);
  changed.factsTampered = false;
  assert.equal(await inspectSaveIntegrity(changed, 'local'), true);
});
test('仅本地旧格式有首次补签例外，导入无哈希和新格式删字段始终算改动；新世清除标记', async () => {
  const old = JSON.parse(JSON.stringify(freshSave()));
  old.schema = 36;
  delete old.factsSeal;
  delete old.factsTampered;
  assert.equal(await inspectSaveIntegrity(old, 'local'), false);
  assert.equal(await inspectSaveIntegrity(old, 'import'), true);
  old.schema = 37;
  assert.equal(await inspectSaveIntegrity(old, 'local'), true);
  assert.equal(freshSave().factsTampered, false);
});
test('事实版本升级严格先核原档，再迁移与重封；迁移前改过数字仍保留改动标记', async () => {
  const original = await sealed();
  const versions: FactsVersions = {
    current: 2,
    projectors: {
      1: (raw) => projectLeaderboardFactsV1(raw as SaveData),
      2: (raw) => ({ ...projectLeaderboardFactsV1(raw as SaveData), nextScoreRule: 2 }),
    },
  };
  for (const changed of [false, true]) {
    const raw = structuredClone(original);
    if (changed) raw.age++;
    const migrated = await migrateSealedSave(
      raw,
      () => {
        const next = readSave(JSON.stringify(raw)).save;
        next.cultivation += 10;
        return next;
      },
      'import',
      versions,
    );
    assert.equal(migrated.factsTampered, changed);
    assert.equal(migrated.factsSeal!.v, 2);
    assert.equal(
      migrated.factsSeal!.h,
      (await createFactsSeal(versions.projectors[2](migrated), 2, changed)).h,
    );
  }
});

test('七类调试发放只标记成功的副本，设置可见原因且公共榜单链接保留', () => {
  const save = freshSave();
  for (const input of [
    { kind: 'stones' },
    { kind: 'iron' },
    { kind: 'artifact', id: 'sword' },
    { kind: 'medicine', id: 'heqi' },
    { kind: 'curio', id: 'heaven-house' },
    { kind: 'cultivation' },
    { kind: 'realm', id: '1' },
  ]) {
    const grant = { id: '', quantity: 1, forge: 0, ...input } satisfies DebugGrant;
    const result = debugGrant(save, grant);
    assert.ok(result.next, result.error);
    assert.equal(result.next.factsTampered, true);
    assert.equal(save.factsTampered, false);
  }
  assert.ok(debugGrant(save, { kind: 'stones', id: '', quantity: -1, forge: 0 }).error);
  assert.equal(save.factsTampered, false);
  const clean = leaderboardSettings(true, false),
    changed = leaderboardSettings(true, true);
  assert.doesNotMatch(clean, /此世存档曾被改动/);
  assert.match(changed, /此世存档曾被改动，不可留名万魂幡。/);
  assert.match(changed, /https:\/\/xiuxian\.011203\.xyz\/leaderboard\//);
});
