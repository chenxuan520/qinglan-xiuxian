import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/battle/game.ts';
import { xpNeeded } from '../../src/core/data.ts';
import { freshSave } from '../../src/core/progress.ts';

function encounter(origin = 6, arena = 6) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5];
  save.cultivation = 119940;
  const game = new Game(save, arena, 0, () => 0.5);
  game.time = 400;
  game.bossSpawned = true;
  game.trialBossesSpawned = 7;
  game.trialBossesDefeated = 6;
  game.nextTrialBossAt = game.nextElite = 99999;
  game.weapons[0].timer = 99999;
  game.player.invincible = 99999;
  const boss = game.spawnEnemy(10, false, true, { x: -300, y: 0 }, origin);
  boss.speed = 0;
  boss.cooldown = boss.pursuitCooldown = 99999;
  game.notice = '';
  return { game, boss };
}

function advance(game: Game, seconds: number) {
  // 二进制整步让三秒边界可精确断言；最后不足整步仍经真实 update 推进。
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 1 / 32)
    game.update(Math.min(1 / 32, seconds - elapsed));
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= 1e-6, `${actual} != ${expected}`);
}

function recoveryWithCast() {
  const encounterState = encounter();
  const { game, boss } = encounterState;
  boss.hp = boss.maxHp / 2;
  boss.lastHurtAt = game.time - 3;
  boss.cooldown = 0;
  boss.skillStep = 0;
  boss.bossSkillQueue = [1, 2, 3, 4, 5, 6, 7, 8];
  game.noticeTime = 0;
  return encounterState;
}

test('仙尊从登场起等待三秒，每秒恢复最大气血的百分之一', () => {
  const { game, boss } = encounter();
  assert.equal(boss.lastHurtAt, 400);
  boss.hp = boss.maxHp / 2;
  const initial = boss.hp;
  advance(game, 3 - 1 / 32);
  assert.equal(boss.hp, initial);
  assert.equal(game.notice, '');
  advance(game, 1);
  near(boss.hp, initial + boss.maxHp * 0.01);
  assert.equal(game.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
});

test('跨过三秒门槛后按完整 dt 回血，等于三秒也恢复整帧', () => {
  const { game, boss } = encounter();
  boss.hp = boss.maxHp / 2;
  const initial = boss.hp;
  game.time = boss.lastHurtAt! + 2.98;
  game.update(0.05);
  near(boss.hp, initial + boss.maxHp * 0.01 * 0.05);
  const exact = encounter();
  exact.boss.hp = exact.boss.maxHp / 2;
  exact.game.time = exact.boss.lastHurtAt! + 3 - 1 / 32;
  exact.game.update(1 / 32);
  assert.equal(exact.game.time - exact.boss.lastHurtAt!, 3);
  near(exact.boss.hp, exact.boss.maxHp / 2 + (exact.boss.maxHp * 0.01) / 32);
});

test('实际正伤记录战斗时间，并重新开始三秒等待，持续正伤阻止回血', () => {
  const { game, boss } = encounter();
  boss.hp = boss.maxHp / 2;
  for (let i = 0; i < 3; i++) {
    const before = boss.hp;
    advance(game, 2);
    assert.equal(boss.hp, before);
    game.hitEnemy(boss, 10);
    assert.equal(boss.lastHurtAt, game.time);
    assert.ok(boss.hp < before);
  }
  const initial = boss.hp;
  advance(game, 3 - 1 / 32);
  assert.equal(boss.hp, initial);
  advance(game, 0.5);
  near(boss.hp, initial + boss.maxHp * 0.005);
  game.hitEnemy(boss, 10);
  const hurt = boss.hp;
  advance(game, 3 - 1 / 32);
  assert.equal(boss.hp, hurt);
});

test('零伤不刷新 lastHurtAt，也不会打断已经开始的回元', () => {
  const { game, boss } = encounter();
  boss.hp = boss.maxHp / 2;
  const initial = boss.hp;
  advance(game, 2);
  game.hitEnemy(boss, 0);
  assert.equal(boss.lastHurtAt, 400);
  advance(game, 1 - 1 / 32);
  assert.equal(boss.hp, initial);
  advance(game, 1);
  near(boss.hp, initial + boss.maxHp * 0.01);
  game.hitEnemy(boss, 0);
  assert.equal(boss.lastHurtAt, 400);
  advance(game, 1);
  near(boss.hp, initial + boss.maxHp * 0.02);
});

test('前六境妖王、终关旧王与普通妖物不获得仙尊回血', () => {
  for (let origin = 0; origin < 6; origin++) {
    for (const arena of [origin, 6]) {
      const { game, boss } = encounter(origin, arena);
      boss.hp = boss.maxHp / 2;
      const initial = boss.hp;
      advance(game, 4);
      assert.equal(boss.hp, initial);
      assert.doesNotMatch(game.notice, /劫息回元/);
    }
  }
  const { game, boss } = encounter(6, 0);
  boss.hp = boss.maxHp / 2;
  const initial = boss.hp;
  advance(game, 4);
  assert.equal(boss.hp, initial);
  const mob = game.spawnEnemy(0, false, false, { x: 500, y: 500 });
  mob.bossStage = 6;
  mob.hp = mob.maxHp / 2;
  mob.speed = 0;
  mob.cooldown = 99999;
  const mobHp = mob.hp;
  advance(game, 4);
  assert.equal(mob.hp, mobHp);
});

test('独立天劫的 bossStage 6 核心不回元', () => {
  const { game: source } = encounter();
  const game = Game.createTribulation(source.save, source);
  const boss = game.enemies[0];
  boss.hp = boss.maxHp / 2;
  game.weapons[0].timer = 99999;
  game.player.invincible = 99999;
  const initial = boss.hp;
  advance(game, 4);
  assert.equal(boss.hp, initial);
  assert.doesNotMatch(game.notice, /劫息回元/);
});

test('未受伤的小怪和旧王不补时间戳，只有实际正伤才记录且续局保留', () => {
  const { game, boss } = encounter(5);
  const mob = game.spawnEnemy(0, false, false, { x: 500, y: 500 });
  for (const enemy of [boss, mob]) {
    assert.equal(Object.hasOwn(enemy, 'lastHurtAt'), false);
    game.hitEnemy(enemy, 0);
    assert.equal(Object.hasOwn(enemy, 'lastHurtAt'), false);
  }
  const old = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())));
  assert.ok(old);
  for (const enemy of old.enemies) assert.equal(Object.hasOwn(enemy, 'lastHurtAt'), false);
  for (const enemy of [boss, mob]) {
    game.hitEnemy(enemy, 1);
    assert.equal(enemy.lastHurtAt, game.time);
  }
  const hurt = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())));
  assert.ok(hurt);
  for (const enemy of hurt.enemies) assert.equal(enemy.lastHurtAt, game.time);
});

