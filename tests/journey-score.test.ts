import test from 'node:test';
import assert from 'node:assert/strict';
import {
  journeyScore,
  journeyScoreTier,
  AD_PENALTIES,
  CLARITY_FULL_BONUS,
  EXTREME_SCORE_FACTOR,
  CLARITY_MIN_FACTOR,
  easierSpiritRoot,
} from '../src/journey-score.ts';
import {
  attuneSpiritRoot,
  freshSave,
  readSave,
  SAVE_SCHEMA,
  IMMORTAL_CULTIVATION,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { chronicleContent } from '../src/chronicle-content.ts';
import { journeyCardData } from '../src/journey-card.ts';
import { useMedicine } from '../src/medicine.ts';

test('道基灵威剥离限时丹药，差灵根随灵威成长获得更高逆袭加分', () => {
  const heaven = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  const rootless = freshSave('none', [], 'orthodox', () => 0.5);
  rootless.starter = heaven.starter;

  const earlyHeaven = journeyScore(heaven);
  const earlyRootless = journeyScore(rootless);
  assert.equal(earlyHeaven.rootBonus, 0);
  assert.ok(earlyRootless.rootBonus > 0 && earlyRootless.rootBonus <= 60);

  // 提升到真仙满炼器与根基后，无灵根逆袭加分显著拉开
  for (const s of [heaven, rootless]) {
    s.cultivation = IMMORTAL_CULTIVATION;
    s.completed = [0, 1, 2, 3, 4, 5, 6];
    s.training = { vitality: 20, power: 20, speed: 20 };
    s.forge[s.starter] = 10;
  }
  const lateHeaven = journeyScore(heaven);
  const lateRootless = journeyScore(rootless);
  assert.ok(lateRootless.rootBonus >= 250);
  assert.ok(lateRootless.total > lateHeaven.total);

  // 服用限时丹药不虚增此世评分
  const withActiveMedicine = structuredClone(heaven);
  withActiveMedicine.medicine.active.wuchang = withActiveMedicine.age + 500;
  withActiveMedicine.medicine.active.dingling = withActiveMedicine.age + 500;
  assert.equal(journeyScore(withActiveMedicine).powerScore, lateHeaven.powerScore);
  assert.equal(journeyScore(withActiveMedicine).total, lateHeaven.total);
});

test('先用高灵根发育再洗成低灵根不会骗取差灵根逆袭倍率', () => {
  assert.equal(easierSpiritRoot('heaven', 'none'), 'heaven');
  assert.equal(easierSpiritRoot('none', 'dual'), 'dual');

  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.cultivation = IMMORTAL_CULTIVATION;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(attuneSpiritRoot(save, 'none', []), true);
  assert.equal(save.spiritRoot, 'none');
  assert.equal(save.adUsage.bestRoot, 'heaven');

  const score = journeyScore(save);
  assert.equal(score.effectiveRoot.id, 'heaven');
  assert.equal(score.rootBonus, 0);

  // 无灵根服用补天丹提升资质后，即使同会话再自选洗回无灵根，仍按曾达的最顺遂资质计分
  const rootless = freshSave('none', [], 'orthodox', () => 0);
  rootless.medicine.bag.butian = 2;
  assert.equal(useMedicine(rootless, 'butian', false, 1, () => 0).ok, true);
  assert.equal(rootless.spiritRoot, 'quad');
  assert.equal(rootless.adUsage.bestRoot, 'quad');
  assert.equal(useMedicine(rootless, 'butian', false, 1, () => 0).ok, true);
  assert.equal(rootless.spiritRoot, 'dual');
  assert.equal(rootless.adUsage.bestRoot, 'dual');
  assert.equal(attuneSpiritRoot(rootless, 'none', []), true);
  assert.equal(rootless.spiritRoot, 'none');
  assert.equal(rootless.adUsage.bestRoot, 'dual');
  assert.equal(journeyScore(rootless).effectiveRoot.id, 'dual');
});

test('无外助享道心无瑕加成，各类广告扣减分值并递减道心澄明系数', () => {
  const save = freshSave('triple', ['metal', 'wood', 'water'], 'orthodox', () => 0.5);
  save.cultivation = 30000;
  save.completed = [0, 1, 2, 3, 4];
  save.chronicle.milestones.story = 20;
  save.chronicle.milestones.mastery = 50;

  const clean = journeyScore(save);
  assert.equal(clean.adCount, 0);
  assert.equal(clean.adPenalty, 0);
  assert.equal(clean.clarityFactor, CLARITY_FULL_BONUS);
  assert.equal(clean.total, Math.round(clean.rawScore * CLARITY_FULL_BONUS));
  assert.ok(clean.clarityDelta > 0);

  save.adUsage.supplies = 1;
  const oneAd = journeyScore(save);
  assert.equal(oneAd.adCount, 1);
  assert.equal(oneAd.adPenalty, AD_PENALTIES.supplies);
  assert.equal(oneAd.clarityFactor, 0.97);
  assert.ok(oneAd.total < clean.total);

  save.adUsage.revive = 2;
  save.adUsage.lifespan = 1;
  save.adUsage.root = 1;
  const manyAds = journeyScore(save);
  assert.equal(manyAds.adCount, 5);
  assert.equal(
    manyAds.adPenalty,
    AD_PENALTIES.supplies + 2 * AD_PENALTIES.revive + AD_PENALTIES.lifespan + AD_PENALTIES.root,
  );
  assert.equal(manyAds.clarityFactor, 0.85);

  // 大量外助时道心澄明系数有下限且总分不低于 0
  save.adUsage.supplies = 40;
  const heavyAds = journeyScore(save);
  assert.equal(heavyAds.clarityFactor, CLARITY_MIN_FACTOR);
  assert.equal(heavyAds.total, 0);
});

test('仙途履历与留影数据同步展示此世评分、定品与道心澄明系数，且存档导入导出保持一致', () => {
  const save = freshSave('quad', ['metal', 'wood', 'water', 'fire'], 'orthodox', () => 0.5);
  save.cultivation = 6000;
  save.completed = [0, 1, 2];
  save.adUsage.revive = 1;

  const score = journeyScore(save);
  const html = chronicleContent(save);
  assert.ok(html.includes('此世道果'));
  assert.ok(html.includes(`${score.total}`));
  assert.ok(html.includes(`${score.tier}（${score.grade}）`));
  assert.ok(html.includes(`道心澄明 ×${score.clarityFactor.toFixed(2)}`));
  assert.ok(html.includes('查看此世道果构成'));

  const card = journeyCardData(save);
  assert.deepEqual(card.score, {
    total: score.total,
    tier: score.tier,
    grade: score.grade,
    clarityFactor: score.clarityFactor,
  });

  // 导出再导入保持 adUsage 与评分完全一致
  const exported = exportSave(save, null);
  const imported = importSave(exported).save;
  assert.equal(imported.schema, SAVE_SCHEMA);
  assert.deepEqual(imported.adUsage, save.adUsage);
  assert.deepEqual(journeyScore(imported), score);

  // 旧档缺少 adUsage 时自动按当前灵根补齐且不报错
  const legacyRaw = JSON.stringify({ ...save, schema: SAVE_SCHEMA - 1, adUsage: undefined });
  const migrated = readSave(legacyRaw);
  assert.equal(migrated.status, 'ok');
  assert.deepEqual(migrated.save.adUsage, {
    root: 0,
    revive: 0,
    lifespan: 0,
    supplies: 0,
    bestRoot: 'quad',
  });
});

test('极限道果在原完整评分之后增加15%，明细不把模式加成混入道心澄明', () => {
  for (const cultivation of [0, 1, 100, 6000, 30000, IMMORTAL_CULTIVATION]) {
    const normal = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
    normal.cultivation = cultivation;
    const extreme = structuredClone(normal);
    extreme.lifeMode = 'extreme';
    const before = JSON.stringify(extreme);
    const n = journeyScore(normal),
      e = journeyScore(extreme);
    assert.equal(n.modeFactor, 1);
    assert.equal(n.modeDelta, 0);
    assert.equal(e.modeFactor, EXTREME_SCORE_FACTOR);
    assert.equal(e.permanentPower, n.permanentPower);
    assert.equal(e.rawScore, n.rawScore);
    assert.equal(e.clarityTotal, n.total);
    assert.equal(e.clarityDelta, n.clarityDelta);
    assert.equal(e.total, Math.round(n.total * 1.15));
    assert.equal(e.modeDelta, e.total - n.total);
    assert.equal(e.rawScore + e.clarityDelta + e.modeDelta, e.total);
    assert.equal(JSON.stringify(extreme), before, '计算评分不修改本世状态');
  }
});

test('极限加成在履历单独说明、与留影一致，导入导出不重复叠加', () => {
  const save = freshSave('none', [], 'orthodox', () => 0.5);
  save.lifeMode = 'extreme';
  save.cultivation = IMMORTAL_CULTIVATION;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  const score = journeyScore(save);
  const html = chronicleContent(save);
  assert.match(html, /data-score-mode>一命问道 ×1.15/);
  assert.ok(html.includes(`加成前道果 ${score.clarityTotal}`));
  assert.ok(html.includes(`+${score.modeDelta}（×1.15）`));
  assert.equal(journeyCardData(save).score.total, score.total);
  assert.equal(journeyCardData(save).extreme, true);
  const restored = importSave(exportSave(save, null)).save;
  assert.deepEqual(journeyScore(restored), score);
  assert.equal(journeyScore(restored).total, score.total);
  restored.lifeMode = 'normal';
  assert.ok(!chronicleContent(restored).includes('data-score-mode'));
  assert.equal(journeyScore(restored).total, score.clarityTotal);
});

test('八档道果按最终分数定品，仙品与帝品边界明确且总分不封顶', () => {
  const cases = [
    [0, '下品'],
    [99, '下品'],
    [100, '中下品'],
    [249, '中下品'],
    [250, '中品'],
    [449, '中品'],
    [450, '中上品'],
    [999, '中上品'],
    [1000, '上品'],
    [1499, '上品'],
    [1500, '极品'],
    [1999, '极品'],
    [2000, '仙品'],
    [2499, '仙品'],
    [2500, '帝品'],
    [100000, '帝品'],
  ] as const;
  for (const [score, grade] of cases)
    assert.equal(journeyScoreTier(score).grade, grade, String(score));
});

test('上品及仙帝品称号遵守确认后的对应关系', () => {
  assert.equal(journeyScoreTier(1000).title, '道行通玄');
  assert.equal(journeyScoreTier(2000).title, '道参造化');
  assert.equal(journeyScoreTier(2500).title, '万古绝尘');
});
