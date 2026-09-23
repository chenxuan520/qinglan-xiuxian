import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { TREASURES } from '../src/data.ts';
import { runLootContent } from '../src/run-loot-ui.ts';

function trial() {
  const save = freshSave();
  save.unlocked = 6;
  save.cultivation = 1e9;
  const game = new Game(save, 6, 0, () => 0.2);
  game.level = 100;
  game.weapons[0].timer = 99999;
  return { save, game };
}

test('本局收获只记录实际新增法宝与丹药，重复伤害不重复记账', () => {
  const { save, game } = trial();
  const existing = [...save.artifacts];
  const pill = MEDICINES.filter((m) => m.tier === '灵品' && m.years)[1];
  save.medicine.bag[pill.id] = 5;
  game.time = 60;
  game.update(0.01);
  const boss = game.boss!;
  game.hitEnemy(boss, 1e9);
  assert.equal(game.loot.artifacts.length, 3);
  assert.ok(
    game.loot.artifacts.every((id) => !existing.includes(id) && save.artifacts.includes(id)),
  );
  assert.deepEqual(game.loot.medicines, { [pill.id]: 1 });
  assert.equal(save.medicine.bag[pill.id], 6);
  const before = JSON.stringify([game.loot, save.artifacts, save.medicine.bag]);
  game.hitEnemy(boss, 1e9);
  assert.equal(JSON.stringify([game.loot, save.artifacts, save.medicine.bag]), before);
});

test('多妖王收获随续局累积，同种丹药合并数量，读档不重新发物品', () => {
  const { save, game } = trial();
  game.time = 60;
  game.update(0.01);
  game.hitEnemy(game.boss!, 1e9);
  const before = JSON.stringify([save.artifacts, save.medicine.bag]);
  const restored = Game.restore(save, JSON.parse(JSON.stringify(game.snapshot())))!;
  assert.ok(restored);
  assert.deepEqual(restored.loot, game.loot);
  assert.equal(JSON.stringify([save.artifacts, save.medicine.bag]), before);
  restored.random = () => 0.2;
  restored.resume();
  restored.time = 120;
  restored.update(0.01);
  restored.hitEnemy(restored.boss!, 1e9);
  assert.equal(restored.loot.artifacts.length, 6);
  assert.deepEqual(Object.values(restored.loot.medicines), [2]);
  const again = Game.restore(save, JSON.parse(JSON.stringify(restored.snapshot())))!;
  assert.deepEqual(again.loot, restored.loot);
  const snapshot = again.snapshot();
  snapshot.loot.artifacts.length = 0;
  snapshot.loot.medicines = {};
  assert.equal(again.loot.artifacts.length, 6);
});

test('旧续局标记收获未载，之后新掉落仍记录，不凭整个背包补造收获', () => {
  const save = freshSave();
  const game = new Game(save, 0, 0, () => 0.2);
  const snapshot = game.snapshot();
  delete snapshot.loot;
  const restored = Game.restore(save, snapshot)!;
  assert.deepEqual(restored.loot, { artifacts: [], medicines: {}, complete: false });
  assert.match(runLootContent(restored.loot), /旧续局/);
  restored.random = () => 0.2;
  restored.hitEnemy(restored.spawnEnemy(10, false, true), 1e9);
  assert.equal(restored.loot.artifacts.length, 3);
  assert.equal(restored.loot.complete, false);
});

test('最后仙尊本世珍品进入本局收获，重复命中死者不重复发放', () => {
  const { save, game } = trial();
  game.time = 420;
  game.update(0.01);
  const boss = game.enemies.find((e) => e.bossStage === 6)!;
  game.hitEnemy(boss, 1e9);
  const permanent = Object.entries(game.loot.medicines).filter(
    ([id]) => !MEDICINES.find((m) => m.id === id)!.years,
  );
  assert.equal(permanent.length, 1);
  assert.equal(permanent[0][1], 1);
  assert.match(runLootContent(game.loot), /本世珍品丹药/);
  const before = JSON.stringify([game.loot, save.medicine.bag]);
  game.hitEnemy(boss, 1e9);
  assert.equal(JSON.stringify([game.loot, save.medicine.bag]), before);
});

test('收获快照拒绝非法物品或数量，不允许重复法宝记录', () => {
  const save = freshSave();
  const game = new Game(save, 0, 0);
  const pill = MEDICINES[0].id;
  for (const loot of [
    null,
    [],
    {},
    { artifacts: ['missing'], medicines: {}, complete: true },
    { artifacts: ['sword', 'sword'], medicines: {}, complete: true },
    { artifacts: [], medicines: { missing: 1 }, complete: true },
    ...[0, -1, 1.5, Infinity, '1'].map((count) => ({
      artifacts: [],
      medicines: { [pill]: count },
      complete: true,
    })),
    { artifacts: [], medicines: {}, complete: 'true' },
  ])
    assert.equal(Game.restore(save, { ...game.snapshot(), loot }), null);
});

test('结算完整展示法宝、丹药图标和数量，不截断、不分组逗号、不改存档', () => {
  const { save, game } = trial();
  game.loot.artifacts = TREASURES.map((t) => t.id);
  game.loot.medicines[MEDICINES[0].id] = 2000;
  const before = JSON.stringify([save, game.loot]);
  const html = runLootContent(game.loot);
  for (const t of TREASURES) assert.ok(html.includes(t.name));
  assert.ok(html.includes(MEDICINES[0].name));
  assert.match(html, /medicine-art/);
  assert.match(html, /item-art/);
  assert.match(html, /×2000/);
  assert.doesNotMatch(html, /2,000/);
  assert.equal(JSON.stringify([save, game.loot]), before);
  assert.match(
    runLootContent({ artifacts: [], medicines: {}, complete: true }),
    /本局未获新的法宝或丹药/,
  );
});
