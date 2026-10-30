import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { dispatchAction, type ActionShell } from '../src/action-controller.ts';
import { CURIO_IDS, curioValue } from '../src/curio-data.ts';
import { ROOT_STARTERS, TREASURES, rootElementsFor } from '../src/data.ts';
import { acceptHometownRoot, departHometown } from '../src/hometown.ts';
import { journeyScore } from '../src/journey-score.ts';
import { extractLeaderboardFacts } from '../src/leaderboard-contract.ts';
import { sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import { MEDICINES, medicineMarketValue } from '../src/medicine-data.ts';
import { useMedicine } from '../src/medicine.ts';
import {
  applyBirthInheritance,
  freshSave,
  inheritanceGiftValue,
  IMMORTAL_CULTIVATION,
  readSave,
  SAVE_SCHEMA,
  type BirthInheritance,
  type SaveData,
} from '../src/progress.ts';
import { exportSave, importSave, readSealedSave } from '../src/save-transfer.ts';
import {
  minimumLeaderboardAge,
  parseLeaderboardFacts,
  scoreLeaderboardFacts,
} from '../workers/leaderboard/score.ts';

const fresh = () => freshSave('heaven', ['metal'], 'orthodox', () => 0.5);

// 经过实际 accept-root 控制器及其 writeSave 边界，校验清理临时赠物元数据不会清理估值。
function acceptGift(save: SaveData) {
  assert.equal(departHometown(save), true);
  const writes: string[] = [];
  const shell = {
    save,
    panel: 'root-reveal',
    modal: { innerHTML: '' },
    ui: { inert: true, querySelector: () => null },
    acceptHometownRoot,
    renderLobby() {},
    toast(message: string) {
      assert.fail(message);
    },
    writeSave(next: SaveData) {
      assert.equal(next.birthInheritance, null, '接受命盘的保存快照不保留临时赠物');
      writes.push(JSON.stringify(sealSaveSnapshot(next)));
    },
  } as unknown as ActionShell;
  dispatchAction(shell, 'accept-root');
  assert.equal(shell.panel, '');
  assert.equal(writes.length, 1);
  const local = readSealedSave(writes[0]);
  assert.equal(local.status, 'ok');
  assert.equal(local.save.factsTampered, false);
  return local.save;
}

test('传承估值使用完整原价：入门法宝零基础价，非入门180，炼器累计成本不享奇物折扣', () => {
  const starters = Object.values(ROOT_STARTERS).flat();
  // 0、1、5、10阶完整投入：灵石 + 玄铁按12灵石折价，独立固定锚点避免现算同源断言。
  const costs = [
    [0, 0],
    [1, 71],
    [5, 1375],
    [10, 22130],
  ] as const;
  for (const item of TREASURES)
    for (const [level, cost] of costs) {
      const gift: BirthInheritance = { kind: 'artifact', id: item.id, level };
      const expected = cost + (starters.includes(item.id) ? 0 : 180);
      assert.equal(inheritanceGiftValue(gift), expected, `${item.id} ${level}`);
      const save = fresh();
      save.curios.bag['jade-book'] = 1;
      save.curios.acquired = ['jade-book'];
      assert.equal(applyBirthInheritance(save, gift), true);
      assert.equal(save.inheritanceValue, expected, '受赠者已有金阙玉书不应折减前人投入');
    }
});

test('丹药和全部奇物按真实交易估值，传承只计一枚或一件', () => {
  for (const medicine of MEDICINES) {
    const gift: BirthInheritance = { kind: 'medicine', id: medicine.id };
    assert.equal(inheritanceGiftValue(gift), medicineMarketValue(medicine.id), medicine.id);
    const save = fresh();
    assert.equal(applyBirthInheritance(save, gift), true);
    assert.equal(save.inheritanceValue, medicineMarketValue(medicine.id));
    assert.equal(save.medicine.bag[medicine.id], 1);
  }
  assert.equal(inheritanceGiftValue({ kind: 'medicine', id: 'huanglong' }), 40);
  assert.equal(inheritanceGiftValue({ kind: 'medicine', id: 'huiyang' }), 5000);
  assert.equal(inheritanceGiftValue({ kind: 'medicine', id: 'butian' }), 8000);
  const values = [120000, 30000, 18000, 18000, 20000, 24000, 12000, 24000, 24000];
  for (const [index, id] of CURIO_IDS.entries()) {
    const gift: BirthInheritance = { kind: 'curio', id };
    assert.equal(curioValue(id), values[index]);
    assert.equal(inheritanceGiftValue(gift), values[index]);
    const save = fresh();
    assert.equal(applyBirthInheritance(save, gift), true);
    assert.equal(save.inheritanceValue, values[index]);
    assert.equal(save.curios.bag[id], 1);
  }
});

test('受赠估值先写入新生存档，重抽延续同一礼物，接受命盘清元数据后本地和文件往返不丢估值', () => {
  const gifts: BirthInheritance[] = [
    { kind: 'artifact', id: 'sword', level: 0 },
    { kind: 'artifact', id: 'skull', level: 5 },
    { kind: 'artifact', id: 'skull', level: 10 },
    ...MEDICINES.map((m): BirthInheritance => ({ kind: 'medicine', id: m.id })),
    ...CURIO_IDS.map((id): BirthInheritance => ({ kind: 'curio', id })),
  ];
  for (const gift of gifts) {
    let save = fresh();
    assert.equal(applyBirthInheritance(save, gift), true);
    const value = inheritanceGiftValue(gift);
    assert.equal(save.inheritanceValue, value);
    save = importSave(exportSave(save, null)).save;
    assert.equal(save.inheritanceValue, value, `${gift.kind}:${gift.id} 新生保存`);
    const rerolled = freshSave(
      'five',
      ['metal', 'wood', 'water', 'fire', 'earth'],
      'orthodox',
      () => 0.5,
    );
    assert.equal(applyBirthInheritance(rerolled, save.birthInheritance), true);
    assert.equal(rerolled.inheritanceValue, value, '重抽不叠加或清空估值');
    const accepted = acceptGift(rerolled);
    assert.equal(accepted.birthInheritance, null);
    assert.equal(accepted.inheritanceValue, value);
    assert.equal(Object.hasOwn(accepted.chronicle.milestones, 'birth-inheritance'), true);
    const restored = importSave(exportSave(accepted, null)).save;
    assert.equal(restored.inheritanceValue, value);
    assert.equal(journeyScore(restored).inheritancePenalty, journeyScore(save).inheritancePenalty);
    assert.equal(readSealedSave(JSON.stringify(restored)).save.inheritanceValue, value);
    assert.equal(restored.factsTampered, false);
  }
});

test('全部受赠丹药经真实服用耗尽后，估值与道心扣减仍贯穿保存和读取', () => {
  for (const medicine of MEDICINES) {
    const newborn = freshSave('none', [], 'orthodox', () => 0.5);
    const gift: BirthInheritance = { kind: 'medicine', id: medicine.id };
    assert.equal(applyBirthInheritance(newborn, gift), true);
    const save = acceptGift(newborn);
    const value = save.inheritanceValue;
    const penalty = journeyScore(save).inheritancePenalty;
    assert.equal(useMedicine(save, medicine.id, false, 1, () => 0).ok, true, medicine.id);
    assert.equal(save.medicine.bag[medicine.id], 0);
    assert.equal(save.birthInheritance, null);
    assert.equal(save.inheritanceValue, value);
    assert.equal(journeyScore(save).inheritancePenalty, penalty);
    const local = readSealedSave(JSON.stringify(sealSaveSnapshot(save)));
    assert.equal(local.status, 'ok');
    for (const restored of [local.save, importSave(exportSave(save, null)).save]) {
      assert.equal(restored.medicine.bag[medicine.id], 0);
      assert.equal(restored.inheritanceValue, value, medicine.id);
      assert.equal(journeyScore(restored).inheritancePenalty, penalty, medicine.id);
      assert.equal(restored.factsTampered, false);
    }
  }
});

test('旧档有可辨认赠物时重建估值，已消耗只余承缘记载用100，无传承则0', () => {
  for (const gift of [
    { kind: 'artifact', id: 'skull', level: 10 },
    { kind: 'medicine', id: 'butian' },
    { kind: 'curio', id: 'heaven-bottle' },
  ] satisfies BirthInheritance[]) {
    const raw = fresh();
    assert.equal(applyBirthInheritance(raw, gift), true);
    raw.schema = 38;
    delete (raw as Partial<SaveData>).inheritanceValue;
    let migrated = readSave(JSON.stringify(raw));
    assert.equal(migrated.status, 'ok');
    assert.equal(migrated.save.schema, SAVE_SCHEMA);
    assert.equal(migrated.save.inheritanceValue, inheritanceGiftValue(gift));
    raw.birthInheritance = null;
    migrated = readSave(JSON.stringify(raw));
    assert.equal(migrated.save.inheritanceValue, 100);
    delete raw.chronicle.milestones['birth-inheritance'];
    assert.equal(readSave(JSON.stringify(raw)).save.inheritanceValue, 0);
  }
});

const penaltyCases = [
  [0, 0.05],
  [1, 0.05],
  [499, 0.05],
  [500, 0.1],
  [501, 0.1],
  [4999, 0.1],
  [5000, 0.15],
  [5001, 0.15],
  [19999, 0.15],
  [20000, 0.2],
  [20001, 0.2],
  [99999, 0.2],
  [100000, 0.25],
  [100001, 0.25],
] as const;

test('承缘五档边界扣减5/10/15/20/25个百分点，零估值受赠也保留最小扣减', () => {
  const unaided = journeyScore(fresh());
  assert.equal(unaided.inheritancePenalty, 0);
  assert.equal(unaided.clarityFactor, 1.1);
  for (const [value, penalty] of penaltyCases) {
    const save = fresh();
    save.inheritanceValue = value;
    save.chronicle.milestones['birth-inheritance'] = 15;
    const score = journeyScore(save);
    assert.equal(score.inheritanceValue, value);
    assert.equal(score.inheritancePenalty, penalty, String(value));
    assert.equal(score.baseClarityFactor, 1.1);
    assert.equal(score.clarityFactor, Number((1.1 - penalty).toFixed(2)));
    assert.equal(score.rawScore, unaided.rawScore, '承缘仅影响道心，不直接扣原始道果');
    assert.equal(score.clarityTotal, Math.round(score.rawScore * score.clarityFactor));
  }
});

test('承缘与广告道心扣减累加后最低0.7，极限1.15在道心取整后独立乘算', () => {
  const bases = [
    [0, 1.1],
    [1, 0.97],
    [3, 0.91],
    [5, 0.85],
    [9, 0.73],
    [10, 0.7],
    [11, 0.7],
    [25, 0.7],
  ] as const;
  for (const [value, penalty] of penaltyCases)
    for (const [adCount, base] of bases) {
      const save = fresh();
      save.cultivation = IMMORTAL_CULTIVATION;
      save.inheritanceValue = value;
      save.chronicle.milestones['birth-inheritance'] = 15;
      save.adUsage.supplies = adCount;
      const normal = journeyScore(save);
      assert.equal(normal.baseClarityFactor, base);
      assert.equal(
        normal.clarityFactor,
        Math.max(0.7, Number((base - penalty).toFixed(2))),
        `${value}/${adCount}`,
      );
      assert.equal(normal.total, Math.round(normal.rawScore * normal.clarityFactor));
      save.lifeMode = 'extreme';
      const extreme = journeyScore(save);
      assert.equal(extreme.clarityFactor, normal.clarityFactor);
      assert.equal(extreme.clarityTotal, normal.total);
      assert.equal(extreme.total, Math.round(normal.total * 1.15));
    }
});

test('v2事实携带承缘估值，全部档位/广告叠加/普通极限前后端计分一致', () => {
  for (const [value] of penaltyCases)
    for (const lifeMode of ['normal', 'extreme'] as const)
      for (const adCount of [0, 1, 5, 12]) {
        const save = fresh();
        save.lifeMode = lifeMode;
        save.completed = [0, 1, 2, 3, 4, 5, 6];
        save.cultivation = IMMORTAL_CULTIVATION;
        save.age = minimumLeaderboardAge(save.completed) + 10;
        save.journeyEnded = true;
        save.inheritanceValue = value;
        save.chronicle.milestones['birth-inheritance'] = 15;
        save.adUsage.supplies = adCount;
        const original = JSON.stringify(save);
        const facts = extractLeaderboardFacts(save);
        assert.ok(facts);
        assert.equal(facts.inherited, true);
        assert.equal(facts.inheritanceValue, value);
        const parsed = parseLeaderboardFacts(facts);
        assert.ok(parsed, `${value}/${lifeMode}/${adCount}`);
        assert.deepEqual(scoreLeaderboardFacts(parsed), journeyScore(save));
        assert.equal(JSON.stringify(save), original);
      }
});

test('后端拒绝非法承缘估值及无承缘却带正估值的矛盾事实', () => {
  const save = fresh();
  save.pendingReincarnation = 'lifespan';
  save.age = 100;
  const facts = extractLeaderboardFacts(save)!;
  assert.ok(parseLeaderboardFacts(facts));
  for (const inheritanceValue of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '100', null])
    assert.equal(parseLeaderboardFacts({ ...facts, inherited: true, inheritanceValue }), null);
  assert.equal(parseLeaderboardFacts({ ...facts, inheritanceValue: 100 }), null);
  assert.ok(parseLeaderboardFacts({ ...facts, inherited: true, inheritanceValue: 0 }));
});

