import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Game } from '../src/game.ts';
import type { Enemy } from '../src/game.ts';
import {
  adSupplies,
  ELEMENTS,
  MAX_FORGE_LEVEL,
  ROOT_STARTERS,
  rootElementsFor,
  STAGES,
  STAGE_YEARS_PER_MINUTE,
  treasure,
} from '../src/data.ts';
import { AD_SECONDS } from '../src/ads.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import {
  completeTribulation,
  enterImmortalGate,
  extendLifespan,
  forge,
  forgeCost,
  freshSave,
  lifespanInfo,
  readSave,
  realmCost,
  realmInfo,
  settleRun,
  train,
  trainingCost,
  trainingYears,
  tribulationDue,
} from '../src/progress.ts';
import type { SaveData } from '../src/progress.ts';
import {
  entryCost,
  joinSect,
  resolveActivity,
  sectDuesPending,
  settleSectDues,
  startActivity,
  studyPlan,
} from '../src/mortal.ts';
import { buyMedicine, useMedicine } from '../src/medicine.ts';
import { activeMedicines, medicineInfo, refreshMedicineShop } from '../src/medicine-data.ts';
import { caseKey, LIMITS, seeded } from './balance-policy.ts';
import type { BalanceCase, Device } from './balance-policy.ts';

export interface BossSample {
  stage: number;
  at: number;
  deadAt: number | null;
  observedSeconds: number;
  hpFraction: number;
}
export interface BattleSample {
  stage: number;
  attempt: number;
  state: string;
  seconds: number;
  entryStep: number;
  exitStep: number;
  cultivation: number;
  at90: { cultivation: number; step: number; level: number } | null;
  bosses: BossSample[];
  trials: { state: string; seconds: number; round: number }[];
  maxAliveBosses: number;
  firstClearCultivation: number;
}
export interface CampaignSample {
  case: BalanceCase;
  key: string;
  complete: boolean;
  cleared: number;
  stop: string;
  battles: BattleSample[];
  ads: { supplies: number; borrow: number; revive: number };
  seconds: number;
  adSeconds: number;
  cultivation: number;
}
interface Ledger {
  supplies: number;
  borrow: number;
  revive: number;
  trials: { state: string; seconds: number; round: number }[];
}
const assisted = (c: BalanceCase) => c.profile === 'ads-only' || c.profile === 'maxed';
class BudgetStop extends Error {}
function withRandom<T>(random: () => number, action: () => T): T {
  const previous = Math.random;
  Math.random = random;
  try {
    return action();
  } finally {
    Math.random = previous;
  }
}
export function initialSave(c: BalanceCase) {
  const element = treasure(c.starter).element;
  const elements = rootElementsFor(c.root, [element], seeded(c.seed * 913));
  const pool =
    c.path === 'dual'
      ? Object.values(ROOT_STARTERS).flat()
      : Object.values(ROOT_STARTERS).map((pair) => pair[c.path === 'demonic' ? 1 : 0]);
  // 无灵根走实际随机本命入口；兼修可通过现有本命选择换成已拥有的魔道法宝。
  const save = withRandom(seeded(c.seed * 4153), () =>
    freshSave(
      c.root,
      elements,
      c.path,
      c.root === 'none'
        ? () => (pool.indexOf(c.starter) + 0.1) / pool.length
        : seeded(c.seed * 104729),
    ),
  );
  if (save.starter !== c.starter) {
    assert.equal(c.path, 'dual');
    assert.ok(save.artifacts.includes(c.starter));
    save.starter = c.starter;
  }
  save.autoplay = true;
  const loaded = readSave(JSON.stringify(save), seeded(c.seed));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.save.starter, c.starter);
  assert.equal(loaded.save.spiritRoot, c.root);
  assert.ok(ELEMENTS.some((e) => e.id === element));
  return loaded.save;
}
function viewport(g: Game, device: Device) {
  const scale = device === 'phone' ? 0.76 : 900 / 860;
  g.viewport = {
    width: (device === 'phone' ? 390 : 1365) / scale,
    height: (device === 'phone' ? 844 : 900) / scale,
  };
}
function trial(
  save: SaveData,
  source: Game | null,
  random: () => number,
  c: BalanceCase,
  ledger: Ledger,
) {
  const age = save.age,
    cultivation = save.cultivation;
  const g = withRandom(random, () => Game.createTribulation(save, source));
  g.random = random;
  viewport(g, c.device);
  let frame = 0;
  while (frame < LIMITS.trialSeconds * 30 && g.state !== 'won') {
    if (g.state === 'lost') {
      if (!assisted(c) || !g.revive()) break;
      ledger.revive++;
    }
    if (frame % 4 === 0) g.input = autoplayInput(g);
    g.update(1 / 30);
    frame++;
  }
  assert.equal(save.age, age);
  assert.equal(save.cultivation, cultivation);
  const row = {
    state: g.state === 'won' || g.state === 'lost' ? g.state : 'timeout',
    seconds: g.time,
    round: g.tribulation,
  };
  ledger.trials.push(row);
  if (row.state !== 'won') throw new BudgetStop(`tribulation-${row.state}`);
  assert.ok(completeTribulation(save, g.tribulation));
  return row;
}
function supplies(save: SaveData, stones: number, iron: number, ledger: Ledger) {
  while (save.stones < stones || save.iron < iron) {
    if (ledger.supplies >= LIMITS.supplies) throw new BudgetStop('supplies-budget');
    const reward = adSupplies(save.unlocked);
    save.stones += reward.stones;
    save.iron += reward.iron;
    ledger.supplies++;
  }
}
function boundaries(save: SaveData, c: BalanceCase, ledger: Ledger, random: () => number) {
  for (let guard = 0; guard < LIMITS.preparationOperations; guard++) {
    if (tribulationDue(save)) {
      trial(save, null, random, c, ledger);
      continue;
    }
    if (lifespanInfo(save).remaining === 0) {
      if (!assisted(c)) throw new BudgetStop('expired');
      if (ledger.borrow >= LIMITS.borrows) throw new BudgetStop('borrow-budget');
      assert.ok(extendLifespan(save));
      ledger.borrow++;
      resolveActivity(save, random);
      continue;
    }
    if (sectDuesPending(save)) {
      supplies(save, save.mortal.member!.dues, 0, ledger);
      assert.ok(settleSectDues(save, false, random));
      continue;
    }
    return;
  }
  throw new BudgetStop('boundary-budget');
}
function roomForYears(
  save: SaveData,
  years: number,
  c: BalanceCase,
  ledger: Ledger,
  random: () => number,
) {
  for (let guard = 0; guard < LIMITS.preparationOperations; guard++) {
    boundaries(save, c, ledger, random);
    if (lifespanInfo(save).remaining > years + 1e-9) return true;
    if (Math.round(lifespanInfo(save).base * 0.3) <= years + 1e-9) return false;
    const age = save.age;
    if (!save.mortal.activity) assert.ok(startActivity(save, 'herbs', random));
    else assert.ok(resolveActivity(save, random));
    assert.ok(save.age > age);
  }
  throw new BudgetStop('years-budget');
}
function prepare(
  save: SaveData,
  stage: number,
  c: BalanceCase,
  ledger: Ledger,
  random: () => number,
) {
  boundaries(save, c, ledger, random);
  if (c.profile === 'ads-only' || c.profile === 'bare') return;
  if (c.profile === 'earned') {
    const startingAge = save.age,
      budget = lifespanInfo(save).remaining * 0.2;
    const reserve = (STAGES[stage].minutes + 2) * STAGE_YEARS_PER_MINUTE[stage];
    for (let i = 0; i < 12; i++) {
      forge(save, save.starter);
      for (const kind of ['power', 'vitality', 'speed'] as const)
        if (
          save.age - startingAge + trainingYears(save) <= budget &&
          lifespanInfo(save).remaining > reserve + 5
        )
          train(save, kind);
    }
    return;
  }
  for (const kind of ['vitality', 'power', 'speed'] as const)
    while (save.training[kind] < 20) {
      if (!roomForYears(save, trainingYears(save), c, ledger, random))
        throw new BudgetStop('training-lifespan');
      supplies(save, trainingCost(save.training[kind]), 0, ledger);
      assert.ok(train(save, kind));
    }
  // 只炼已收藏且本路线能用的法宝，不凭空解锁/加属性/修改资质。
  for (const id of save.artifacts.filter(
    (id) => c.path === 'dual' || treasure(id).school === c.path,
  ))
    while ((save.forge[id] ?? 0) < MAX_FORGE_LEVEL) {
      const cost = forgeCost(save.forge[id] ?? 0);
      supplies(save, cost.stones, cost.iron, ledger);
      assert.ok(forge(save, id));
    }
  if (!save.mortal.member) {
    const passive = new Game(save, stage, c.difficulty, random).evolutionRequirements(
      save.starter,
    )[0];
    supplies(save, entryCost(save), 0, ledger);
    assert.ok(joinSect(save, passive));
  }
  for (let guard = 0; studyPlan(save).eligible; guard++) {
    if (guard >= LIMITS.preparationOperations) throw new BudgetStop('study-budget');
    const plan = studyPlan(save);
    if (!roomForYears(save, plan.years, c, ledger, random)) throw new BudgetStop('study-lifespan');
    supplies(save, plan.stones, 0, ledger);
    assert.ok(startActivity(save, 'study', random));
    for (let i = 0; save.mortal.activity; i++) {
      if (i >= LIMITS.preparationOperations) throw new BudgetStop('activity-budget');
      boundaries(save, c, ledger, random);
      if (save.mortal.activity) assert.ok(resolveActivity(save, random));
    }
  }
  boundaries(save, c, ledger, random);
  refreshMedicineShop(save.medicine, save.age, random);
  const shop = save.medicine.shop;
  assert.ok(shop);
  // 三槽实际商店药效，不购买改根/永久修为丹，不把广告当无限修为。
  for (const id of ['jinsui', 'bigu', 'huanglong', 'huxin', 'yangjing', 'yingxiang']) {
    if (!shop.ids.includes(id) || activeMedicines(save.medicine, save.age).length >= 3) continue;
    if ((save.medicine.active[id] ?? 0) > save.age) continue;
    supplies(save, medicineInfo(id)!.price, 0, ledger);
    if (buyMedicine(save, id)) assert.ok(useMedicine(save, id).ok);
  }
  assert.ok(Object.values(save.training).every((n) => n === 20));
  assert.equal(save.forge[save.starter], MAX_FORGE_LEVEL);
  assert.ok(activeMedicines(save.medicine, save.age).length <= 3);
  assert.equal(save.spiritRoot, c.root);
}
function fight(save: SaveData, stage: number, attempt: number, c: BalanceCase, ledger: Ledger) {
  const random = seeded(c.seed * 104729 + attempt * 101 + stage * 15485863);
  let g = new Game(save, stage, c.difficulty, random);
  viewport(g, c.device);
  const entryStep = realmInfo(save.cultivation).step,
    cultivation = save.cultivation;
  const bosses: { enemy: Enemy; stage: number; at: number; deadAt: number | null }[] = [];
  function instrument() {
    const source = g,
      spawn = source.spawnEnemy.bind(source);
    source.spawnEnemy = (...args: Parameters<Game['spawnEnemy']>) => {
      const enemy = spawn(...args);
      if (enemy.boss)
        bosses.push({ enemy, stage: enemy.bossStage ?? stage, at: source.time, deadAt: null });
      return enemy;
    };
  }
  instrument();
  let frame = 0,
    stop = '',
    maxAliveBosses = 0;
  let at90: BattleSample['at90'] = null;
  const trials: BattleSample['trials'] = [];
  function observeBossDeaths() {
    for (const b of bosses) if (b.deadAt === null && b.enemy.dead) b.deadAt = g.time;
  }
  while (frame < LIMITS.battleSeconds * 30 && g.state !== 'won') {
    if (g.expired) {
      if (!assisted(c)) {
        stop = 'expired';
        break;
      }
      if (ledger.borrow >= LIMITS.borrows) {
        stop = 'borrow-budget';
        break;
      }
      assert.ok(g.borrowLife());
      ledger.borrow++;
      g.resume();
    }
    if (g.state === 'lost') {
      if (!assisted(c) || !g.revive()) {
        stop = 'lost';
        break;
      }
      ledger.revive++;
    }
    if (tribulationDue(save)) {
      const snapshot = g.snapshot();
      save.tribulationReturn = snapshot;
      try {
        trials.push(trial(save, g, random, c, ledger));
      } catch (error) {
        if (!(error instanceof BudgetStop)) throw error;
        stop = error.message;
        break;
      }
      save.tribulationReturn = null;
      const restored = withRandom(random, () => Game.restore(save, snapshot));
      if (!restored) {
        const fixture = join(
          tmpdir(),
          `qinglan-gate-restore-${caseKey(c).replaceAll('/', '-')}-${stage}-${attempt}.json`,
        );
        writeFileSync(fixture, JSON.stringify({ save, snapshot }));
      }
      assert.ok(restored, `续局恢复失败：${caseKey(c)} 第 ${stage + 1} 关`);
      g = restored;
      g.random = random;
      viewport(g, c.device);
      for (const b of bosses) {
        if (b.deadAt !== null) continue;
        const enemy = g.enemies.find((e) => e.id === b.enemy.id);
        assert.ok(enemy, '存活妖王不能在恢复时消失');
        b.enemy = enemy;
      }
      instrument();
      g.resume();
    }
    for (let guard = 0; g.state === 'upgrade'; guard++) {
      assert.ok(guard < 200, '升级循环不能无止境');
      const choice = autoplayChoice(g);
      assert.ok(choice);
      if (choice.reroll) assert.ok(g.reroll());
      else assert.ok(g.choose(choice.index));
      // 仙器觉醒可在选择时击杀妖王并结束本局，不能等下一个战斗帧才记死亡。
      observeBossDeaths();
    }
    if (g.state === 'won' || g.state === 'lost') continue;
    assert.equal(g.state, 'playing');
    if (frame % 4 === 0) g.input = autoplayInput(g);
    g.update(1 / 30);
    frame++;
    observeBossDeaths();
    maxAliveBosses = Math.max(maxAliveBosses, bosses.filter((b) => b.deadAt === null).length);
    if (g.time >= 90 && !at90)
      at90 = {
        cultivation: save.cultivation - cultivation,
        step: realmInfo(save.cultivation).step,
        level: g.level,
      };
  }
  const state = stop || (g.state === 'won' ? 'won' : 'timeout');
  const credited = save.cultivation;
  // 寿尽也是原局失败结算，不能漏掉已获得的修为、物资；未完成的天劫保留未结算。
  const rewards = ['won', 'lost', 'expired'].includes(state)
    ? settleRun(save, { ...g.snapshot(), victory: state === 'won' })
    : null;
  if (rewards) assert.equal(save.cultivation - credited, rewards.cultivationRemaining);
  return {
    stage,
    attempt,
    state,
    seconds: g.time,
    entryStep,
    exitStep: realmInfo(save.cultivation, save.completed.includes(6)).step,
    cultivation: save.cultivation - cultivation,
    at90,
    trials,
    maxAliveBosses,
    firstClearCultivation: rewards?.firstClearCultivation ?? 0,
    bosses: bosses.map((b) => ({
      stage: b.stage,
      at: b.at,
      deadAt: b.deadAt,
      observedSeconds: (b.deadAt ?? g.time) - b.at,
      hpFraction: Math.max(0, b.enemy.hp / b.enemy.maxHp),
    })),
  } satisfies BattleSample;
}
export function simulateCampaign(c: BalanceCase, stageCount = STAGES.length): CampaignSample {
  assert.ok(Number.isInteger(stageCount) && stageCount >= 1 && stageCount <= STAGES.length);
  const save = initialSave(c);
  const ledger: Ledger = { supplies: 0, borrow: 0, revive: 0, trials: [] };
  const battles: BattleSample[] = [];
  let stop = 'attempt-cap';
  for (let stage = 0; stage < stageCount; stage++) {
    let won = false;
    for (let attempt = 1; attempt <= (c.profile === 'bare' ? 1 : LIMITS.attempts); attempt++) {
      const random = seeded(c.seed * 781 + save.runs * 101 + stage * 137);
      try {
        withRandom(random, () => prepare(save, stage, c, ledger, random));
      } catch (error) {
        if (!(error instanceof BudgetStop)) throw error;
        stop = error.message;
        break;
      }
      const row = withRandom(seeded(c.seed), () => fight(save, stage, attempt, c, ledger));
      battles.push(row);
      assert.equal(save.spiritRoot, c.root);
      stop = row.state;
      won = row.state === 'won';
      if (won || row.state !== 'lost') break;
    }
    if (!won) break;
  }
  if (save.completed.includes(6)) {
    assert.equal(realmInfo(save.cultivation, true).name, '真仙');
    assert.ok(enterImmortalGate(structuredClone(save)));
  }
  if (c.profile === 'bare') {
    assert.ok(Object.values(save.training).every((n) => n === 0));
    assert.ok(Object.values(save.forge).every((n) => n === 0));
    assert.equal(save.mortal.member, null);
    assert.equal(activeMedicines(save.medicine, save.age).length, 0);
    assert.equal(ledger.supplies + ledger.borrow + ledger.revive, 0);
    assert.ok(battles.every((b) => b.attempt === 1));
  }
  return {
    case: c,
    key: caseKey(c),
    complete: save.completed.includes(6),
    cleared: save.completed.length,
    stop,
    battles,
    ads: { supplies: ledger.supplies, borrow: ledger.borrow, revive: ledger.revive },
    seconds:
      battles.reduce((n, b) => n + b.seconds, 0) + ledger.trials.reduce((n, t) => n + t.seconds, 0),
    adSeconds: (ledger.supplies + ledger.borrow + ledger.revive) * AD_SECONDS,
    cultivation: save.cultivation,
  };
}
export function simulateFarm(c: BalanceCase, attempts = 20) {
  const save = initialSave(c),
    ledger: Ledger = { supplies: 0, borrow: 0, revive: 0, trials: [] };
  const battles: BattleSample[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (lifespanInfo(save).remaining === 0) break;
    const row = withRandom(seeded(c.seed), () => fight(save, 0, attempt, c, ledger));
    battles.push(row);
    if (!['won', 'lost'].includes(row.state)) break;
  }
  assert.ok(save.completed.every((stage) => stage === 0));
  assert.ok(realmInfo(save.cultivation, false).step < 24, '刷首关不能绕过终关成仙');
  return {
    case: c,
    battles,
    cultivation: save.cultivation,
    step: realmInfo(save.cultivation).step,
  };
}
export function growthShape() {
  return Array.from({ length: 8 }, (_, major) => {
    const step = major * 3;
    return { major, small: [realmCost(step), realmCost(step + 1)], large: realmCost(step + 2) };
  });
}
if (!isMainThread) {
  const { cases, farms, stageCount } = workerData as {
    cases: BalanceCase[];
    farms: boolean;
    stageCount?: number;
  };
  for (const c of cases) {
    try {
      const result = farms ? simulateFarm(c) : simulateCampaign(c, stageCount);
      parentPort!.postMessage(result);
    } catch (error) {
      parentPort!.postMessage({
        case: c,
        key: caseKey(c),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
