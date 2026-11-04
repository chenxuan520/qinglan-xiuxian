import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import type { Enemy } from '../src/game.ts';
import { BOSS_MECHANICS } from '../src/boss-mechanics.ts';

function encounter(origin: number, arena: number) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.cultivation = 119940;
  save.unlocked = 6;
  const g = new Game(save, arena, 0, () => 0.4);
  g.weapons[0].timer = 99999;
  g.player.invincible = 99999;
  const boss = g.spawnEnemy(10, false, true, { x: -180, y: 0 }, origin);
  const cast = () => {
    boss.skillStep = origin === 6 ? 6 : 3;
    boss.bossSkillQueue = origin === 6 ? [0, 1, 2, 3, 4, 5, 7, 8] : [0, 1, 2, 4];
    g.castBossSkill(boss, 1, 0);
  };
  cast();
  return { g, boss, cast, wolves: g.enemies.filter((e) => e.bossSummon?.kind === 'wolf') };
}
function advance(g: Game, wolf: Enemy, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.01)
    g.updateBossSummon(wolf, Math.min(0.01, seconds - t));
}
for (const [origin, arena] of [
  [2, 2],
  [2, 6],
  [6, 6],
]) {
  test(`狼${origin}/${arena}反复同侧包抄，两轮蓄势与209像素扑击一致，累计六秒消失`, () => {
    const { g, wolves } = encounter(origin, arena);
    assert.equal(wolves.length, 2);
    const wolf = wolves[0],
      side = wolf.bossSummon!.side;
    const stats = [wolf.maxHp, wolf.damage, wolf.speed];
    for (let round = 0; round < 2; round++) {
      advance(g, wolf, 1.21);
      assert.ok(wolf.charge > 1.37 && wolf.charge <= 1.4);
      const locked = { x: wolf.x, y: wolf.y, dx: wolf.dx, dy: wolf.dy };
      advance(g, wolf, wolf.charge - 0.55);
      assert.deepEqual({ x: wolf.x, y: wolf.y }, { x: locked.x, y: locked.y });
      advance(g, wolf, 0.55);
      assert.ok(Math.abs(Math.hypot(wolf.x - locked.x, wolf.y - locked.y) - 209) < 1e-6);
      assert.equal(wolf.dead, false);
      assert.equal(wolf.bossSummon!.side, side);
      assert.ok(wolf.bossSummon!.round! < 0.03);
      assert.deepEqual([wolf.maxHp, wolf.damage, wolf.speed], stats);
    }
    assert.ok(Math.abs(wolf.bossSummon!.age - 5.2) < 1e-7);
    advance(g, wolf, 0.79);
    assert.equal(wolf.dead, false);
    advance(g, wolf, 0.02);
    assert.equal(wolf.dead, true);
    assert.equal(g.kills, 0);
    assert.equal(g.pickups.length, 0);
    assert.equal(BOSS_MECHANICS.wolfLife, 6);
  });
  test(`狼${origin}/${arena}受杀与随主人消散，补召仍各主人最多两只`, () => {
    const { g, wolves, boss, cast } = encounter(origin, arena);
    for (let i = 0; i < 3; i++) cast();
    assert.equal(g.enemies.filter((e) => !e.dead && e.bossSummon?.kind === 'wolf').length, 2);
    g.hitEnemy(wolves[0], wolves[0].maxHp);
    assert.equal(wolves[0].dead, true);
    cast();
    assert.equal(g.enemies.filter((e) => !e.dead && e.bossSummon?.kind === 'wolf').length, 2);
    g.hitEnemy(boss, boss.maxHp);
    assert.ok(g.enemies.filter((e) => e.bossSummon?.kind === 'wolf').every((e) => e.dead));
  });
}

test('双狼第二轮age与round续局保存，旧档无round可继续，非法数值拒绝', () => {
  const { g, wolves } = encounter(2, 2);
  advance(g, wolves[0], 3.1);
  const raw = g.snapshot();
  const restored = Game.restore(g.save, raw)!;
  assert.ok(restored);
  assert.deepEqual(
    restored.enemies.find((e) => e.id === wolves[0].id)!.bossSummon,
    wolves[0].bossSummon,
  );
  const legacy = structuredClone(raw);
  delete legacy.enemies.find((e) => e.id === wolves[0].id)!.bossSummon!.round;
  assert.ok(Game.restore(g.save, legacy));
  for (const [key, value] of [
    ['round', -0.01],
    ['round', 2.61],
    ['round', Infinity],
    ['round', '1'],
    ['age', 6.01],
  ]) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies.find((e) => e.id === wolves[0].id)!.bossSummon!, {
      [key as string]: value,
    });
    assert.equal(Game.restore(g.save, bad), null);
  }
});
