import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { freshSave } from '../../src/core/progress.ts';
import { bestiaryBossSkills, bossPursuitSkill, bossSkills } from '../../src/battle/boss-skills.ts';

function encounter(arena: number, stage: number) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const g = new Game(save, arena, 0, () => 0.5);
  g.weapons[0].timer = 99999;
  g.spawnBudget = -10000;
  g.nextElite = g.nextTrialBossAt = 99999;
  g.bossSpawned = true;
  const e = g.spawnEnemy(10, false, true, { x: -500, y: 0 }, stage);
  Object.assign(e, { speed: 0, cooldown: 99999, pursuitCooldown: 0 });
  g.update(0.01);
  return { g, e };
}

test('终关毒君、冥主远离时改用原生同款追击，不再占用技能轮转', () => {
  const nativePoison = encounter(3, 3);
  const trialPoison = encounter(6, 3);
  assert.equal(nativePoison.e.charge, 0);
  assert.equal(trialPoison.e.charge, 0);
  assert.equal(nativePoison.g.zones.length, 1);
  assert.equal(trialPoison.g.zones.length, 1);
  assert.equal(trialPoison.g.zones[0].life, 12);
  assert.equal(trialPoison.g.zones[0].radius, 70);
  assert.equal(trialPoison.g.zones[0].vx, 120);
  assert.equal(trialPoison.e.cooldown, nativePoison.e.cooldown);
  assert.equal(trialPoison.e.pursuitCooldown, nativePoison.e.pursuitCooldown);

  const nativeNecro = encounter(4, 4);
  const trialNecro = encounter(6, 4);
  assert.equal(nativeNecro.e.x, -260);
  assert.equal(trialNecro.e.x, -260);
  assert.equal(nativeNecro.g.zones.length, 0);
  assert.equal(trialNecro.g.zones.length, 0);
  assert.equal(trialNecro.e.cooldown, nativeNecro.e.cooldown);
  assert.equal(trialNecro.e.pursuitCooldown, nativeNecro.e.pursuitCooldown);
});

test('距离不超过330像素时毒君、冥主不触发追击', () => {
  for (const [stage, arena] of [
    [3, 6],
    [4, 6],
  ]) {
    const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
    save.unlocked = 6;
    save.completed = [0, 1, 2, 3, 4, 5];
    save.cultivation = 119940;
    const g = new Game(save, arena, 0, () => 0.5);
    g.weapons[0].timer = 99999;
    g.spawnBudget = -10000;
    g.nextElite = g.nextTrialBossAt = 99999;
    g.bossSpawned = true;
    const e = g.spawnEnemy(10, false, true, { x: -300, y: 0 }, stage);
    Object.assign(e, { speed: 0, cooldown: 99999, pursuitCooldown: 0 });
    g.update(0.01);
    assert.equal(g.zones.length, 0);
    assert.equal(e.x, -300);
  }
});

test('终关毒君、冥主的轮转招式与原生相同，追击招式另计', () => {
  for (const stage of [3, 4]) {
    assert.deepEqual(bossSkills(stage, true), bossSkills(stage, false));
    assert.equal(bossSkills(stage, true).includes('游瘴驱逐'), false);
    assert.equal(bossSkills(stage, true).includes('幽影追踪'), false);
    assert.deepEqual(bestiaryBossSkills(stage, true), bestiaryBossSkills(stage, false));
  }
  assert.equal(bossPursuitSkill(3), '游瘴驱逐');
  assert.equal(bossPursuitSkill(4), '幽影追踪');
  assert.equal(bossPursuitSkill(2), null);
});

test('旧快照中越界的终关追击索引在读取时迁移，存档仍有效', () => {
  const { g, e } = encounter(6, 3);
  e.skillStep = 4;
  e.bossSkillQueue = [0, 1, 2, 4];
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  const restored = Game.restore(g.save, raw);
  assert.ok(restored);
  const boss = restored.enemies.find((c) => c.id === e.id)!;
  assert.equal(boss.skillStep, 0);
  assert.deepEqual(boss.bossSkillQueue, [1, 2]);

  const necro = encounter(6, 4);
  necro.e.skillStep = 5;
  necro.e.bossSkillQueue = [0, 1, 2, 3, 5];
  const necroRaw = JSON.parse(JSON.stringify(necro.g.snapshot()));
  const necroRestored = Game.restore(necro.g.save, necroRaw);
  assert.ok(necroRestored);
  const necroBoss = necroRestored.enemies.find((c) => c.id === necro.e.id)!;
  assert.equal(necroBoss.skillStep, 0);
  assert.deepEqual(necroBoss.bossSkillQueue, [1, 2, 3]);
});
