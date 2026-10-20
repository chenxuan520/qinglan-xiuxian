import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { freshSave, realmCost } from '../src/progress.ts';
import { joinSect } from '../src/mortal.ts';
import { powerBreakdown } from '../src/power-breakdown.ts';
import { powerDetailsContent } from '../src/power-details-ui.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { ChronicleSource } from '../src/chronicle-source.ts';
import * as chronicle from '../src/chronicle-content.ts';
import { formatNumber } from '../src/number-format.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
function fixture() {
  const s = freshSave('heaven', ['metal']);
  s.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  s.stones = 10000;
  return s;
}

test('聚灵丹的灵气与冷却增幅同时进入真实入场属性和只读来源明细', () => {
  const s = freshSave('five', ['metal', 'wood', 'water', 'fire', 'earth']);
  s.medicine.active.juyuan = s.age + 1000;
  const before = JSON.stringify(s);
  const result = powerBreakdown(s);
  const row = result.rows.find((r) => r.id === 'medicine:juyuan')!;
  near(
    row.changes.find((c) => c.key === 'xp')!.after /
      row.changes.find((c) => c.key === 'xp')!.before,
    1.25,
  );
  near(
    row.changes.find((c) => c.key === 'cooldown')!.after /
      row.changes.find((c) => c.key === 'cooldown')!.before,
    0.92,
  );
  assert.match(powerDetailsContent(s), /聚灵丹/);
  assert.match(powerDetailsContent(s), /灵气获取/);
  assert.equal(JSON.stringify(s), before);
});

test('两种灵气药效取高时，来源显示移除单药的实际差额，不虚加两份经验', () => {
  const s = freshSave();
  const plain = powerBreakdown(s).current;
  s.medicine.active.yingxiang = s.age + 100;
  let result = powerBreakdown(s);
  near(result.current.xp / plain.xp, 1.15);
  s.medicine.active.juyuan = s.age + 1000;
  result = powerBreakdown(s);
  near(result.current.xp / plain.xp, 1.25);
  assert.ok(
    !result.rows.find((r) => r.id === 'medicine:yingxiang')!.changes.some((c) => c.key === 'xp'),
  );
  const change = result.rows
    .find((r) => r.id === 'medicine:juyuan')!
    .changes.find((c) => c.key === 'xp')!;
  near(change.after / change.before, 1.25 / 1.15);
});

test('入场属性和来源复用真实战斗，满阶悟道、炼器及药效各自贡献准确，读取不改存档', () => {
  const s = fixture();
  s.training = { power: 20, vitality: 11, speed: 20 };
  s.forge[s.starter] = 10;
  s.retreatBonus = { power: 17, vitality: 12, speed: 7 };
  s.tribulations = 2;
  s.medicine.active.heqi = s.age + 100;
  s.medicine.active.dulong = s.age + 100;
  s.medicine.active.huanglong = s.age; // 已到期不计入
  const before = JSON.stringify(s),
    { current, rows } = powerBreakdown(s),
    g = new Game(structuredClone(s), 0, 0, () => 0.5);
  near(current.weaponDamage, g.weaponHitDamage(g.weapons[0]));
  assert.equal(current.hp, g.player.maxHp);
  near(current.armor, g.stats.armor);
  for (const [id, factor] of [
    ['power', 1.6],
    ['forge', 3],
    ['retreat', 1.17],
    ['tribulations', 1.04],
    ['medicine:heqi', 1.18],
    ['medicine:dulong', 1.3],
  ] as const) {
    const change = rows.find((r) => r.id === id)!.changes.find((c) => c.key === 'weaponDamage')!;
    near(change.after / change.before, factor);
  }
  assert.ok(!rows.some((r) => r.id === 'medicine:huanglong'));
  assert.ok(
    rows.find((r) => r.id === 'medicine:dulong')!.changes.find((c) => c.key === 'hp')!.delta < 0,
  );
  assert.equal(JSON.stringify(s), before);
});

