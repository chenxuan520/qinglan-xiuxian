import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, SAVE_SCHEMA, type SaveData } from '../src/progress.ts';
import { exportSave, importSave, readSealedSave } from '../src/save-transfer.ts';
import {
  inspectSaveIntegrity,
  sealSaveSnapshot,
  verifyFactsSeal,
} from '../src/leaderboard-integrity.ts';
import { projectLeaderboardFactsV1 } from '../src/leaderboard-facts-v1.ts';
import { Game } from '../src/game.ts';

const clean = () => sealSaveSnapshot(freshSave('heaven', ['metal'], 'orthodox', () => 0.5));

test('正常写档、导出、导入、刷新均保持清白，导出实时年岁而不改原对象', () => {
  const save = clean();
  const first = save.factsSeal;
  save.age += 0.125;
  const before = JSON.stringify(save);
  const file = exportSave(save, null);
  const imported = importSave(file).save;
  assert.equal(JSON.stringify(save), before);
  assert.equal(imported.factsTampered, false);
  assert.notDeepEqual(imported.factsSeal, first);
  assert.equal(verifyFactsSeal(projectLeaderboardFactsV1(imported), imported.factsSeal), true);
  const read = readSealedSave(JSON.stringify(imported));
  assert.equal(read.status, 'ok');
  assert.deepEqual(read.save, imported);
  assert.deepEqual(importSave(exportSave(imported, null)).save, imported);
});

test('文件和本地存储改成长、炼器、首通或年岁均能游玩，但不能洗白', () => {
  const original = clean();
  const mutations = [
    (s: SaveData) => {
      s.cultivation += 1000;
    },
    (s: SaveData) => {
      s.forge.sword = 5;
    },
    (s: SaveData) => {
      s.completed = [0];
    },
    (s: SaveData) => {
      s.age += 1;
    },
    (s: SaveData) => {
      s.factsSeal = null;
    },
    (s: SaveData) => {
      delete (s as Partial<SaveData>).factsSeal;
    },
  ];
  for (const mutate of mutations) {
    const raw = structuredClone(original);
    mutate(raw);
    const text = JSON.stringify(raw);
    const local = readSealedSave(text),
      imported = importSave(text);
    assert.equal(local.status, 'ok');
    for (const save of [local.save, imported.save]) {
      assert.equal(save.factsTampered, true);
      assert.equal(new Game(save, 0, 0).state, 'playing');
      assert.equal(importSave(exportSave(save, null)).save.factsTampered, true);
      assert.equal(readSealedSave(JSON.stringify(sealSaveSnapshot(save))).save.factsTampered, true);
    }
  }
});

test('仅旧格式本地原档首次补签，文件缺签必标记；新格式删签不能走旧格式例外', () => {
  const legacy = JSON.parse(JSON.stringify(clean()));
  legacy.schema = 36;
  delete legacy.factsSeal;
  delete legacy.factsTampered;
  const local = readSealedSave(JSON.stringify(legacy));
  assert.equal(local.status, 'ok');
  assert.equal(local.save.schema, SAVE_SCHEMA);
  assert.equal(local.save.factsTampered, false);
  assert.equal(inspectSaveIntegrity(local.save, 'local'), false);
  assert.equal(importSave(JSON.stringify(legacy)).save.factsTampered, true);
  legacy.schema = SAVE_SCHEMA;
  assert.equal(readSealedSave(JSON.stringify(legacy)).save.factsTampered, true);
  assert.equal(readSealedSave(null).status, 'empty');
  assert.equal(readSealedSave('{bad').status, 'unreadable');
  assert.equal(
    readSealedSave(JSON.stringify({ ...clean(), schema: SAVE_SCHEMA + 1 })).status,
    'newer',
  );
});

test('签名只增加两个存档字段，无关字段不影响摘要，下一世重新开始', () => {
  const save = clean();
  const expectedKeys = [
    'adUsage',
    'age',
    'artifactDrops',
    'artifacts',
    'autoplay',
    'autoplayBuild',
    'bestKills',
    'bestiary',
    'birthInheritance',
    'chronicle',
    'completed',
    'cultivation',
    'curios',
    'forge',
    'hometownSeen',
    'iron',
    'journeyEnded',
    'lifeMode',
    'lifespanBonus',
    'medicine',
    'mortal',
    'nextTribulationAge',
    'path',
    'pendingReincarnation',
    'prologueSeen',
    'retreatBonus',
    'rootElements',
    'runs',
    'schema',
    'sound',
    'spiritRoot',
    'starter',
    'stones',
    'suppliesReadyAt',
    'training',
    'tribulationReturn',
    'tribulations',
    'unlocked',
    'version',
    'volume',
  ];
  assert.deepEqual(
    Object.keys(save).sort(),
    [...expectedKeys, 'factsSeal', 'factsTampered'].sort(),
  );
  const unrelated = { ...save, futureUnrelatedPreference: 3 };
  assert.equal(inspectSaveIntegrity(unrelated, 'local'), false);
  save.factsTampered = true;
  assert.equal(sealSaveSnapshot(save).factsTampered, true);
  const next = sealSaveSnapshot(freshSave());
  assert.equal(next.factsTampered, false);
  assert.equal(inspectSaveIntegrity(next, 'local'), false);
});
