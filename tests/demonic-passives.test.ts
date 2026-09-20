import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { PASSIVES } from '../src/data.ts';
import { joinSect } from '../src/mortal.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function learn(g: Game, id: string, level = 5) {
  g.state = 'upgrade';
  g.choices = [{ type: 'passive', id, level }];
  assert.equal(g.choose(0), true);
}

test('八本魔功分别增强专长并承担代价，正道数值保留', () => {
  const checks: Record<string, (g: Game) => void> = {
    blood: (g) => {
      near(g.stats.damage, 1.9);
      near(g.stats.armor, 1.15);
    },
    frenzy: (g) => {
      near(g.stats.cooldown, 0.6);
      assert.equal(g.player.maxHp, 90);
      g.player.hp = 40;
      near(g.stats.cooldown, 0.5);
      near(g.stats.speed, 210);
    },
    abyss: (g) => {
      near(g.stats.area, 1.8);
      near(g.stats.damage, 0.9);
    },
    bone: (g) => {
      assert.equal(g.player.maxHp, 190);
      near(g.stats.speed, 166.25);
    },
    devour: (g) => {
      near(g.stats.duration, 2);
      near(g.stats.killHeal, 1);
      near(g.stats.regen, 0.144);
    },
    curse: (g) => {
      near(g.stats.crit, 0.47);
      near(g.stats.criticalDamage, 2.4);
      near(g.stats.armor, 1.075);
    },
    soul: (g) => {
      near(g.stats.xp, 1.5);
      near(g.stats.cooldown, 1.05);
    },
    forbidden: (g) => {
      near(g.stats.xp, 1.9);
      near(g.stats.damage, 1.4);
      near(g.stats.armor, 1.075);
    },
  };
  for (const p of PASSIVES.filter((p) => p.school === 'demonic')) {
    assert.doesNotMatch(p.desc, /代价[:：]/);
    const g = new Game(freshSave(), 0, 0);
    learn(g, p.id);
    checks[p.id](g);
  }
  const g = new Game(freshSave(), 0, 0);
  for (const id of ['power', 'haste', 'guard', 'duration']) learn(g, id);
  near(g.stats.damage, 1.6);
  near(g.stats.cooldown, 0.65);
  near(g.stats.armor, 0.7);
  near(g.stats.regen, 1.18);
  assert.equal(g.player.maxHp, 200);
});

test('魔道精研只增强收益，不扩大气血、移速、承伤、恢复或施法代价', () => {
  for (const p of PASSIVES.filter((p) => p.school === 'demonic')) {
    const s = freshSave();
    s.cultivation = 1e9;
    s.completed = [6];
    s.stones = 1000;
    joinSect(s, p.id);
    const g = new Game(s, 0, 0);
    learn(g, p.id);
    const before = g.stats,
      hp = g.player.maxHp;
    s.mortal.mastery[p.id] = 10;
    const upgraded = Game.restore(s, g.snapshot())!;
    near(upgraded.stats.armor, before.armor);
    if (p.id === 'bone') {
      assert.ok(upgraded.player.maxHp > hp);
      near(upgraded.stats.speed, before.speed);
    }
    if (p.id === 'frenzy') {
      assert.equal(upgraded.player.maxHp, hp);
      assert.ok(upgraded.stats.cooldown < before.cooldown);
    }
    if (p.id === 'devour') {
      near(upgraded.stats.regen, before.regen);
      assert.ok(upgraded.stats.killHeal > before.killHeal);
    }
    if (p.id === 'abyss') {
      near(upgraded.stats.damage, before.damage);
      assert.ok(upgraded.stats.area > before.area);
    }
    if (p.id === 'soul') {
      near(upgraded.stats.cooldown, before.cooldown);
      assert.ok(upgraded.stats.xp > before.xp);
    }
  }
});

test('所有七十种四魔功满重组合保持可移动、可回血及承伤边界', () => {
  const ids = PASSIVES.filter((p) => p.school === 'demonic').map((p) => p.id);
  let cases = 0;
  for (let a = 0; a < 5; a++)
    for (let b = a + 1; b < 6; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 8; d++) {
          const s = freshSave('none');
          s.path = 'demonic';
          const g = new Game(s, 0, 0);
          const regen = g.stats.regen;
          for (const i of [a, b, c, d]) learn(g, ids[i]);
          assert.ok(g.player.maxHp >= 72 && g.player.hp > 0 && g.player.hp <= g.player.maxHp);
          assert.ok(g.stats.speed >= 133);
          assert.ok(g.stats.regen >= regen * 0.8);
          assert.ok(g.stats.armor <= 1.3 + 1e-8);
          assert.ok(g.stats.cooldown >= 0.3 && g.stats.cooldown <= 1.05);
          cases++;
        }
  assert.equal(cases, 70);
});

test('天魔降血上限保留当前血量比例，残血领悟不致死，旧局反复恢复不加血', () => {
  const s = freshSave();
  const g = new Game(s, 0, 0);
  g.player.hp = 1;
  learn(g, 'frenzy');
  near(g.player.hp, 0.9);
  const old = g.snapshot();
  old.player.maxHp = 100;
  old.player.hp = 50;
  const restored = Game.restore(s, old)!;
  assert.equal(restored.player.maxHp, 90);
  assert.equal(restored.player.hp, 40);
  assert.equal(Game.restore(s, restored.snapshot())!.player.hp, 40);
  old.state = 'lost';
  old.player.hp = 0;
  assert.equal(Game.restore(s, old)!.player.hp, 0);
});
