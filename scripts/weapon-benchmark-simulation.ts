// 测评夹具只包装真实Game的观测，不改变正式战斗方法；不由前端入口导入。
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Game } from '../src/game.ts';
import {
  STAGES,
  STAGE_REALM_STEPS,
  STAGE_YEARS_PER_MINUTE,
  TREASURES,
  evolutionPassives,
  treasure,
} from '../src/data.ts';
import { freshSave, realmCost, realmInfo, tribulationDue } from '../src/progress.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import { seeded } from './balance-policy.ts';
import {
  benchmarkElements as elements,
  benchmarkTriples as triples,
  BENCHMARK_TEAMS as teams,
} from './weapon-benchmark-policy.ts';
const dt = 1 / 30;
function withRandom<T>(random: () => number, fn: () => T) {
  const old = Math.random;
  Math.random = random;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}
function view(g: Game, device: string) {
  const scale = device === 'phone' ? 0.76 : 900 / 860;
  g.viewport = {
    width: (device === 'phone' ? 390 : 1365) / scale,
    height: (device === 'phone' ? 844 : 900) / scale,
  };
}
function entrySave(id: string, stage: number, root: string, index: number) {
  const t = treasure(id);
  const rootElements = root === 'heaven' ? [elements[index % 5]] : triples[index % 10];
  const save = withRandom(seeded(8128 + index), () =>
    freshSave(root, rootElements, t.school, seeded(444 + index)),
  );
  save.starter = id;
  save.artifacts = TREASURES.filter((x) => x.school === t.school).map((x) => x.id);
  save.unlocked = stage;
  save.completed = Array.from({ length: stage }, (_, i) => i);
  save.cultivation = Array.from({ length: STAGE_REALM_STEPS[stage] }, (_, i) =>
    realmCost(i),
  ).reduce((a, b) => a + b, 0);
  save.age =
    15 + STAGES.slice(0, stage).reduce((s, x, i) => s + x.minutes * STAGE_YEARS_PER_MINUTE[i], 0);
  save.autoplay = true;
  assert.equal(realmInfo(save.cultivation).step, STAGE_REALM_STEPS[stage]);
  assert.ok(Object.values(save.training).every((x) => x === 0));
  return save;
}
function learn(g: Game, id: string, n: number) {
  for (let level = (g.passives[id] ?? 0) + 1; level <= n; level++) {
    g.state = 'upgrade';
    g.choices = [{ type: 'passive', id, level }];
    assert.ok(g.choose(0));
  }
  g.state = 'playing';
}
export function setupNatural(job: any) {
  const save = entrySave(job.weapon, job.stage, job.root, job.index);
  const g = new Game(save, job.stage, 0, seeded(job.seed));
  view(g, job.device);
  return g;
}
export function pairSpec(job: any) {
  const t = treasure(job.weapon),
    r = treasure(job.reference);
  assert.equal(t.school, r.school);
  const recipe = evolutionPassives(t, t.school)[0],
    refRecipe = evolutionPassives(r, r.school)[0];
  const pool =
    t.school === 'orthodox'
      ? ['power', 'haste', 'guard', 'area', 'duration', 'magnet', 'regen', 'crit', 'spirit']
      : ['blood', 'devour', 'bone', 'abyss', 'frenzy', 'pace', 'focus', 'calamity'];
  const common = pool.filter((x) => x !== recipe && x !== refRecipe).slice(0, 3);
  const base = teams[t.school][job.team].filter((id) => id !== t.id && id !== r.id).slice(0, 5);
  assert.equal(base.length, 5);
  assert.equal(new Set(base).size, 5);
  return { recipe, refRecipe, common, base };
}
export function setupPair(job: any, id: string, spec: any) {
  const save = entrySave(id, 4, job.root, job.index);
  save.age += ((STAGES[4].minutes * 60 - 45) * STAGE_YEARS_PER_MINUTE[4]) / 60;
  const g = new Game(save, 4, 0, seeded(job.seed));
  view(g, job.device);
  g.weapons = [
    ...spec.base.map((id) => ({ id, level: 3, evolved: false, timer: 0 })),
    { id, level: 6, evolved: job.evolved, timer: 0 },
  ];
  for (const p of spec.common) learn(g, p, 3);
  learn(g, id === job.weapon ? spec.recipe : spec.refRecipe, 5);
  g.level = job.evolved ? 36 : 35;
  g.xp = 0;
  assert.equal(
    Object.values(g.passives).reduce((s, x) => s + x, 0),
    14,
  );
  assert.equal(Object.keys(g.passives).length, 4);
  assert.equal(
    g.weapons.reduce((s, x) => s + x.level, 0) - 1 + 14 + Number(job.evolved),
    g.level - 1,
  );
  g.time = g.stageDuration - 45;
  g.lateEliteWaves = true;
  g.nextElite = g.time + g.eliteInterval;
  const layout = seeded(job.seed * 37);
  for (let i = 0; i < 12; i++) {
    const a = layout() * Math.PI * 2;
    g.spawnEnemy(undefined, i < 2, false, { x: Math.cos(a) * 280, y: Math.sin(a) * 280 });
  }
  return g;
}
export function instrument(g: Game) {
  const counters = {
    hurt: 0,
    heal: 0,
    regen: 0,
    zoneHeal: 0,
    choiceHeal: 0,
    growthHp: 0,
    growthHpLoss: 0,
    blocked: 0,
    slowEnemySeconds: 0,
    lowHpSeconds: 0,
    noDamageLongest: 0,
    noDamageSeconds: 0,
  };
  const bosses: any[] = [];
  const spawn = g.spawnEnemy.bind(g),
    heal = g.heal.bind(g),
    hurt = g.hurtPlayer.bind(g),
    cast = g.cast.bind(g),
    zones = g.updateZones.bind(g),
    choose = g.choose.bind(g),
    credit = g.creditCultivation.bind(g);
  let phase = 'outside',
    calls = 0,
    passiveGrowth = false;
  g.spawnEnemy = (...args: any[]) => {
    const e = spawn(...args);
    if (e.boss) bosses.push({ enemy: e, at: g.time, deadAt: null });
    return e;
  };
  g.hurtPlayer = (damage: number) => {
    const actual =
      g.player.invincible <= 0 && g.state === 'playing'
        ? Math.max(0, Math.min(g.player.hp, damage * g.stats.armor))
        : 0;
    hurt(damage);
    counters.hurt += actual;
  };
  g.heal = (amount: number) => {
    const before = g.player.hp;
    heal(amount);
    const actual = Math.max(0, g.player.hp - before);
    if (passiveGrowth) counters.growthHp += actual;
    else {
      counters.heal += actual;
      if (phase === 'zones') counters.zoneHeal += actual;
      else if (phase === 'frame' && calls === 0) counters.regen += actual;
    }
    calls++;
  };
  g.choose = (index: number) => {
    const c = g.choices[index],
      before = g.player.hp;
    passiveGrowth = c?.type === 'passive';
    let ok;
    try {
      ok = choose(index);
    } finally {
      passiveGrowth = false;
    }
    if (ok && c?.type === 'heal') {
      const actual = Math.max(0, g.player.hp - before);
      counters.choiceHeal += actual;
      counters.heal += actual;
    }
    if (ok && c?.type === 'passive') counters.growthHpLoss += Math.max(0, before - g.player.hp);
    return ok;
  };
  g.creditCultivation = (...args: any[]) => {
    const before = g.player.hp;
    const r = credit(...args);
    counters.growthHp += Math.max(0, g.player.hp - before);
    return r;
  };
  g.updateZones = (...args: any[]) => {
    const old = phase;
    phase = 'zones';
    try {
      return zones(...args);
    } finally {
      phase = old;
    }
  };
  g.cast = (w: any) => {
    const before = g.shots.filter((s) => s.kind === 'hostile' && s.life > 0).length;
    const r = cast(w);
    counters.blocked += Math.max(
      0,
      before - g.shots.filter((s) => s.kind === 'hostile' && s.life > 0).length,
    );
    return r;
  };
  return {
    counters,
    bosses,
    beginFrame() {
      calls = 0;
      phase = 'frame';
    },
    beginChoice() {
      phase = 'choice';
    },
    observe() {
      for (const b of bosses) if (b.deadAt === null && b.enemy.dead) b.deadAt = g.time;
    },
  };
}
export function battle(g: Game, job: any, limit: number) {
  const start = g.time,
    entryCultivation = g.save.cultivation,
    entryAge = g.save.age;
  const entry = {
    root: g.spiritRoot,
    elements: [...g.rootElements],
    cultivation: entryCultivation,
    age: entryAge,
    level: g.level,
    passives: { ...g.passives },
    weapons: g.weapons.map((w) => ({ ...w })),
    stats: { ...g.stats },
  };
  const meter = instrument(g),
    events: any[] = [],
    trace: any[] = [];
  let frames = 0,
    stop = '',
    noDamage = 0,
    nextTrace = start,
    at90: any = null,
    at6: number | null = null,
    atEvolve: number | null = null,
    offered = 0,
    picked = 0,
    decisions = 0,
    rerolls = 0;
  const candidate = () => g.weapons.find((w) => w.id === job.weapon);
  if (candidate()?.level === 6) at6 = 0;
  if (candidate()?.evolved) atEvolve = 0;
  while (frames < Math.ceil(limit * 30)) {
    if (g.state === 'won' || g.state === 'lost') {
      stop = g.expired ? 'expired' : g.state;
      break;
    }
    if (tribulationDue(g.save)) {
      stop = 'tribulation';
      break;
    }
    if (g.state === 'paused') {
      stop = 'paused';
      break;
    }
    for (let guard = 0; g.state === 'upgrade'; guard++) {
      assert.ok(guard < 200);
      const options = g.choices.map((x) => ({ ...x }));
      offered += Number(
        options.some((c) => (c.type === 'weapon' || c.type === 'evolve') && c.id === job.weapon),
      );
      let choice = autoplayChoice(g);
      assert.ok(choice);
      if (job.policy === 'focused') {
        const evolve = options.findIndex((c) => c.type === 'evolve' && c.id === job.weapon);
        const weapon = options.findIndex((c) => c.type === 'weapon' && c.id === job.weapon);
        const required = g.evolutionRequirements(job.weapon);
        const recipe = options.findIndex((c) => c.type === 'passive' && required.includes(c.id));
        const preferred = evolve >= 0 ? evolve : weapon >= 0 ? weapon : recipe >= 0 ? recipe : -1;
        if (preferred >= 0) choice = { index: preferred, reroll: false };
      }
      meter.beginChoice();
      decisions++;
      if (choice.reroll) {
        assert.ok(g.reroll());
        rerolls++;
      } else {
        const c = options[choice.index];
        picked += Number((c.type === 'weapon' || c.type === 'evolve') && c.id === job.weapon);
        assert.ok(g.choose(choice.index));
        events.push({ at: g.time - start, level: g.level, choice: c, offered: options });
      }
      meter.observe();
      if (at6 === null && candidate()?.level === 6) at6 = g.time - start;
      if (atEvolve === null && candidate()?.evolved) atEvolve = g.time - start;
    }
    if (g.state === 'won' || g.state === 'lost') continue;
    assert.equal(g.state, 'playing');
    if (frames % 4 === 0) g.input = autoplayInput(g);
    const before = g.damageDealt;
    meter.beginFrame();
    g.update(dt);
    frames++;
    meter.observe();
    if (at6 === null && candidate()?.level === 6) at6 = g.time - start;
    if (atEvolve === null && candidate()?.evolved) atEvolve = g.time - start;
    if (g.state === 'paused') {
      stop = tribulationDue(g.save) ? 'tribulation' : 'paused';
      break;
    }
    meter.counters.lowHpSeconds += Number(g.player.hp < 0.3 * g.player.maxHp) * dt;
    meter.counters.slowEnemySeconds += g.enemies.filter((e) => !e.dead && e.slow > 0).length * dt;
    if (g.enemies.some((e) => !e.dead) && g.damageDealt <= before + 1e-9) {
      noDamage += dt;
      meter.counters.noDamageSeconds += dt;
      meter.counters.noDamageLongest = Math.max(meter.counters.noDamageLongest, noDamage);
    } else noDamage = 0;
    if (!at90 && g.time - start >= 90)
      at90 = {
        level: g.level,
        realm: realmInfo(g.save.cultivation).step,
        cultivation: g.save.cultivation - entryCultivation,
        hp: g.player.hp / g.player.maxHp,
      };
    if (g.time >= nextTrace) {
      trace.push({
        at: g.time - start,
        hp: g.player.hp / g.player.maxHp,
        level: g.level,
        kills: g.kills,
        damage: g.damageDealt,
        own: g.damageBySource[job.weapon] ?? 0,
        enemies: g.enemies.length,
        starter: candidate() ? { level: candidate()!.level, evolved: candidate()!.evolved } : null,
      });
      nextTrace += 10;
    }
  }
  meter.observe();
  if (!stop)
    stop =
      g.state === 'won' ? 'won' : g.state === 'lost' ? (g.expired ? 'expired' : 'lost') : 'timeout';
  const seconds = g.time - start;
  const result = {
    ...job,
    entry,
    state: stop,
    seconds,
    frames,
    level: g.level,
    kills: g.kills,
    damage: g.damageDealt,
    ownDamage: g.damageBySource[job.weapon] ?? 0,
    damageBySource: { ...g.damageBySource },
    cultivation: g.save.cultivation - entryCultivation,
    exitRealm: realmInfo(g.save.cultivation).step,
    hp: g.player.hp / g.player.maxHp,
    maxHp: g.player.maxHp,
    at90,
    at6,
    atEvolve,
    offered,
    picked,
    decisions,
    rerolls,
    endWeapons: g.weapons.map((w) => ({ id: w.id, level: w.level, evolved: w.evolved })),
    endPassives: { ...g.passives },
    ...meter.counters,
    bosses: meter.bosses.map((b) => ({
      at: b.at - start,
      deadAt: b.deadAt === null ? null : b.deadAt - start,
      observed: (b.deadAt ?? g.time) - b.at,
      hp: Math.max(0, b.enemy.hp / b.enemy.maxHp),
    })),
    events,
    trace,
  };
  assert.ok(
    Number.isFinite(result.damage) && result.damage >= 0 && result.hp >= 0 && result.hp <= 1 + 1e-9,
  );
  assert.ok(['won', 'lost', 'expired', 'tribulation', 'timeout', 'paused'].includes(result.state));
  assert.ok(g.weapons.length <= 6 && Object.keys(g.passives).length <= 4);
  return result;
}
export function runNatural(job: any) {
  return battle(setupNatural(job), job, STAGES[job.stage].minutes * 60 + 120);
}
export function runPair(job: any) {
  const spec = pairSpec(job);
  const candidate = battle(setupPair(job, job.weapon, spec), job, 105);
  const reference =
    job.weapon === job.reference
      ? structuredClone(candidate)
      : battle(setupPair(job, job.reference, spec), { ...job, weapon: job.reference }, 105);
  assert.deepEqual(candidate.entry.elements, reference.entry.elements);
  assert.deepEqual(candidate.entry.weapons.slice(0, 5), reference.entry.weapons.slice(0, 5));
  assert.equal(candidate.entry.level, reference.entry.level);
  return {
    job,
    spec,
    candidate,
    reference,
    actualSimulations: job.weapon === job.reference ? 1 : 2,
  };
}

// 独立标记避免别的worker导入此模块时意外启动模拟。
if (!isMainThread && workerData?.weaponBenchmark === true) {
  for (const job of workerData.jobs) {
    const value = job.kind === 'natural' ? runNatural(job) : runPair(job);
    appendFileSync(workerData.file, JSON.stringify(value) + '\n');
    parentPort!.postMessage(1);
  }
}
