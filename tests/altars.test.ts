import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Point, type Weapon } from '../src/game.ts';
import { freshSave, realmCost, lifespanInfo, type SaveData } from '../src/progress.ts';
import { visitNightBoat, claimNightBoat } from '../src/night-boat.ts';
import { ENEMIES, STAGE_ENEMIES, STAGES } from '../src/data.ts';
import { useMedicine } from '../src/medicine.ts';
import type { AltarState } from '../src/altars.ts';

const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-10),
    `${actual} != ${expected}`,
  );
const cultivationAt = (step: number) =>
  Array.from({ length: step }, (_, i) => realmCost(i)).reduce((sum, n) => sum + n, 0);
function character(step = 18) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.cultivation = cultivationAt(step);
  return save;
}
function quiet(g: Game) {
  for (const weapon of g.weapons) weapon.timer = 1e6;
  Object.assign(g, {
    spawnBudget: -1e6,
    nextElite: 1e6,
    nextTrialBossAt: 1e6,
    lateEliteWaves: true,
  });
}
function arena(
  stage = 0,
  options: {
    save?: SaveData;
    random?: () => number;
    altarRandom?: () => number;
    cache?: boolean;
  } = {},
) {
  const save = options.save ?? character();
  const g = new Game(
    save,
    stage,
    0,
    options.random ?? (() => 0.5),
    save.path,
    options.altarRandom ?? (() => 0),
  );
  quiet(g);
  // 默认排除无关守匣；守匣用例从实际出现、停留开阵开始。
  if (!options.cache)
    g.cacheChallenge = { x: 10000, y: 10000, deadline: 0, phase: 'expired', guardians: [] };
  return g;
}
function advance(g: Game, seconds: number) {
  for (let left = seconds; left > 1e-9; ) {
    const dt = Math.min(0.05, left);
    g.update(dt);
    left -= dt;
  }
}
function walkTo(g: Game, at: Point) {
  for (let i = 0; i < 1000 && g.state === 'playing'; i++) {
    const dx = at.x - g.player.x,
      dy = at.y - g.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-7) break;
    g.input = { x: dx / distance, y: dy / distance };
    g.update(Math.min(0.05, distance / g.stats.speed));
  }
  g.input = { x: 0, y: 0 };
}
function offered(g: Game) {
  assert.ok(g.altar);
  assert.equal(g.altar.phase, 'pending');
  g.time = g.altar.spawnAt - 0.05;
  advance(g, 0.05);
  assert.equal(g.altar.phase, 'offered');
  return g.altar;
}
function prompt(g: Game) {
  const a = g.altar?.phase === 'offered' ? g.altar : offered(g);
  assert.ok(a);
  walkTo(g, a);
  assert.equal(g.altar?.phase, 'prompt');
  assert.equal(g.state, 'paused');
  return a;
}
function accept(g: Game) {
  if (g.altar?.phase !== 'prompt') prompt(g);
  assert.equal(g.canAcceptAltar, true);
  assert.equal(g.acceptAltar(), true);
  assert.equal(g.altar?.phase, 'accepted');
  assert.equal(g.state, 'playing');
  return g.altar!;
}
function target(
  g: Game,
  offset = 150,
  elite = false,
  boss = false,
  type = STAGE_ENEMIES[g.stage][0],
) {
  const e = g.spawnEnemy(type, elite, boss, { x: g.player.x + offset, y: g.player.y });
  // 仅隔离走位、技能与击杀掉落，保留真实 hitEnemy 和伤害统计路径。
  Object.assign(e, { hp: 1e9, maxHp: 1e9, speed: 0, cooldown: 1e6, pursuitCooldown: 1e6 });
  return e;
}
function restore(g: Game) {
  const raw = structuredClone(g.snapshot());
  const h = Game.restore(structuredClone(g.save), raw, () => 0);
  assert.ok(h, `不能恢复 ${g.altar?.kind}/${g.altar?.phase}`);
  return h;
}
function medicineSave(id: string) {
  const save = character();
  save.medicine.bag[id] = 1;
  assert.equal(useMedicine(save, id).ok, true);
  return save;
}

function nightBoatSave() {
  const save = character(18);
  save.age = 2015;
  visitNightBoat(save, 15, () => 0);
  assert.ok(claimNightBoat(save));
  assert.equal(save.lifespanSpent, 3500);
  assert.equal(lifespanInfo(save).limit, 6500);
  return save;
}

test('夜船折寿后的木祭坛按有效寿限收费，恰好或超过寿尽均禁止且续局不放行', () => {
  for (const age of [5200, 5400]) {
    const g = arena(0, { save: nightBoatSave() });
    prompt(g);
    g.save.age = age;
    const before = g.player.hp;
    near(g.altarCostYears, 1300);
    assert.equal(g.canAcceptAltar, false);
    assert.equal(g.acceptAltar(), false);
    assert.equal(g.save.age, age);
    assert.equal(g.player.hp, before);
    const continued = restore(g);
    near(continued.altarCostYears, 1300);
    assert.equal(continued.canAcceptAltar, false);
    assert.equal(continued.acceptAltar(), false);
    assert.equal(continued.save.age, age);
  }
});