test('死亡、零气血的仙尊不能复活；满血不提示，恢复不超过上限', () => {
  for (const dead of [false, true]) {
    const { game, boss } = encounter();
    boss.hp = dead ? boss.maxHp / 2 : 0;
    boss.dead = dead;
    const initial = boss.hp;
    advance(game, 4);
    assert.equal(boss.hp, initial);
    assert.doesNotMatch(game.notice, /劫息回元/);
  }
  const { game, boss } = encounter();
  advance(game, 4);
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(game.snapshot().sovereignRecoveryAnnounced, undefined);
  boss.hp = boss.maxHp - 1;
  advance(game, 1);
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(game.snapshot().sovereignRecoveryAnnounced, true);
});

test('暂停和选技冻结战斗计时及回血', () => {
  const { game, boss } = encounter();
  boss.hp = boss.maxHp / 2;
  advance(game, 2);
  const time = game.time,
    hp = boss.hp;
  game.pause();
  advance(game, 10);
  assert.equal(game.time, time);
  assert.equal(boss.hp, hp);
  game.state = 'upgrade';
  advance(game, 10);
  assert.equal(game.time, time);
  assert.equal(boss.hp, hp);
  game.state = 'playing';
  advance(game, 1 - 1 / 32);
  assert.equal(boss.hp, hp);
  advance(game, 0.5);
  near(boss.hp, hp + boss.maxHp * 0.005);
});

test('续局保留实际受伤时刻和剩余等待，暂停期间不补算回血', () => {
  const { game, boss } = encounter();
  advance(game, 1);
  game.hitEnemy(boss, boss.maxHp / 4);
  advance(game, 2);
  const hp = boss.hp;
  game.pause();
  const saved = JSON.parse(JSON.stringify(game.snapshot()));
  const restored = Game.restore(game.save, saved);
  assert.ok(restored);
  const recoveredBoss = restored.enemies.find((e) => e.id === boss.id)!;
  assert.equal(recoveredBoss.lastHurtAt, 401);
  advance(restored, 10);
  assert.equal(restored.time, game.time);
  assert.equal(recoveredBoss.hp, hp);
  restored.resume();
  advance(restored, 1 - 1 / 32);
  assert.equal(recoveredBoss.hp, hp);
  advance(restored, 0.25);
  near(recoveredBoss.hp, hp + recoveredBoss.maxHp * 0.0025);
  assert.equal(saved.enemies[0].lastHurtAt, 401);
});

