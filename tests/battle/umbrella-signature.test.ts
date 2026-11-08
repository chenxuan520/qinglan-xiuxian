import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Shot } from '../../src/battle/game.ts';
import type { BossMotion } from '../../src/battle/game-types.ts';
import { freshSave } from '../../src/core/progress.ts';

function seeded(seed = 72) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function fixture() {
  const g = new Game(
    { ...freshSave(), artifacts: ['sword', 'nail', 'umbrella'], starter: 'umbrella', path: 'dual' },
    0,
    0,
    seeded(),
  );
  g.weapons = [{ id: 'umbrella', level: 1, evolved: false, timer: 999 }];
  return g;
}
function hostile(options: Partial<Shot> = {}): Shot {
  return {
    x: 50,
    y: 0,
    vx: 0,
    vy: 0,
    life: 2,
    radius: 7,
    damage: 30,
    color: '#ffffff',
    kind: 'hostile',
    pierce: 1,
    hit: new Set(),
    origin: { x: 50, y: 0 },
    age: 0,
    bounce: 0,
    crit: false,
    ...options,
  };
}
const beamCount = (g: Game) => g.shots.filter((s) => s.kind === 'umbrella').length;

for (const kind of ['return', 'memory', 'star'] as const) {
  test(`玄天伞不消解带 ${kind} 轨迹的妖王特殊灵弹，普通弹照常消解`, () => {
    const g = fixture();
    const motion: BossMotion = { kind, path: [{ x: 0, y: 0 }], warmup: 1 };
    const special = hostile({ bossMotion: motion });
    const plain = hostile({ x: -50 });
    g.shots = [special, plain];
    g.cast(g.weapons[0]);
    assert.ok(special.life > 0);
    assert.equal(plain.life, 0);
    assert.equal(beamCount(g), 1);
  });
}

test('无 bossMotion 的幻影魂弹、蚀骨毒矢与引力雷环仍被玄天伞消解', () => {
  const g = fixture();
  const soul = hostile({ enemySkill: 'soul' });
  const miasma = hostile({ miasmaArrow: true });
  const ring = hostile({ x: -50, y: 20 });
  g.shots = [soul, miasma, ring];
  g.cast(g.weapons[0]);
  assert.equal(soul.life, 0);
  assert.equal(miasma.life, 0);
  assert.equal(ring.life, 0);
  assert.equal(beamCount(g), 3);
});