test('夜船折寿后可承受的木献祭只扣有效寿限两成，保留折寿且计入本局年岁', () => {
  const g = arena(0, { save: nightBoatSave() });
  prompt(g);
  g.save.age = 5000;
  const elapsed = g.elapsedYears!;
  near(g.altarCostYears, 1300);
  accept(g);
  near(g.save.age, 6300);
  near(g.elapsedYears!, elapsed + 1300);
  assert.equal(g.save.lifespanSpent, 3500);
  assert.equal(lifespanInfo(g.save).limit, 6500);
  const continued = restore(g);
  near(continued.save.age, 6300);
  near(continued.elapsedYears!, g.elapsedYears!);
  assert.equal(continued.altar!.phase, 'accepted');
});

test('前六境在55%～80%随机排期且截于妖王前60秒，实际跨过时刻才出现', () => {
  for (let stage = 0; stage < 6; stage++)
    for (const roll of [0, 0.25, 0.5, 0.999999]) {
      const g = arena(stage, { altarRandom: () => roll });
      const expected = Math.min(
        STAGES[stage].minutes * 60 * (0.55 + roll * 0.25),
        g.stageDuration - 60,
      );
      near(g.altar!.spawnAt, expected);
      g.time = expected - 0.01;
      g.update(0.005);
      assert.equal(g.altar!.phase, 'pending');
      g.update(0.01);
      assert.equal(g.altar!.phase, 'offered');
      assert.ok(g.altar!.expiresAt <= g.stageDuration - 30 + 1e-8);
    }
});

test('显现位置相对当时玩家为300～450，方位与距离使用独立随机', () => {
  for (const [angle, radius] of [
    [0, 0],
    [0.25, 0.5],
    [0.75, 0.999999],
  ]) {
    const rolls = [0, angle, radius];
    let calls = 0;
    const g = arena(0, { altarRandom: () => rolls[calls++] });
    walkTo(g, { x: -100, y: 85 });
    const at = { x: g.player.x, y: g.player.y };
    const a = offered(g);
    near(Math.hypot(a.x - at.x, a.y - at.y), 300 + radius * 150);
    near(a.x - at.x, Math.cos(angle * Math.PI * 2) * (300 + radius * 150));
    near(a.y - at.y, Math.sin(angle * Math.PI * 2) * (300 + radius * 150));
    assert.equal(calls, 3);
  }
});

test('守匣等待入阵时推迟祭坛，守匣自然到期后才显现', () => {
  const g = arena(0, { cache: true });
  g.time = g.stageDuration * 0.45 - 0.05;
  g.update(0.05);
  assert.equal(g.cacheChallenge?.phase, 'offered');
  g.time = g.altar!.spawnAt;
  g.update(0.05);
  assert.equal(g.altar!.phase, 'pending');
  g.time = g.cacheChallenge!.deadline - 0.05;
  g.update(0.05);
  assert.equal(g.cacheChallenge!.phase, 'expired');
  assert.equal(g.altar!.phase, 'offered');
});

function activeCache() {
  const g = arena(0, { cache: true });
  g.time = g.stageDuration * 0.45;
  g.update(0.01);
  assert.equal(g.cacheChallenge?.phase, 'offered');
  walkTo(g, g.cacheChallenge!);
  advance(g, 1.1);
  assert.equal(g.cacheChallenge!.phase, 'active');
  for (const e of g.enemies) Object.assign(e, { speed: 0, cooldown: 1e6 });
  g.time = g.altar!.spawnAt;
  g.update(0.01);
  assert.equal(g.altar!.phase, 'pending');
  return g;
}
test('守匣挑战期间不出现，实际击败守卫结束后再出现', () => {
  const g = activeCache();
  for (const e of [...g.enemies]) if (e.cacheGuardian) g.hitEnemy(e, e.hp * 10);
  g.update(0.01);
  assert.equal(g.cacheChallenge!.phase, 'cleared');
  assert.equal(g.altar!.phase, 'offered');
});
test('守匣推迟过最晚时刻取消，后续挑战结束也不补发', () => {
  const g = activeCache();
  g.time = g.stageDuration - 60 + 0.1;
  g.update(0.01);
  assert.equal(g.altar!.phase, 'gone');
  for (const e of [...g.enemies]) if (e.cacheGuardian) g.hitEnemy(e, e.hp * 10);
  g.update(0.01);
  assert.equal(g.altar!.phase, 'gone');
});
test('妖王真实登场会取消尚未出现和已出现的祭坛', () => {
  for (const alreadyOffered of [false, true]) {
    const g = arena();
    if (alreadyOffered) offered(g);
    g.time = g.stageDuration - 0.01;
    g.update(0.02);
    assert.ok(g.bossSpawned && g.boss);
    assert.equal(g.altar!.phase, 'gone');
  }
});
test('祭坛只停留30秒，超时后本局不再出现', () => {
  const g = arena();
  const a = offered(g);
  near(a.expiresAt - g.time, 30);
  advance(g, 29.9);
  assert.equal(a.phase, 'offered');
  advance(g, 0.2);
  assert.equal(a.phase, 'gone');
  advance(g, 10);
  assert.equal(a.phase, 'gone');
  assert.equal(g.acceptAltar(), false);
});
test('接受只生效一次，重复接受、离开和再次经过不会重复扣代价', () => {
  const g = arena(1);
  prompt(g);
  g.player.hp = 97;
  accept(g);
  assert.equal(g.player.hp, 68);
  const age = g.save.age;
  assert.equal(g.acceptAltar(), false);
  g.leaveAltar();
  assert.equal(g.player.hp, 68);
  assert.equal(g.save.age, age);
  walkTo(g, { x: g.altar!.x + 100, y: g.altar!.y });
  walkTo(g, g.altar!);
  assert.equal(g.altar!.phase, 'accepted');
  assert.equal(g.state, 'playing');
});