test('旧续局缺失 lastHurtAt 时从读档战斗时刻重新等待三秒', () => {
  const { game, boss } = encounter();
  advance(game, 5);
  boss.hp = boss.maxHp / 2;
  const old = JSON.parse(JSON.stringify(game.snapshot()));
  delete old.enemies[0].lastHurtAt;
  delete old.sovereignRecoveryAnnounced;
  const restored = Game.restore(game.save, old);
  assert.ok(restored);
  const recoveredBoss = restored.enemies.find((e) => e.id === boss.id)!;
  assert.equal(recoveredBoss.lastHurtAt, old.time);
  assert.equal(old.enemies[0].lastHurtAt, undefined);
  restored.resume();
  advance(restored, 3 - 1 / 32);
  assert.equal(recoveredBoss.hp, boss.hp);
  advance(restored, 0.25);
  near(recoveredBoss.hp, boss.hp + boss.maxHp * 0.0025);
  assert.equal(restored.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
});

test('每局首次实际回血只播报一次，后续受伤回元及刷新续局均不重播', () => {
  const { game, boss } = encounter();
  game.hitEnemy(boss, boss.maxHp / 4);
  advance(game, 3.25);
  assert.equal(game.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
  assert.equal(game.snapshot().sovereignRecoveryAnnounced, true);
  game.acknowledgeSovereignRecoveryNotice();
  game.notice = '';
  game.hitEnemy(boss, 10);
  advance(game, 3.25);
  assert.equal(game.notice, '');
  const restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())));
  assert.ok(restored);
  assert.equal(restored.snapshot().sovereignRecoveryAnnounced, true);
  const recoveredBoss = restored.enemies.find((e) => e.id === boss.id)!;
  game.notice = restored.notice = '';
  restored.resume();
  restored.hitEnemy(recoveredBoss, 10);
  advance(restored, 3.25);
  assert.equal(restored.notice, '');
  assert.equal(restored.snapshot().sovereignRecoveryAnnounced, true);
  assert.equal(Object.hasOwn(game.save, 'sovereignRecoveryAnnounced'), false);
});

test('续局严格校验 lastHurtAt 的有限时间和可选 once 布尔标记', () => {
  const { game } = encounter();
  const snapshot = game.snapshot();
  for (const lastHurtAt of [NaN, Infinity, -Infinity, '400', null])
    assert.equal(
      Game.restore(game.save, {
        ...snapshot,
        enemies: [{ ...snapshot.enemies[0], lastHurtAt }],
      }),
      null,
    );
  for (const lastHurtAt of [-1, snapshot.time + 1])
    assert.ok(
      Game.restore(game.save, {
        ...snapshot,
        enemies: [{ ...snapshot.enemies[0], lastHurtAt }],
      }),
    );
  for (const sovereignRecoveryAnnounced of [1, 'true', null, [], {}])
    assert.equal(Game.restore(game.save, { ...snapshot, sovereignRecoveryAnnounced }), null);
  for (const sovereignRecoveryAnnounced of [undefined, false, true])
    assert.ok(Game.restore(game.save, { ...snapshot, sovereignRecoveryAnnounced }));
});

