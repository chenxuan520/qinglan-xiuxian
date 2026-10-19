// 文档表格与实际规则逐项对照；不要用另一份手填数值作期望值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ELEMENTS,
  REALMS,
  EVOLVED_DAMAGE,
  MAX_WEAPON_LEVEL,
  ROOT_STARTERS,
  SPIRIT_ROOTS,
  STAGES,
  STAGE_COMBAT_SCALING,
  STAGE_CULTIVATION_RATES,
  STAGE_REALM_STEPS,
  TRIAL_BOSS_TIMES,
  formatTime,
  treasure,
  weaponDamageMultiplier,
  weaponLevelDamage,
} from '../src/data.ts';
import {
  bossCultivationReward,
  forgeDamageBonus,
  freshSave,
  realmCost,
  realmDamageMultiplier,
  realmHealthMultiplier,
  trainingYears,
} from '../src/progress.ts';
import { entryCost, masteryRewardPool, sectDues } from '../src/mortal.ts';
import { trainingCost } from '../src/training.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { guideContent, GUIDE_TABS } from '../src/guide.ts';
import { AUCTION_HALLS, AUCTION_IRON_MIN } from '../src/auction-data.ts';
import { AUCTION_SETTINGS } from '../src/setting.ts';
import { auctionSaleRates } from '../src/auction-items.ts';
import { auctionContent } from '../src/auction-ui.ts';
import { beginSectMarketVisit, sectMarketDeals } from '../src/sect-market.ts';
import { prepareAuction } from '../src/auction.ts';