test('终关和独立天劫没有祭坛', () => {
  const final = arena(6);
  assert.equal(final.altar, null);
  final.update(0.05);
  assert.equal(final.altar, null);
  const source = arena(5, { save: character(21) });
  source.save.age = source.save.nextTribulationAge;
  const trial = Game.createTribulation(source.save, source);
  assert.ok(trial.tribulation > 0);
  assert.equal(trial.altar, null);
  trial.update(0.05);
  assert.equal(trial.altar, null);
});

test('手动进入70范围才暂停，阅读不推进时钟、年岁、停留期且resume不能绕过选择', () => {
  const g = arena();
  const a = offered(g);
  walkTo(g, { x: a.x - 70.01, y: a.y });
  assert.equal(g.state, 'playing');
  prompt(g);
  assert.ok(Math.hypot(g.player.x - a.x, g.player.y - a.y) <= 70);
  const before = { time: g.time, age: g.save.age, expiry: a.expiresAt, hp: g.player.hp };
  g.resume();
  advance(g, 3);
  assert.equal(g.state, 'paused');
  assert.deepEqual({ time: g.time, age: g.save.age, expiry: a.expiresAt, hp: g.player.hp }, before);
});
test('拒绝不会扣费且须先退出70范围再进入，留在范围内不反复弹窗', () => {
  const g = arena();
  const a = prompt(g);
  const hp = g.player.hp,
    age = g.save.age;
  g.leaveAltar();
  assert.equal(g.state, 'playing');
  assert.equal(a.left, false);
  assert.equal(g.player.hp, hp);
  assert.equal(g.save.age, age);
  advance(g, 0.5);
  assert.equal(a.phase, 'offered');
  walkTo(g, { x: a.x - 100, y: a.y });
  assert.equal(a.left, true);
  prompt(g);
});
test('AI误入不弹窗不扣费，坛内关闭AI也须先离开再进入', () => {
  const g = arena();
  const a = offered(g);
  g.save.autoplay = true;
  walkTo(g, a);
  assert.equal(a.phase, 'offered');
  assert.equal(a.left, false);
  assert.equal(g.state, 'playing');
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.altarHealthScale, 1);
  assert.equal(g.canAcceptAltar, false);
  const age = g.save.age,
    hp = g.player.hp;
  assert.equal(g.acceptAltar(), false);
  assert.equal(g.save.age, age);
  assert.equal(g.player.hp, hp);
  g.save.autoplay = false;
  advance(g, 0.2);
  assert.equal(a.phase, 'offered');
  assert.equal(a.left, false);
  walkTo(g, { x: a.x - 100, y: a.y });
  prompt(g);
});
test('弹窗后改为AI不能接受，直到恢复手动选择', () => {
  const g = arena(1);
  prompt(g);
  const hp = g.player.hp;
  g.save.autoplay = true;
  assert.equal(g.canAcceptAltar, false);
  assert.equal(g.acceptAltar(), false);
  assert.equal(g.player.hp, hp);
  g.save.autoplay = false;
  accept(g);
});

