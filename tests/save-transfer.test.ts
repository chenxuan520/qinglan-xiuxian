import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSave, importSave, MAX_SAVE_FILE_BYTES } from '../src/save-transfer.ts';
import { freshSave, parseSave } from '../src/progress.ts';
import { Game } from '../src/game.ts';

test('序章已读状态保留于存档和导入，未读或缺失字段时保持未读', () => {
  const save = freshSave();
  assert.equal(save.prologueSeen, false);
  assert.equal(parseSave(JSON.stringify({ ...save, prologueSeen: undefined })).prologueSeen, false);
  for (const seen of [true, false]) {
    save.prologueSeen = seen;
    assert.equal(parseSave(JSON.stringify(save)).prologueSeen, seen);
    assert.equal(importSave(exportSave(save, null)).save.prologueSeen, seen);
  }
});

test('存档导出导入保留永久进度、五行、炼器、待拾取与设置，不依赖浏览器存储', () => {
  const save = freshSave('dual', ['water', 'fire']);
  Object.assign(save, {
    cultivation: 12345,
    age: 86.75,
    lifespanBonus: 60,
    stones: 567,
    iron: 89,
    unlocked: 3,
    completed: [0, 1, 2],
    bestKills: 300,
    runs: 8,
    sound: true,
    autoplay: true,
    volume: 0.27,
    prologueSeen: true,
  });
  save.training = { power: 10, speed: 7, vitality: 5 };
  save.forge.ice = 10;
  save.artifactDrops = ['brush', 'whip'];
  const before = JSON.stringify(save);
  const file = exportSave(save, null);
  const restored = importSave(file);
  assert.deepEqual(restored.save, parseSave(before));
  assert.equal(restored.run, null);
  assert.equal(JSON.stringify(save), before);
  assert.equal(JSON.parse(file).format, 'qinglan-save');
  assert.deepEqual(importSave(before).save, restored.save);
});

test('导入保存的战斗、升级与待复活对局，修为不重复领取且坏续局不丢弃', () => {
  for (const state of ['playing', 'upgrade', 'lost'] as const) {
    const save = freshSave('heaven', ['fire']);
    save.unlocked = 2;
    const g = new Game(save, 2, 0, () => 0.5);
    g.time = 100;
    g.kills = 200;
    g.level = 20;
    g.damageBySource.lightning = g.damageDealt = 12345;
    g.revivesUsed = 3;
    g.state = state;
    if (state === 'lost') g.player.hp = 0;
    if (state === 'upgrade') g.choices = g.makeChoices();
    g.creditCultivation();
    const before = JSON.stringify(save);
    const file = exportSave(save, g);
    const restored = importSave(file);
    assert.equal(restored.save.cultivation, save.cultivation);
    assert.equal(restored.run!.time, 100);
    assert.equal(restored.run!.state, state === 'playing' ? 'paused' : state);
    assert.deepEqual(restored.run!.damageBySource, g.damageBySource);
    assert.deepEqual(restored.run!.rootElements, ['fire']);
    assert.equal(restored.run!.revivesUsed, 3);
    assert.equal(
      importSave(exportSave(restored.save, restored.run)).save.cultivation,
      save.cultivation,
    );
    assert.equal(JSON.stringify(save), before);
    const damaged = JSON.parse(file);
    damaged.save.activeRun.weapons[0].id = 'bad';
    assert.throws(() => importSave(JSON.stringify(damaged)), /历练数据已损坏/);
  }
});

test('导入拒绝错误格式、版本、缺失字段、非法数值、损坏灵根与过大文件', () => {
  const save = freshSave();
  for (const data of [
    null,
    [],
    {},
    { version: 1 },
    { ...save, version: 2 },
    { ...save, stones: -1 },
    { ...save, iron: '20' },
    { ...save, training: {} },
    { ...save, forge: { sword: '10' } },
    { ...save, rootElements: ['fire', 'fire'] },
    { ...save, spiritRoot: 'unknown' },
    { ...save, prologueSeen: 'yes' },
    { ...save, activeRun: {} },
    { format: 'foreign', version: 1, save },
    { format: 'qinglan-save', version: 2, save },
  ])
    assert.throws(() => importSave(JSON.stringify(data)));
  assert.throws(() => importSave('{broken'), /JSON/);
  assert.throws(() => importSave(' '.repeat(MAX_SAVE_FILE_BYTES + 1)), /过大/);
  const legacy = { ...save, spiritRoot: undefined, rootElements: undefined };
  assert.equal(importSave(JSON.stringify(legacy)).save.spiritRoot, 'heaven');
});
