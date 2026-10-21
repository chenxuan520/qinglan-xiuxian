import { powerAttributes, powerBreakdown, type PowerAttribute } from './power-breakdown.ts';
import type { SaveData } from './progress.ts';

const num = (n: number, digits = 2) =>
  n.toLocaleString('zh-CN', { maximumFractionDigits: digits, useGrouping: false });
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : ''}${num(n, digits)}`;
const valueLabel = (key: PowerAttribute, value: number) =>
  ['crit', 'armor', 'poisonDamage'].includes(key)
    ? `${num(value * 100)}%`
    : num(value, key === 'regen' || key === 'killHeal' ? 4 : 2) +
      powerAttributes.find((a) => a.key === key)!.unit;

export function powerDetailsContent(save: SaveData) {
  const { current, root, rows } = powerBreakdown(save);
  const values = powerAttributes
    .map((a) => {
      const value = current[a.key];
      const display = valueLabel(a.key, value);
      return `<div><dt>${a.label}</dt><dd>${display}</dd></div>`;
    })
    .join('');
  const origins = rows
    .map((row) => {
      const comparison = row.changes
        .map((change) => {
          const a = powerAttributes.find((a) => a.key === change.key)!;
          const gain = a.betterLow ? change.delta < 0 : change.delta > 0;
          const difference = ['crit', 'armor', 'poisonDamage'].includes(a.key)
            ? `${signed(change.delta * 100)} 个百分点`
            : change.before > 0
              ? `${signed((change.delta / change.before) * 100)}%`
              : `${signed(change.delta, ['regen', 'killHeal'].includes(a.key) ? 4 : 2)}${a.unit}`;
          return `<span class="${gain ? 'power-gain' : 'power-loss'}">${a.key === 'weaponDamage' ? '本命伤害' : a.label} ${valueLabel(a.key, change.before)} → ${valueLabel(a.key, change.after)}（${difference}）</span>`;
        })
        .join('');
      const amplification = row.amplification
        ? `<span>悟道增伤 ${num(row.amplification.before * 100)}% → ${num(row.amplification.after * 100)}% · 养魂木 +${num(row.amplification.percent * 100)}%</span>`
        : '';
      return `<div class="power-origin" data-power-source="${row.id}"><dt>${row.name}<small>${row.detail}</small></dt><dd>${row.changes
        .map((change) => {
          const a = powerAttributes.find((a) => a.key === change.key)!;
          if (a.key === 'crit') return `<span>暴击率 ${signed(change.delta * 100)} 个百分点</span>`;
          if (a.key === 'armor' || a.key === 'poisonDamage')
            return `<span class="${change.delta < 0 ? 'power-gain' : 'power-loss'}">${a.label} ${signed(change.delta * 100)} 个百分点</span>`;
          if (['cooldown', 'area', 'duration', 'xp', 'eliteDamage'].includes(a.key))
            return `<span class="${(a.betterLow ? change.delta < 0 : change.delta > 0) ? 'power-gain' : 'power-loss'}">${a.label} ${signed((change.delta / change.before) * 100)}%</span>`;
          const percent =
            change.before > 0 ? `（${signed((change.delta / change.before) * 100)}%）` : '';
          return `<span class="${change.delta > 0 ? 'power-gain' : 'power-loss'}">${a.label} ${signed(change.delta, ['regen', 'killHeal'].includes(a.key) ? 4 : 2)}${a.unit}${percent}</span>`;
        })
        .join(
          '',
        )}<details data-disclosure="power-origin-${row.id}"><summary>数值对照</summary>${row.related ? `<span>${row.related}</span>` : ''}${amplification}${comparison}</details></dd></div>`;
    })
    .join('');
  return `<details class="power-details disclosure" data-disclosure="power-details"><summary>查看详细属性与增幅来源</summary><p class="panel-note">满血、一级入场估算 · 灵威 ${num(current.score, 0)}。${root.name}基础：气血${root.baseHp}、移速${root.baseSpeed}、暴击${num(root.baseCrit * 100)}%。</p><dl class="power-stat-grid">${values}</dl><p class="panel-note">${current.weapon}一重未觉醒：本命施法间隔约${num(current.weaponCooldown, 3)}秒。单次伤害为非暴击基础值，多弹、穿透、跳伤与敌方减伤另计。施法间隔与承伤比例越低越好；毒伤已计全局减伤。</p><h4>哪些修行正在生效</h4><p class="panel-note">保留其他加成对比，百分比不能直接相加。</p><dl class="power-origin-list">${origins || '<p>当前没有额外入场增幅。</p>'}</dl></details>`;
}