test('万木回春立即回满，随后20秒按每秒最大气血2%治疗，到期停止', () => {
  const g = arena();
  prompt(g);
  g.player.hp = g.player.maxHp / 4;
  const a = accept(g);
  assert.equal(g.player.hp, g.player.maxHp);
  near(a.regenUntil - g.time, 20);
  g.player.hp = g.player.maxHp * 0.1;
  const hp = g.player.hp,
    regen = g.stats.regen;
  advance(g, 20);
  near(g.player.hp, hp + g.player.maxHp * 0.4 + regen * 20);
  const after = g.player.hp;
  advance(g, 0.5);
  near(g.player.hp, after + regen * 0.5);
});
test('木祭坛年岁代价取寿限20%到一位小数，计入elapsedYears且不降低寿限', () => {
  const save = character(0);
  save.lifespanBonus = 0.7;
  const g = arena(0, { save });
  prompt(g);
  const before = { age: g.save.age, elapsed: g.elapsedYears!, limit: g.lifespan };
  assert.equal(g.altarCostYears, 20.1);
  accept(g);
  near(g.save.age - before.age, 20.1);
  near(g.elapsedYears! - before.elapsed, 20.1);
  assert.equal(g.lifespan, before.limit);
});
test('木祭坛代价会恰好寿尽或超过寿限时禁止，拒绝不扣年岁不治疗', () => {
  for (const extra of [0, 0.1]) {
    const g = arena(0, { save: character(0) });
    prompt(g);
    g.save.age = g.lifespan - g.altarCostYears + extra;
    g.player.hp /= 2;
    const before = { age: g.save.age, hp: g.player.hp, elapsed: g.elapsedYears };
    assert.equal(g.canAcceptAltar, false);
    assert.equal(g.acceptAltar(), false);
    assert.equal(g.altar!.phase, 'prompt');
    assert.deepEqual({ age: g.save.age, hp: g.player.hp, elapsed: g.elapsedYears }, before);
  }
});
test('无限寿元木祭坛代价为0，仍能实际接受且不产生NaN', () => {
  const g = arena(0, { save: character(21) });
  prompt(g);
  assert.equal(g.lifespan, Infinity);
  assert.equal(g.altarCostYears, 0);
  const age = g.save.age,
    elapsed = g.elapsedYears;
  accept(g);
  assert.equal(g.save.age, age);
  assert.equal(g.elapsedYears, elapsed);
});
test('已有蚀体阻止木祭坛即时和持续治疗，解除后剩余疗效恢复', () => {
  const g = arena();
  prompt(g);
  g.player.hp = g.player.maxHp / 3;
  g.leaveAltar();
  g.player.invincible = 0;
  g.hurtPlayer(1, false, true);
  assert.equal(g.corroded, 3);
  walkTo(g, { x: g.altar!.x - 90, y: g.altar!.y });
  prompt(g);
  const hp = g.player.hp;
  accept(g);
  assert.equal(g.player.hp, hp);
  advance(g, 0.2);
  assert.equal(g.player.hp, hp);
  advance(g, 3);
  assert.ok(g.player.hp > hp);
});

test('焚天经hitEnemy按普通50%、精英和木心15%最大血伤害，boss免疫且来源为altar', (t) => {
  const g = arena(1, { save: medicineSave('mingqing') });
  prompt(g);
  const normal = target(g),
    elite = target(g, 180, true);
  const shield = target(
    g,
    210,
    false,
    false,
    ENEMIES.findIndex((e) => e.behavior === 'shield'),
  );
  const boss = target(g, 500, false, true);
  const heart = target(g, 230);
  heart.bossSummon = { kind: 'heart', age: 0, side: 1 };
  heart.summonedBy = boss.id;
  normal.hp *= 0.75;
  const before = new Map(g.enemies.map((e) => [e.id, e.hp]));
  const spy = t.mock.method(g, 'hitEnemy');
  accept(g);
  for (const [e, share] of [
    [normal, 0.5],
    [elite, 0.15],
    [shield, 0.5],
    [heart, 0.15],
  ] as const)
    near(before.get(e.id)! - e.hp, e.maxHp * share);
  assert.equal(boss.hp, before.get(boss.id));
  assert.equal(spy.mock.calls.length, 4);
  for (const call of spy.mock.calls) {
    assert.equal(call.arguments[2], false);
    assert.equal(call.arguments[3], 'altar');
  }
  near(
    g.damageBySource.altar,
    normal.maxHp * 0.5 + elite.maxHp * 0.15 + shield.maxHp * 0.5 + heart.maxHp * 0.15,
  );
  near(g.damageDealt, g.damageBySource.altar);
});
test('火祭坛扣当前气血30%向下取整，最低留1；实际击杀照常统计真实扣血', () => {
  for (const hp of [1, 2, 97]) {
    const g = arena(1);
    prompt(g);
    const e = target(g);
    e.hp = 10;
    g.player.hp = hp;
    accept(g);
    assert.equal(g.player.hp, hp === 97 ? 68 : hp);
    assert.equal(e.dead, true);
    assert.equal(g.kills, 1);
    assert.equal(g.damageBySource.altar, 10);
  }
});