test('入宗仍能分清路线与功法，白骨髅专属增伤和精研不会漏算或重复', () => {
  const s = fixture();
  assert.ok(joinSect(s, 'blood'));
  let r = powerBreakdown(s);
  for (const [id, factor] of [
    ['path', 1 + 0.12 / 1.18],
    ['sect', 1 + 0.18 / 1.12],
  ] as const) {
    const c = r.rows.find((r) => r.id === id)!.changes.find((c) => c.key === 'weaponDamage')!;
    near(c.after / c.before, factor);
  }
  const b = fixture();
  assert.ok(joinSect(b, 'bone'));
  b.starter = 'skull';
  b.artifacts.push('skull');
  b.mortal.mastery.bone = 5;
  r = powerBreakdown(b);
  const c = r.rows.find((r) => r.id === 'sect')!.changes.find((c) => c.key === 'weaponDamage')!;
  near(c.after / c.before, 1.092);
  assert.ok(
    r.rows.find((r) => r.id === 'sect')!.changes.some((c) => c.key === 'speed' && c.delta < 0),
  );
  const g = new Game(structuredClone(b), 0, 0, () => 0.5);
  near(spiritPower(b).weaponDamage, g.weaponHitDamage(g.weapons[0]));
  assert.equal(r.current.score, spiritPower(b).score);
});

test('只计算实际入场本命，路线不符时回退的法宝与炼器一致，不混入未装备法宝', () => {
  const s = fixture();
  s.path = 'orthodox';
  s.starter = 'skull';
  s.artifacts.push('skull');
  s.forge.skull = 10;
  s.forge.sword = 2;
  const r = powerBreakdown(s);
  assert.equal(r.current.weaponId, 'sword');
  assert.equal(r.rows.find((r) => r.id === 'forge')!.detail, '2阶');
  near(
    r.rows.find((r) => r.id === 'forge')!.changes.find((c) => c.key === 'weaponDamage')!.after /
      r.rows.find((r) => r.id === 'forge')!.changes.find((c) => c.key === 'weaponDamage')!.before,
    1.16,
  );
  assert.match(powerDetailsContent(s), /青霄剑一重未觉醒/);
});

test('暴击按百分点、毒伤含全局减伤，特殊打王药力与永久培婴丹可见且过期排除', () => {
  const s = fixture();
  s.medicine.active.mingqing = s.age + 100;
  s.medicine.active.xuepo = s.age + 100;
  s.medicine.active.wuchang = s.age + 100;
  s.medicine.used.peiying = 2;
  const r = powerBreakdown(s);
  near(r.current.eliteDamage, 1.15);
  near(r.current.poisonDamage, 0.88);
  near(
    r.rows.find((r) => r.id === 'medicine:mingqing')!.changes.find((c) => c.key === 'crit')!.delta,
    0.06,
  );
  assert.ok(
    r.rows.find((r) => r.id === 'peiying')!.changes.some((c) => c.key === 'hp' && c.delta > 0),
  );
  const html = powerDetailsContent(s);
  assert.match(html, /暴击率 \+6 个百分点/);
  assert.match(html, /明清灵水/);
  assert.match(html, /毒伤承伤比例<\/dt><dd>88%/);
  assert.match(html, /精英与妖王额外增伤/);
  s.age += 100;
  assert.ok(!powerBreakdown(s).rows.some((r) => r.id.startsWith('medicine:')));
});

test('履历按需合并加载，失败可重试、成功复用，详细数字不缩成万亿', async () => {
  let calls = 0;
  const attempts: number[] = [];
  const source = new ChronicleSource(async (attempt) => {
    calls++;
    attempts.push(attempt);
    if (attempt === 0) throw Error('断网');
    return chronicle;
  });
  assert.equal(calls, 0);
  const first = source.load();
  assert.equal(first, source.load());
  await assert.rejects(first, /断网/);
  assert.equal(source.current, null);
  assert.equal(await source.load(), chronicle);
  assert.equal(await source.load(), chronicle);
  assert.deepEqual(attempts, [0, 1]);
  const s = fixture();
  s.retreatBonus.power = 10000;
  const value = powerBreakdown(s).current.weaponDamage.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  });
  assert.ok(chronicle.chronicleContent(s).includes('查看详细属性与增幅来源'));
  assert.ok(powerDetailsContent(s).includes(value));
  assert.ok(!/<details[^>]*class="power-details[^>]*\bopen\b/.test(powerDetailsContent(s)));
});