const gameplay = readFileSync(new URL('../docs/gameplay.md', import.meta.url), 'utf8');
const medicine = readFileSync(new URL('../docs/medicine.md', import.meta.url), 'utf8');
const numbers = (text: string) =>
  (text.replaceAll(',', '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const compact = (text: string) => text.replace(/\s/g, '');

function table(source: string, heading: string) {
  const found = [...source.matchAll(/(?:^\|.*\r?\n)+/gm)].filter((m) =>
    m[0].split('\n')[0].includes(heading),
  );
  assert.equal(found.length, 1, `文档表「${heading}」必须恰好一份`);
  return found[0][0]
    .trim()
    .split('\n')
    .slice(2)
    .map((row) =>
      row
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

test('丹药文档逐药核对品级、药效数字及持续时间，不能遗漏或重复药品', () => {
  const rows = table(medicine, '药效');
  assert.equal(rows.length, MEDICINES.length);
  assert.equal(new Set(rows.map((row) => row[1])).size, MEDICINES.length);
  for (const m of MEDICINES) {
    const row = rows.find((r) => r[1] === m.name);
    assert.ok(row, `${m.name}缺少说明`);
    assert.equal(row[0], m.years ? m.tier : '本世珍品', `${m.name}品级`);
    assert.deepEqual(numbers(row[2]), numbers(m.desc), `${m.name}药效数值与药谱不一致`);
    assert.equal(row[3], m.years ? `${m.years} 年` : '本世保留', `${m.name}药效时长`);
  }
});

test('灵根资质表逐列核对五行、伤害、修为倍率及诞生概率', () => {
  const rows = table(gameplay, '五行数量');
  assert.equal(rows.length, SPIRIT_ROOTS.length);
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    assert.ok(rows[i][0].includes(root.name));
    assert.deepEqual(
      numbers(rows[i].slice(1).join(' ')),
      [root.count, root.damageBonus, Math.round(root.rate * 100), root.chance],
      root.id,
    );
  }
});

test('秘境强度表使用真实固定倍率及境界定标，不能误用玩家当前属性', () => {
  const scaling = table(gameplay, '普通怪伤害倍率');
  const benchmarks = table(gameplay, '定标境界');
  assert.equal(scaling.length, STAGES.length);
  assert.equal(benchmarks.length, STAGES.length);
  for (const [i, stage] of STAGES.entries()) {
    assert.equal(scaling[i][0], stage.name);
    const values = STAGE_COMBAT_SCALING[i];
    const expected = [
      values.hp,
      values.damage,
      ...(i === 6 ? [] : [1 + (values.damage - 1) * 0.65]),
    ];
    assert.deepEqual(
      numbers(scaling[i].slice(1).join(' ')),
      expected.map((n) => +n.toFixed(4)),
      stage.name,
    );
    assert.equal(benchmarks[i][0], stage.name);
    assert.deepEqual(
      numbers(benchmarks[i].slice(2).join(' ')),
      [
        realmDamageMultiplier(STAGE_REALM_STEPS[i]),
        realmHealthMultiplier(STAGE_REALM_STEPS[i]),
      ].map((n) => +n.toFixed(4)),
      `${stage.name}境界定标`,
    );
  }
});

test('秘境妖王出场时间与修为表对照实际排程和奖励计算', () => {
  const times = table(gameplay, '妖王出现时间');
  const rewards = table(gameplay, '单次妖王基础修为');
  assert.equal(times.length, STAGES.length);
  assert.equal(rewards.length, STAGES.length);
  for (const [i, stage] of STAGES.entries()) {
    assert.equal(times[i][0], stage.name);
    if (i < 6) {
      assert.deepEqual(numbers(times[i][1]), [stage.minutes], `${stage.name}出王时间`);
      assert.equal(times[i][2], stage.boss);
    }
    assert.equal(rewards[i][0], stage.name);
    assert.equal(Number(rewards[i][1]), STAGE_CULTIVATION_RATES[i]);
    assert.deepEqual(
      numbers(rewards[i][2]),
      i === 6
        ? [bossCultivationReward(6, 0), bossCultivationReward(6, 6)]
        : [bossCultivationReward(i)],
    );
  }
  assert.ok(
    gameplay.includes(
      TRIAL_BOSS_TIMES.map((time) => formatTime(time).replace(/^0/, '')).join('、'),
    ),
    '终关七劫时间列须完整对照排程',
  );
});

test('累计境界门槛表由实际逐阶成本核对，不把累计值写成新增值', () => {
  const rows = table(gameplay, '所需累计修为');
  assert.equal(rows.length, 10);
  for (let major = 1; major <= 8; major++) {
    const cost = Array.from({ length: major * 3 }, (_, step) => realmCost(step)).reduce(
      (a, b) => a + b,
      0,
    );
    assert.equal(numbers(rows[major + 1][1])[0], cost, rows[major + 1][0]);
  }
});

test('默认本命与低重法宝倍率表从真实法宝及成长函数核对', () => {
  const starters = table(gameplay, '首位五行');
  assert.equal(starters.length, ELEMENTS.length);
  for (const [i, element] of ELEMENTS.entries())
    assert.deepEqual(starters[i], [
      element.name,
      ...ROOT_STARTERS[element.id].map((id) => treasure(id).name),
    ]);
  const multipliers = table(gameplay, '其他法宝倍率');
  assert.equal(multipliers.length, MAX_WEAPON_LEVEL + 1);
  for (const [i, row] of multipliers.entries()) {
    const level = Math.min(i + 1, MAX_WEAPON_LEVEL);
    const evolution = i === MAX_WEAPON_LEVEL ? EVOLVED_DAMAGE : 1;
    const expected = weaponDamageMultiplier('orbit', level) * evolution;
    for (const id of ['pagoda', 'flute'])
      assert.equal(weaponDamageMultiplier(id, level) * evolution, expected);
    assert.deepEqual(numbers(row.slice(1).join(' ')), [
      +expected.toFixed(4),
      +(weaponLevelDamage(level) * evolution).toFixed(4),
    ]);
  }
});

test('宗门入门礼、供奉及精研赠药说明与实际报价和奖励池一致', () => {
  const entry = gameplay.match(/入门礼为 ([^。]+) 灵石/);
  assert.ok(entry);
  assert.deepEqual(
    numbers(entry[1]),
    SPIRIT_ROOTS.map((root) => entryCost(freshSave(root.id))),
  );
  const rows = table(gameplay, '单次供奉');
  assert.equal(rows.length, REALMS.length, '供奉表不能遗漏境界');
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i][0], REALMS[i]);
    const save = freshSave();
    save.cultivation = i
      ? Array.from({ length: i * 3 }, (_, step) => realmCost(step)).reduce((a, b) => a + b, 0)
      : 1;
    if (i === 8) save.completed = [6];
    const dues = sectDues(save);
    assert.deepEqual(
      numbers(rows[i].slice(1).join(' ')),
      dues.stones ? [dues.years, dues.stones] : [0],
      rows[i][0],
    );
  }
  for (const [level, label] of [
    [5, '灵品'],
    [10, '珍品'],
  ] as const) {
    const pool = masteryRewardPool(level);
    assert.ok(pool.length > 0, `精研${level}阶赠药池不能为空`);
    assert.ok(pool.every((m) => m.tier === label && m.years > 0));
    assert.match(
      medicine,
      new RegExp(`第 ${level} 阶赠 1 颗随机${level === 10 ? '限时' : ''}${label}丹药`),
    );
  }
});