test('冰封8秒暂停移动、接触、出招蓄力和冲刺计时，已有弹丸仍飞行，新怪不冻', () => {
  const g = arena(2);
  prompt(g);
  const caster = target(g, 150),
    charger = target(g, 200),
    contact = target(g, 1);
  Object.assign(caster, { speed: 120, cooldown: 2, windup: 0.4, pendingSkill: 'frostbolt' });
  Object.assign(charger, { speed: 120, charge: 0.3, dx: 1, dy: 0 });
  const shot = g.hostileShot(caster, 1, 0, 100, 10);
  const origin = shot.x,
    cooldown = caster.cooldown;
  const at = g.enemies.map((e) => [e.x, e.y]);
  const a = accept(g),
    start = g.time;
  for (const e of [caster, charger, contact]) near(e.frozenUntil!, start + 8);
  const hp = g.player.hp;
  const newcomer = target(g, 400);
  newcomer.speed = 100;
  advance(g, 1);
  assert.deepEqual(
    g.enemies.slice(0, 3).map((e) => [e.x, e.y]),
    at,
  );
  assert.equal(caster.cooldown, cooldown);
  assert.equal(caster.windup, 0.4);
  assert.equal(caster.pendingSkill, 'frostbolt');
  assert.equal(charger.charge, 0.3);
  assert.equal(g.player.hp, hp); // 满血且未被冻结目标接触。
  near(shot.x - origin, 100);
  assert.equal(g.shots.length, 1);
  assert.equal(newcomer.frozenUntil, undefined);
  assert.ok(newcomer.x < g.player.x + 400);
  near(a.slowUntil - start, 20);
});
test('冰冻目标受伤+30%，boss不冰冻不增伤，8秒后技能与走位继续，移速代价20秒', () => {
  const g = arena(2);
  prompt(g);
  const e = target(g, 200),
    boss = target(g, 550, false, true);
  e.speed = 100;
  const speed = g.stats.speed;
  accept(g);
  assert.equal(boss.frozenUntil, undefined);
  near(g.stats.speed, speed * 0.75);
  let hp = e.hp;
  g.hitEnemy(e, 100, false, 'sword');
  near(hp - e.hp, 130);
  hp = boss.hp;
  g.hitEnemy(boss, 100, false, 'sword');
  near(hp - boss.hp, 100);
  const x = e.x,
    cooldown = e.cooldown;
  advance(g, 7.9);
  assert.equal(e.x, x);
  assert.equal(e.cooldown, cooldown);
  advance(g, 0.2);
  assert.ok(e.x < x);
  assert.ok(e.cooldown < cooldown);
  advance(g, 12);
  near(g.stats.speed, speed);
});
test('冻结时法宝牵引、区域牵引和击退均不移动妖物；未冻对照确认招式实际命中', () => {
  for (const id of ['pulse', 'whip', 'vortex', 'dragon', 'axe'] as const) {
    for (const frozen of [true, false]) {
      const g = arena(2);
      prompt(g);
      const e = target(g, id === 'vortex' ? 150 : 100);
      if (id === 'vortex') target(g, 100); // 阵心放在较近目标，核对另一只妖物的牵引。
      if (frozen) accept(g);
      else g.leaveAltar();
      const before = { x: e.x, y: e.y, hp: e.hp };
      const weapon: Weapon = { id, level: 1, evolved: false, timer: 1e6 };
      g.cast(weapon);
      advance(g, 1.1);
      assert.ok(e.hp < before.hp, `${id}应真实命中`);
      if (frozen) assert.deepEqual({ x: e.x, y: e.y }, { x: before.x, y: before.y }, id);
      else assert.ok(Math.hypot(e.x - before.x, e.y - before.y) > 0.01, `${id}未冻时应产生位移`);
    }
  }
});

test('毒祭坛30秒所有伤害+40%，boss不增伤也不受altar直伤，到期恢复', () => {
  const g = arena(3);
  accept(g);
  near(g.altar!.damageUntil - g.time, 30);
  for (const source of ['sword', 'bone', 'other', 'cauldron', 'altar']) {
    const e = target(g);
    g.hitEnemy(e, 100, false, source);
    near(e.maxHp - e.hp, 140);
  }
  const boss = target(g, 500, false, true);
  g.hitEnemy(boss, 100, false, 'sword');
  near(boss.maxHp - boss.hp, 100);
  const hp = boss.hp;
  g.hitEnemy(boss, 100, false, 'altar');
  assert.equal(boss.hp, hp);
  advance(g, 30.05);
  const e = target(g);
  g.hitEnemy(e, 100, false, 'sword');
  near(e.maxHp - e.hp, 100);
});
test('毒祭坛直接蚀体30秒不受清灵散减半，其他毒命中不缩短，全部治疗路径受阻', () => {
  const g = arena(3, { save: medicineSave('qingling') });
  accept(g);
  near(g.corroded, 30);
  g.player.hp = g.player.maxHp / 2;
  const hp = g.player.hp;
  advance(g, 10);
  near(g.corroded, 20);
  assert.equal(g.player.hp, hp);
  g.player.invincible = 0;
  g.hurtPlayer(1, false, true);
  near(g.corroded, 20);
  const wounded = g.player.hp;
  g.pickups.push(
    { kind: 'heal', x: g.player.x, y: g.player.y, value: 1, pull: false },
    { kind: 'chest', x: g.player.x, y: g.player.y, value: 1, pull: false },
  );
  g.passives.devour = 5;
  const e = target(g, 100);
  g.cast({ id: 'cauldron', level: 1, evolved: false, timer: 1e6 });
  g.cast({ id: 'bloodpool', level: 1, evolved: false, timer: 1e6 });
  advance(g, 0.1);
  assert.ok(e.hp < e.maxHp);
  assert.equal(g.player.hp, wounded);
  g.hitEnemy(e, e.hp * 10);
  assert.equal(g.player.hp, wounded);
  assert.ok(g.pickups.some((p) => p.kind === 'heal'));
  assert.ok(!g.pickups.some((p) => p.kind === 'chest'));
  g.pickups = [];
  advance(g, 20);
  assert.equal(g.corroded, 0);
  assert.ok(g.player.hp > wounded);
});