test('养魂木解释训练本身的20%到26%，独立展开来源给完整比较数值且不改存档', () => {
  const s = freshSave('heaven', ['metal']);
  s.training.power = 10;
  s.curios.bag['soul-wood'] = 1;
  s.curios.acquired.push('soul-wood');
  const before = JSON.stringify(s);
  const row = powerBreakdown(s).rows.find((row) => row.id === 'power')!;
  near(row.amplification!.before, 0.2);
  near(row.amplification!.after, 0.26);
  near(row.amplification!.percent, 0.3);
  const html = powerDetailsContent(s);
  assert.match(html, /悟道增伤 20% → 26% · 养魂木 \+30%/);
  const change = row.changes.find((change) => change.key === 'weaponDamage')!;
  assert.ok(
    html.includes(
      `本命伤害 ${change.before.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} →`,
    ),
  );
  assert.ok(
    html.includes(
      `→ ${change.after.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}（+26%）`,
    ),
  );
  assert.match(html, /保留其他加成对比/);
  assert.doesNotMatch(html, /以未计本项|所以当前|收益：|代价：/);
  assert.ok(!/<details[^>]*data-disclosure="power-origin-[^"]+"[^>]*\bopen\b/.test(html));
  assert.equal(JSON.stringify(s), before);
});

test('功法的减速代价、施法间隔收益和零斩妖回血基数均正确解释', () => {
  const bone = fixture();
  assert.ok(joinSect(bone, 'bone'));
  const boneHtml = powerDetailsContent(bone);
  assert.match(boneHtml, /class="power-loss">移速 [\d,.]+ 像素\/秒 → [\d,.]+ 像素\/秒（-1%）/);
  const soul = fixture();
  assert.ok(joinSect(soul, 'devour'));
  const html = powerDetailsContent(soul);
  assert.match(html, /每次斩妖回血 0 → [\d,.]+（\+[\d,.]+）/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  const medicine = freshSave();
  medicine.medicine.active.juyuan = medicine.age + 100;
  assert.match(powerDetailsContent(medicine), /class="power-gain">施法间隔 1 倍 → 0\.92 倍（-8%）/);
});

test('淬体短句关联养魂木，只对照真实整数气血而不反推训练规则', () => {
  const s = freshSave('heaven', ['metal'], 'orthodox');
  s.training.vitality = 10;
  s.curios.bag['soul-wood'] = 1;
  s.curios.acquired.push('soul-wood');
  const row = powerBreakdown(s).rows.find((row) => row.id === 'vitality')!;
  assert.equal(row.related, '养魂木 → 淬体气血');
  assert.equal(row.amplification, undefined);
  const change = row.changes.find((change) => change.key === 'hp')!;
  assert.equal(change.before, 112);
  assert.equal(change.after, 185);
});

test('履历头部维持简写，完整灵威仅在展开明细中显示', () => {
  const s = fixture();
  s.forge[s.starter] = 10;
  s.training = { power: 20, vitality: 20, speed: 20 };
  s.retreatBonus.power = 10000;
  const full = spiritPower(s).score.toLocaleString('zh-CN');
  assert.ok(
    chronicle
      .chronicleContent(s)
      .includes(`<strong>${formatNumber(spiritPower(s).score)}</strong>`),
  );
  assert.ok(powerDetailsContent(s).includes(`灵威 ${full}`));
  assert.match(powerDetailsContent(s), /百分比不能直接相加/);
});