test('帮助中的根基年岁、炼器增伤与满阶费用对照真实计算', () => {
  const builds = guideContent('builds');
  const training = builds.match(/<table[^>]*><caption>每阶修习[^]*?<\/table>/)?.[0];
  assert.ok(training);
  const rows = [...training.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>([^<]+)<\/td><\/tr>/g)];
  assert.equal(rows.length, SPIRIT_ROOTS.length);
  for (const [i, root] of SPIRIT_ROOTS.entries()) {
    assert.equal(numbers(rows[i][2])[0], trainingYears(freshSave(root.id)));
  }
  const bonuses = guideContent('items').match(/累计伤害加成为 ([^，]+)，与其他伤害/);
  assert.ok(bonuses);
  assert.deepEqual(
    numbers(bonuses[1]),
    Array.from({ length: 10 }, (_, i) => Math.round(forgeDamageBonus(i + 1) * 100)),
  );
  const total = Array.from({ length: 20 }, (_, i) => trainingCost(i)).reduce((a, b) => a + b, 0);
  assert.ok(compact(gameplay).includes(`单项零至满阶${total}，三项${total * 3}`));
});

test('拍卖资格与手续费、玄铁门槛对照实际会场配置', () => {
  const admission = gameplay.match(/一次交(\d+)灵石取得中级资格、(\d+)取得高级资格/);
  assert.ok(admission);
  assert.deepEqual(
    admission.slice(1).map(Number),
    AUCTION_HALLS.slice(1).map((hall) => hall.admission),
  );
  const fees = medicine.match(/买方手续费 (\d+)%，卖方佣金 (\d+)%/);
  assert.ok(fees);
  assert.deepEqual(fees.slice(1).map(Number), [
    AUCTION_SETTINGS.buyerFee,
    AUCTION_SETTINGS.sellerFee,
  ]);
  const iron = gameplay.match(/委托至少(\d+)、至多9999枚/);
  assert.ok(iron);
  assert.equal(Number(iron[1]), AUCTION_IRON_MIN);
  const rates = auctionSaleRates({ kind: 'medicine', id: 'huanglong', quantity: 1, forgeLevel: 0 });
  assert.ok(gameplay.includes(`${rates[0]}%–${rates[1]}%`), '玩法说明的普通寄售价必须跟随实际规则');
  const save = freshSave('heaven', ['metal']);
  save.cultivation = 1;
  save.mortal.population = { seed: 12345, since: 15 };
  beginSectMarketVisit(save);
  prepareAuction(save);
  const sale = auctionContent(save, 'sell', false);
  assert.ok(sale.includes(`${rates[0]}%–${rates[1]}%`), '出售说明必须跟随实际规则');
});

test('每一帮助分类都进入一致性检查，CI独立运行且不混入部署', () => {
  assert.deepEqual(GUIDE_TABS.map((tab) => tab.id).sort(), [
    'basics',
    'builds',
    'combat',
    'items',
    'medicine',
    'mortal',
    'roots',
    'save',
  ]);
  for (const { id } of GUIDE_TABS) assert.ok(guideContent(id).length > 200, id);
  const workflow = readFileSync(
    new URL('../.github/workflows/checks.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /name: Gameplay documentation consistency/);
  assert.match(workflow, /run: npm run docs:check/);
  const deployment = readFileSync(
    new URL('../.github/workflows/pages.yml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(deployment, /npm run docs:check/);
});

test('急需互换的让利说明保持8%设计上限，并能找到实际小赚报价', () => {
  const guide = guideContent('mortal').match(/最多可多换得(\d+)%/);
  const play = gameplay.match(/所得参考价值最多比交出高(\d+)%/);
  const pills = medicine.match(/所得参考价值最多高(\d+)%/);
  for (const match of [guide, play, pills]) {
    assert.ok(match);
    assert.equal(Number(match[1]), 8);
  }
  const save = freshSave('heaven', ['metal']);
  save.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.mortal.population = { seed: 5, since: 15 };
  save.medicine.recipeSeed = 5;
  for (const m of MEDICINES) save.medicine.bag[m.id] = 100;
  beginSectMarketVisit(save);
  const deal = sectMarketDeals(save, 'market-wanderer').find((d) => d.receiveValue > d.giveValue);
  assert.ok(deal, '不能只有让利文案而没有真实盈利报价');
  assert.ok(deal.receiveValue * 100 <= deal.giveValue * (100 + Number(guide![1])));
});