test('冥府借命持续30秒致命留1，直接受伤和灼烧均生效，结束后仍可被杀', () => {
  const g = arena(4);
  const a = accept(g);
  near(a.deathUntil - g.time, 30);
  g.player.hp = 2;
  g.player.invincible = 0;
  g.hurtPlayer(g.player.maxHp * 10, true);
  assert.equal(g.player.hp, 1);
  assert.ok(g.burning.life > 0);
  g.update(0.05);
  assert.equal(g.player.hp, 1);
  assert.equal(g.state, 'playing');
  g.time = a.deathUntil + 0.01;
  g.player.invincible = 0;
  g.hurtPlayer(g.player.maxHp * 10);
  g.update(0.01);
  assert.equal(g.player.hp, 0);
  assert.equal(g.state, 'lost');
});
test('冥府借命不免自然寿尽', () => {
  const g = arena(4, { save: character(0) });
  accept(g);
  g.save.age = g.lifespan - 0.001;
  g.update(0.05);
  assert.equal(g.expired, true);
  assert.equal(g.player.hp, 0);
  assert.equal(g.state, 'lost');
});
test('冥府借命最大血x0.8贯穿本局及药效到期重算，新局恢复原上限', () => {
  const save = medicineSave('jinsui');
  const g = arena(4, { save });
  const fullWithMedicine = g.player.maxHp;
  const plainSave = structuredClone(save);
  plainSave.medicine.active = {};
  const plainMax = arena(4, { save: plainSave }).player.maxHp;
  prompt(g);
  accept(g);
  assert.equal(g.altarHealthScale, 0.8);
  near(g.player.maxHp, Math.round(fullWithMedicine * 0.8));
  g.save.age = g.save.medicine.active.jinsui - 0.001;
  g.update(0.05);
  near(g.player.maxHp, Math.round(plainMax * 0.8));
  advance(g, 30.1);
  near(g.player.maxHp, Math.round(plainMax * 0.8));
  const next = arena(4, { save: structuredClone(g.save) });
  assert.equal(next.altarHealthScale, 1);
  assert.equal(next.player.maxHp, plainMax);
});

test('雷祭坛每2秒随机选600内至多3只非boss，按本命当前单发x5且不暴击', (t) => {
  let calls = 0;
  const g = arena(5, {
    altarRandom: () => {
      calls++;
      return 0;
    },
  });
  accept(g);
  const targets = [150, 300, 450, 600].map((offset) => target(g, offset, offset === 300));
  const outside = target(g, 600.01),
    boss = target(g, 500, false, true);
  const spy = t.mock.method(g, 'hitEnemy');
  const before = calls;
  advance(g, 1.95);
  assert.equal(spy.mock.calls.length, 0);
  advance(g, 0.05);
  const hits = spy.mock.calls;
  assert.equal(hits.length, 3);
  assert.equal(new Set(hits.map((call) => call.arguments[0].id)).size, 3);
  for (const call of hits) {
    assert.ok(targets.includes(call.arguments[0]));
    near(call.arguments[1], g.weaponHitDamage(g.weapons[0]) * 5);
    assert.equal(call.arguments[2], false);
    assert.equal(call.arguments[3], 'altar');
  }
  assert.equal(calls - before, 3);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(boss.hp, boss.maxHp);
  const initialDamage = hits[0].arguments[1];
  g.weapons[0].level = 2;
  g.passives.curse = 5;
  advance(g, 2);
  assert.equal(spy.mock.calls.length, 6);
  for (const call of spy.mock.calls.slice(3)) {
    near(call.arguments[1], g.weaponHitDamage(g.weapons[0]) * 5);
    assert.ok(call.arguments[1] > initialDamage);
    assert.equal(call.arguments[2], false);
  }
});
test('雷祭坛不足3个目标只各劈一次，没有目标不抽签不伤boss', () => {
  for (const count of [0, 1, 2]) {
    let calls = 0;
    const g = arena(5, {
      altarRandom: () => {
        calls++;
        return 0;
      },
    });
    accept(g);
    const targets = Array.from({ length: count }, (_, i) => target(g, 150 + i * 100));
    const boss = target(g, 500, false, true),
      before = calls;
    advance(g, 2);
    assert.equal(calls - before, count);
    for (const e of targets) near(e.maxHp - e.hp, g.weaponHitDamage(g.weapons[0]) * 5);
    assert.equal(boss.hp, boss.maxHp);
  }
});
test('雷代价6秒在脚下留半径60、预警1秒、最大血15%的无状态blast，可走出躲避', () => {
  for (const dodge of [false, true]) {
    const g = arena(5);
    accept(g);
    advance(g, 5.95);
    assert.equal(g.zones.length, 0);
    const at = { x: g.player.x, y: g.player.y };
    g.update(0.05);
    assert.equal(g.zones.length, 1);
    const z = g.zones[0];
    assert.deepEqual({ x: z.x, y: z.y }, at);
    assert.equal(z.kind, 'blast');
    assert.equal(z.hostile, true);
    assert.equal(z.radius, 60);
    assert.equal(z.castDelay, 1);
    near(z.damage, g.player.maxHp * 0.15);
    assert.equal(g.player.hp, g.player.maxHp);
    if (dodge) walkTo(g, { x: at.x + 100, y: at.y });
    advance(g, 1.2);
    if (dodge) assert.equal(g.player.hp, g.player.maxHp);
    else assert.ok(g.player.hp < g.player.maxHp);
    assert.equal(
      g.slowed + g.immobilized + g.sealed + g.entangled + g.corroded + g.burning.life,
      0,
    );
  }
});