test('实际轮回重置不带旧赠物时清零承缘估值、道心扣减和广告记录', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const match = source.match(/^function resetLifetime\([^]*?^\}/m);
  assert.ok(match, '执行 main.ts 的真实 resetLifetime，避免复制重置实现');
  const reset = new Script(stripTypeScriptTypes(match[0]));
  for (const panel of ['settings', 'lifespan-farewell', 'extreme-farewell']) {
    const save = fresh();
    assert.equal(applyBirthInheritance(save, { kind: 'curio', id: 'heaven-bottle' }), true);
    save.birthInheritance = null;
    save.lifeMode = 'extreme';
    save.adUsage.supplies = 12;
    save.prologueSeen = true;
    const writes: SaveData[] = [];
    let rendered = 0;
    const noop = () => {};
    const context = createContext({
      save,
      panel,
      structuredClone,
      freshSave,
      rootElementsFor,
      applyBirthInheritance,
      departHometown,
      rollSpiritRoot: () => 'heaven',
      writeSave(next: SaveData) {
        writes.push(sealSaveSnapshot(next));
      },
      shownHumanLetters: new Set(['earlier-letter']),
      clearInterval: noop,
      window: { clearTimeout: noop },
      clearInput: noop,
      ambushScene: null,
      gameAudio: { sync: noop },
      minimumDifficulty: () => 0,
      ui: { inert: true },
      modal: { innerHTML: '' },
      adTimer: undefined,
      victoryTimer: undefined,
      adWatchEpoch: 0,
      saveLock: null,
      renderLobby() {
        rendered++;
      },
    });
    reset.runInContext(context);
    assert.equal(context.resetLifetime(), true);
    assert.equal(writes.length, 1);
    assert.equal(rendered, 1);
    assert.equal(save.birthInheritance, null);
    assert.equal(save.inheritanceValue, 0);
    assert.equal(Object.hasOwn(save.chronicle.milestones, 'birth-inheritance'), false);
    assert.equal(save.lifeMode, 'normal');
    assert.deepEqual(save.adUsage, {
      root: 0,
      revive: 0,
      lifespan: 0,
      supplies: 0,
      bestRoot: 'heaven',
    });
    for (const restored of [
      save,
      readSealedSave(JSON.stringify(writes[0])).save,
      importSave(exportSave(save, null)).save,
    ]) {
      assert.equal(restored.inheritanceValue, 0);
      assert.equal(journeyScore(restored).inheritancePenalty, 0);
      assert.equal(journeyScore(restored).clarityFactor, 1.1);
    }
  }
});
