import { powerAttributes, powerBreakdown } from './power-breakdown.ts';
import type { SaveData } from './progress.ts';

const num = (n: number, digits = 2) => n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : ''}${num(n, digits)}`;

export function powerDetailsContent(save: SaveData) {
  const { current, root, rows } = powerBreakdown(save);
  const values = powerAttributes
    .map((a) => {
      const value = current[a.key];
      const display = ['crit', 'armor', 'poisonDamage'].includes(a.key)
        ? `${num(value * 100)}%`
        : num(value, a.key === 'regen' || a.key === 'killHeal' ? 4 : 2) + a.unit;
      return `<div><dt>${a.label}</dt><dd>${display}</dd></div>`;
    })
    .join('');
  const origins = rows
    .map(
      (row) =>
        `<div class="power-origin"><dt>${row.name}<small>${row.detail}</small></dt><dd>${row.changes
          .map((change) => {
            const a = powerAttributes.find((a) => a.key === change.key)!;
            if (a.key === 'crit')
              return `<span>暴击率 ${signed(change.delta * 100)} 个百分点</span>`;
            if (a.key === 'armor' || a.key === 'poisonDamage')
              return `<span class="${change.delta < 0 ? 'power-gain' : 'power-loss'}">${a.label} ${signed(change.delta * 100)} 个百分点</span>`;
            if (['cooldown', 'area', 'duration', 'xp', 'eliteDamage'].includes(a.key))
              return `<span>${a.label} ${signed((change.delta / change.before) * 100)}%</span>`;
            const percent =
              change.before > 0 ? `（${signed((change.delta / change.before) * 100)}%）` : '';
            return `<span class="${change.delta > 0 ? 'power-gain' : 'power-loss'}">${a.label} ${signed(change.delta, ['regen', 'killHeal'].includes(a.key) ? 4 : 2)}${a.unit}${percent}</span>`;
          })
          .join('')}</dd></div>`,
    )
    .join('');
  return `<details class="power-details disclosure" data-disclosure="power-details"><summary>查看详细属性与增幅来源</summary><p class="panel-note">以下为当前满血、一级入场数值，完整显示数字。${root.name}基础：气血${root.baseHp}、移速${root.baseSpeed}、暴击${num(root.baseCrit * 100)}%。</p><dl class="power-stat-grid">${values}</dl><p class="panel-note">${current.weapon}一重未觉醒：本命施法间隔约${num(current.weaponCooldown, 3)}秒。单次伤害是非暴击的招式基础值；多弹、穿透、领域跳伤与敌方减伤另计，不是每秒伤害。施法间隔与承伤比例越低越好，毒伤承伤比例已计入全局减伤。</p><h4>哪些修行正在生效</h4><p class="panel-note">各项增幅相互影响，不能直接相加。这里只列当前生效的修行与药效。</p><dl class="power-origin-list">${origins || '<p>当前没有额外入场增幅。</p>'}</dl></details>`;
}