test('有无祭坛不改变主随机调用数，显现和雷选目标只消费注入的独立随机', () => {
  for (const stage of [0, 5]) {
    let mainA = 0,
      mainB = 0,
      altarCalls = 0;
    const g = arena(stage, {
      random: () => {
        mainA++;
        return 0.5;
      },
      altarRandom: () => {
        altarCalls++;
        return 0;
      },
    });
    const control = arena(stage, {
      random: () => {
        mainB++;
        return 0.5;
      },
    });
    // 无祭坛对照使用合法旧快照语义，仅用来隔离随机流；本组不验证该对照的交互。
    control.altar = null;
    offered(g);
    prompt(g);
    accept(g);
    control.time = g.time;
    for (const run of [g, control]) for (let i = 0; i < 4; i++) target(run, 100 + i * 100);
    const before = altarCalls;
    advance(g, 2);
    advance(control, 2);
    assert.equal(mainA, mainB);
    assert.equal(altarCalls - before, stage === 5 ? 3 : 0);
    assert.equal(mainA, 8); // 四只已指定种类妖物的原有方位/冷却抽签。
  }
});
test('模块加载后替换全局Math.random，默认祭坛构造、显现和恢复均不消耗替换源或g.random', () => {
  const save = character();
  const original = Math.random;
  let globalCalls = 0,
    combatCalls = 0;
  try {
    Math.random = () => {
      globalCalls++;
      return 0.4;
    };
    const g = new Game(save, 0, 0, () => {
      combatCalls++;
      return 0.5;
    });
    quiet(g);
    g.cacheChallenge = { x: 10000, y: 10000, deadline: 0, phase: 'expired', guardians: [] };
    assert.equal(globalCalls, 0);
    offered(g);
    assert.equal(globalCalls, 0);
    assert.equal(combatCalls, 0);
    const h = Game.restore(structuredClone(save), structuredClone(g.snapshot()));
    assert.ok(h);
    assert.equal(globalCalls, 0);
    assert.equal(combatCalls, 0);
  } finally {
    Math.random = original;
  }
});

test('所有持续效果与冻结截止不越过stageDuration，最后落雷预警也不越过妖王登场', () => {
  for (let stage = 0; stage < 6; stage++) {
    const g = arena(stage, { altarRandom: () => 0.999999 });
    const a = offered(g);
    const distance = Math.hypot(a.x - g.player.x, a.y - g.player.y);
    walkTo(g, {
      x: a.x - ((a.x - g.player.x) / distance) * 70.01,
      y: a.y - ((a.y - g.player.y) / distance) * 70.01,
    });
    assert.equal(a.phase, 'offered');
    g.time = a.expiresAt - 0.1;
    prompt(g);
    const e = target(g);
    accept(g);
    for (const key of [
      'regenUntil',
      'slowUntil',
      'damageUntil',
      'deathUntil',
      'thunderUntil',
    ] as const)
      assert.ok(a[key] <= g.stageDuration);
    if (e.frozenUntil !== undefined) assert.ok(e.frozenUntil <= g.stageDuration);
    if (stage === 5) {
      g.player.invincible = 1e6;
      advance(g, 29.95);
      assert.ok(
        g.zones.every((z) => g.time + Math.max(0, z.delay) + z.life <= g.stageDuration + 1e-8),
      );
    }
  }
});

