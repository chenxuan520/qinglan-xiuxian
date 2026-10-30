import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, IMMORTAL_CULTIVATION, SAVE_SCHEMA, type SaveData } from '../src/progress.ts';
import { exportSave, importSave, readSealedSave } from '../src/save-transfer.ts';
import {
  inspectSaveIntegrity,
  createFactsSeal,
  FACTS_VERSION,
  sealSaveSnapshot,
  verifyFactsSeal,
} from '../src/leaderboard-integrity.ts';
import { projectLeaderboardFactsV1 } from '../src/leaderboard-facts-v1.ts';
import { projectLeaderboardFactsV2 } from '../src/leaderboard-facts-v2.ts';
import { extractLeaderboardFacts } from '../src/leaderboard-contract.ts';
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
  assert.equal(verifyFactsSeal(projectLeaderboardFactsV2(imported), imported.factsSeal), true);
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
    'inheritanceValue',
    'journeyEnded',
    'lifeMode',
    'lifespanBonus',
    'lifespanSpent',
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

test('事实 v2 纳入承缘估值，仅真正落幕才提取留名事实，首通终关不算落幕', () => {
  const save = clean();
  save.completed = [6];
  save.cultivation = IMMORTAL_CULTIVATION;
  save.inheritanceValue = 30000;
  save.chronicle.milestones['birth-inheritance'] = 15;
  const before = JSON.stringify(save);
  assert.equal(FACTS_VERSION, 2);
  assert.equal(projectLeaderboardFactsV1(save).ending, 'immortal', '冻结的旧投影不回写规则');
  const facts = projectLeaderboardFactsV2(save);
  assert.equal(facts.ending, null);
  assert.equal(facts.inheritanceValue, 30000);
  assert.equal(facts.inherited, true);
  assert.equal(extractLeaderboardFacts(save), null);
  assert.equal(JSON.stringify(save), before, '事实投影不改存档');

  save.journeyEnded = true;
  assert.equal(extractLeaderboardFacts(save)?.ending, 'immortal');
  for (const ending of ['lifespan', 'tribulation', 'ambush', 'extreme'] as const) {
    save.journeyEnded = false;
    save.pendingReincarnation = ending;
    assert.equal(projectLeaderboardFactsV2(save).ending, ending);
    assert.equal(extractLeaderboardFacts(save)?.ending, ending);
  }
});

test('v2 的承缘估值和真正终局都受摘要保护，改动不能在读档或文件往返中洗白', () => {
  const original = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  original.cultivation = IMMORTAL_CULTIVATION;
  original.completed = [6];
  original.journeyEnded = true;
  original.inheritanceValue = 120000;
  original.chronicle.milestones['birth-inheritance'] = 15;
  for (const key of ['inheritanceValue', 'journeyEnded'] as const) {
    const raw = sealSaveSnapshot(original);
    if (key === 'inheritanceValue') raw.inheritanceValue = 0;
    else raw.journeyEnded = false;
    for (const restored of [
      readSealedSave(JSON.stringify(raw)).save,
      importSave(JSON.stringify(raw)).save,
    ]) {
      assert.equal(restored.factsTampered, true, key);
      assert.equal(restored.factsSeal?.v, 2);
      assert.equal(importSave(exportSave(restored, null)).save.factsTampered, true, key);
    }
  }
});

test('旧 v1 先验原始哈希再迁移 v2：终关未落幕及旧承缘默认值改变投影仍保持清白', () => {
  const raw = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  raw.schema = 38;
  raw.completed = [6];
  raw.cultivation = IMMORTAL_CULTIVATION;
  raw.chronicle.milestones['birth-inheritance'] = 15;
  delete (raw as Partial<SaveData>).inheritanceValue;
  raw.factsSeal = createFactsSeal(projectLeaderboardFactsV1(raw), 1);
  const original = JSON.stringify(raw);
  assert.equal(inspectSaveIntegrity(raw, 'local'), false);
  assert.equal(inspectSaveIntegrity(raw, 'import'), false);
  const local = readSealedSave(original);
  assert.equal(local.status, 'ok');
  for (const save of [local.save, importSave(original).save]) {
    assert.equal(save.schema, SAVE_SCHEMA);
    assert.equal(save.factsTampered, false);
    assert.equal(save.factsSeal?.v, 2);
    assert.equal(save.inheritanceValue, 100, '无法还原的旧已消耗赠物使用旧档估值');
    assert.equal(save.journeyEnded, false);
    assert.equal(projectLeaderboardFactsV2(save).ending, null);
    assert.equal(extractLeaderboardFacts(save), null);
    assert.equal(verifyFactsSeal(projectLeaderboardFactsV2(save), save.factsSeal), true);
    assert.deepEqual(readSealedSave(JSON.stringify(save)).save, save);
    assert.deepEqual(importSave(exportSave(save, null)).save, save);
  }
  assert.equal(JSON.stringify(raw), original);
});

test('旧 v1 原始事实被改或已有标记，升级重签 v2 以及反复导入仍为 tampered', () => {
  for (const alreadyTampered of [false, true]) {
    const raw = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
    raw.schema = 38;
    delete (raw as Partial<SaveData>).inheritanceValue;
    raw.factsTampered = alreadyTampered;
    raw.factsSeal = createFactsSeal(projectLeaderboardFactsV1(raw), 1, alreadyTampered);
    if (!alreadyTampered) raw.cultivation += 1000;
    for (const restored of [
      readSealedSave(JSON.stringify(raw)).save,
      importSave(JSON.stringify(raw)).save,
    ]) {
      assert.equal(restored.factsTampered, true);
      assert.equal(restored.factsSeal?.v, 2);
      assert.equal(
        verifyFactsSeal(projectLeaderboardFactsV2(restored), restored.factsSeal, true),
        true,
      );
      assert.equal(verifyFactsSeal(projectLeaderboardFactsV2(restored), restored.factsSeal), false);
      const again = importSave(exportSave(restored, null)).save;
      assert.equal(again.factsTampered, true);
      assert.equal(readSealedSave(JSON.stringify(again)).save.factsTampered, true);
    }
  }
});