test('首次回血遇同帧出招保留真实播报，仅HUD确认能消费回元事实', () => {
  const { game, boss } = recoveryWithCast();
  const hp = boss.hp;
  game.update(0.01);
  assert.ok(boss.hp > hp);
  assert.ok(game.shots.length > 0);
  assert.ok(boss.cooldown > 0);
  assert.equal(game.notice, '九天执劫仙尊 · 诛仙雷轮');
  assert.ok(game.noticeTime > 0);
  assert.equal(game.snapshot().sovereignRecoveryAnnounced, true);
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
  boss.cooldown = 99999;
  advance(game, 3 + 1 / 32);
  assert.equal(game.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
  game.acknowledgeSovereignRecoveryNotice();
  assert.equal(game.snapshot().sovereignRecoveryPending, undefined);
  game.notice = '';
  advance(game, 4);
  assert.equal(game.notice, '');
});

test('仙尊继续按原冷却出招时，即时播报保持且模拟步不能吞掉待呈现事实', () => {
  const { game, boss } = recoveryWithCast();
  game.update(0.01);
  const skillNotices = new Set([game.notice]);
  for (let step = 0; step < 6 * 32; step++) {
    game.update(1 / 32);
    assert.equal(game.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
    if (game.notice !== '九天执劫仙尊 · 劫息回元') skillNotices.add(game.notice);
  }
  assert.ok(skillNotices.size > 1);
  assert.ok(boss.cooldown > 0);
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
});

test('提示窗口到期及下一空帧都不能替HUD消费待呈现事实', () => {
  const { game, boss } = recoveryWithCast();
  game.update(0.01);
  boss.cooldown = 99999;
  advance(game, 3 - 1 / 32);
  boss.cooldown = 0;
  game.update(1 / 32);
  assert.notEqual(game.notice, '九天执劫仙尊 · 劫息回元');
  assert.ok(game.noticeTime > 0);
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
  game.update(1 / 32);
  assert.equal(game.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
  assert.ok(game.noticeTime > 0);
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
});

test('排队期间暂停及多次续局不丢失提示，即使仙尊已满血也只兑现一次', () => {
  const { game, boss } = recoveryWithCast();
  game.update(0.01);
  boss.cooldown = 99999;
  boss.hp = boss.maxHp;
  game.pause();
  const time = game.time;
  advance(game, 5);
  assert.equal(game.time, time);
  let restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())));
  assert.ok(restored);
  assert.equal(restored.snapshot().sovereignRecoveryPending, true);
  advance(restored, 5);
  assert.equal(restored.time, time);
  restored = Game.restore(restored.save, JSON.parse(JSON.stringify(restored.snapshot())));
  assert.ok(restored);
  restored.resume();
  advance(restored, 3 + 1 / 32);
  assert.equal(restored.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
  assert.equal(restored.snapshot().sovereignRecoveryAnnounced, true);
  restored.acknowledgeSovereignRecoveryNotice();
  assert.equal(restored.snapshot().sovereignRecoveryPending, undefined);
  assert.equal(Object.hasOwn(restored.save, 'sovereignRecoveryPending'), false);
  const shown = Game.restore(restored.save, JSON.parse(JSON.stringify(restored.snapshot())));
  assert.ok(shown);
  shown.resume();
  advance(shown, 4);
  assert.notEqual(shown.notice, '九天执劫仙尊 · 劫息回元');
});

test('同帧异常状态反馈照常显示，回元保留至HUD确认', () => {
  const { game, boss } = recoveryWithCast();
  game.player.invincible = 0;
  game.zone(0, 0, 80, 1, 0, '#abc', 'boss-roots', 0, true);
  game.update(0.01);
  assert.ok(game.entangled > 0);
  assert.equal(game.notice, '藤缠 · 暂难拾取');
  assert.equal(game.noticeTime, 3);
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
  game.zones = [];
  game.shots = [];
  boss.cooldown = 99999;
  advance(game, 3 - 1 / 32);
  assert.equal(game.notice, '藤缠 · 暂难拾取');
  advance(game, 2 / 32);
  assert.equal(game.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
});

test('同帧真实升级优先，选技暂停和恢复战斗不吞掉排队回元', () => {
  const { game, boss } = recoveryWithCast();
  game.xp = xpNeeded(game.level);
  game.update(0.01);
  assert.equal(game.state, 'upgrade');
  assert.equal(game.snapshot().sovereignRecoveryPending, true);
  assert.notEqual(game.notice, '九天执劫仙尊 · 劫息回元');
  const time = game.time;
  advance(game, 5);
  assert.equal(game.time, time);
  const restored = Game.restore(game.save, JSON.parse(JSON.stringify(game.snapshot())));
  assert.ok(restored);
  assert.equal(restored.state, 'upgrade');
  assert.equal(restored.choose(0), true);
  for (const weapon of restored.weapons) weapon.timer = 99999;
  restored.enemies.find((enemy) => enemy.id === boss.id)!.cooldown = 99999;
  advance(restored, 3 + 1 / 32);
  assert.equal(restored.pendingSovereignRecoveryNotice, '九天执劫仙尊 · 劫息回元');
  assert.equal(restored.snapshot().sovereignRecoveryPending, true);
});

test('pending 快照只接受可选 boolean，不新增永久字段', () => {
  const { game } = encounter();
  const snapshot = game.snapshot();
  for (const sovereignRecoveryPending of ['true', 1, null, [], {}])
    assert.equal(Game.restore(game.save, { ...snapshot, sovereignRecoveryPending }), null);
  for (const sovereignRecoveryPending of [undefined, false, true])
    assert.ok(Game.restore(game.save, { ...snapshot, sovereignRecoveryPending }));
  assert.equal(Object.hasOwn(game.save, 'sovereignRecoveryPending'), false);
});