test('每个phase快照往返保留状态且不重抽，prompt恢复后仍暂停直到真实选择', () => {
  const phases: AltarState['phase'][] = ['pending', 'offered', 'prompt', 'accepted', 'gone'];
  for (const phase of phases) {
    const g = arena(0);
    if (phase !== 'pending') offered(g);
    if (phase === 'prompt' || phase === 'accepted') prompt(g);
    if (phase === 'accepted') accept(g);
    if (phase === 'gone') advance(g, 30.1);
    let calls = 0;
    const raw = structuredClone(g.snapshot());
    const h = Game.restore(structuredClone(g.save), raw, () => {
      calls++;
      return 0;
    });
    assert.ok(h, phase);
    assert.equal(calls, 0);
    assert.deepEqual(h.altar, raw.altar);
    h.update(0.05);
    assert.equal(h.time, raw.time);
    if (phase === 'prompt') {
      h.resume();
      assert.equal(h.state, 'paused');
      assert.equal(h.canAcceptAltar, true);
      h.leaveAltar();
      assert.equal(h.altar!.left, false);
    } else if (phase === 'pending') {
      h.resume();
      offered(h);
      assert.equal(calls, 2);
    }
    h.altar!.x += 1;
    assert.notEqual(h.altar!.x, raw.altar!.x);
  }
});
test('冰冻结计时、魂最大血缩放和毒蚀体在快照恢复后继续，不重复付费', () => {
  for (const stage of [2, 3, 4]) {
    const g = arena(stage);
    prompt(g);
    const e = target(g);
    accept(g);
    advance(g, 1);
    g.pause();
    const hp = g.player.maxHp,
      age = g.save.age;
    const h = restore(g);
    assert.deepEqual(h.altar, g.altar);
    assert.equal(h.player.maxHp, hp);
    assert.equal(h.altarHealthScale, stage === 4 ? 0.8 : 1);
    assert.equal(h.enemies[0].frozenUntil, e.frozenUntil);
    near(h.corroded, g.corroded);
    assert.equal(h.acceptAltar(), false);
    assert.equal(h.save.age, age);
    h.resume();
    advance(h, 0.5);
    if (stage === 2) assert.equal(h.enemies[0].cooldown, e.cooldown);
    if (stage === 3) near(h.corroded, g.corroded - 0.5);
    assert.equal(h.player.maxHp, hp);
  }
});
test('祭坛伤害来源及已生成天雷预警可保存恢复，不重新施加接受效果', () => {
  const g = arena(5);
  accept(g);
  target(g);
  advance(g, 6);
  g.pause();
  assert.ok(g.damageBySource.altar > 0);
  assert.ok(g.zones.some((z) => z.kind === 'blast'));
  const h = restore(g);
  assert.equal(h.damageBySource.altar, g.damageBySource.altar);
  assert.deepEqual(h.zones, g.zones);
  assert.equal(h.altar!.nextThunderAt, g.altar!.nextThunderAt);
  assert.equal(h.altar!.nextBacklashAt, g.altar!.nextBacklashAt);
  h.resume();
  advance(h, 0.2);
  assert.equal(h.damageBySource.altar, g.damageBySource.altar);
});
test('非法有限性、阶段、种类、寿命截止与缩放的快照均拒绝', () => {
  const g = arena(4);
  accept(g);
  g.pause();
  const raw = g.snapshot();
  assert.ok(Game.restore(structuredClone(g.save), structuredClone(raw), () => 0));
  for (const field of [
    'x',
    'y',
    'spawnAt',
    'expiresAt',
    'regenUntil',
    'slowUntil',
    'damageUntil',
    'deathUntil',
    'thunderUntil',
    'nextThunderAt',
    'nextBacklashAt',
  ] as const)
    for (const value of [NaN, Infinity, -Infinity, null]) {
      const bad = structuredClone(raw);
      Object.assign(bad.altar!, { [field]: value });
      assert.equal(Game.restore(structuredClone(g.save), bad), null, `${field}/${value}`);
    }
  for (const patch of [
    { phase: 'invalid' },
    { phase: 'pending' },
    { phase: 'prompt', left: true },
    { kind: 'wood' },
    { left: 1 },
    { spawnAt: g.stageDuration * 0.54 },
    { spawnAt: g.stageDuration - 59 },
    { expiresAt: g.stageDuration },
    { deathUntil: g.stageDuration + 0.01 },
  ]) {
    const bad = structuredClone(raw);
    Object.assign(bad.altar!, patch);
    assert.equal(Game.restore(structuredClone(g.save), bad), null, JSON.stringify(patch));
  }
  for (const scale of [NaN, Infinity, null, 0, 0.7, 1.1])
    assert.equal(
      Game.restore(structuredClone(g.save), { ...structuredClone(raw), altarHealthScale: scale }),
      null,
    );
  const unrelated = arena(0);
  assert.equal(
    Game.restore(unrelated.save, { ...unrelated.snapshot(), altarHealthScale: 0.8 }),
    null,
  );
});
test('prompt配playing、boss冻结与非法frozenUntil均拒绝，合法冻结使用真实接受生成', () => {
  const g = arena(2);
  prompt(g);
  assert.equal(Game.restore(g.save, { ...g.snapshot(), state: 'playing' }), null);
  target(g);
  const boss = target(g, 500, false, true);
  accept(g);
  g.pause();
  const raw = g.snapshot();
  assert.ok(Game.restore(structuredClone(g.save), structuredClone(raw)));
  for (const value of [NaN, Infinity, null, -1, g.time + 8.01]) {
    const bad = structuredClone(raw);
    Object.assign(bad.enemies[0], { frozenUntil: value });
    assert.equal(Game.restore(structuredClone(g.save), bad), null);
  }
  const bad = structuredClone(raw);
  bad.enemies.find((e) => e.id === boss.id)!.frozenUntil = g.time + 1;
  assert.equal(Game.restore(structuredClone(g.save), bad), null);
});

test('蚀体校验只对已接受毒祭坛扩展到实际剩余时长，越界和其他祭坛不放宽', () => {
  const g = arena(3);
  accept(g);
  advance(g, 10);
  g.pause();
  const raw = g.snapshot();
  near(raw.corroded, 20);
  assert.ok(Game.restore(structuredClone(g.save), structuredClone(raw)));
  assert.equal(
    Game.restore(structuredClone(g.save), { ...structuredClone(raw), corroded: 20.001 }),
    null,
  );
  const wood = arena();
  accept(wood);
  wood.pause();
  assert.equal(Game.restore(wood.save, { ...wood.snapshot(), corroded: 3.001 }), null);
});
