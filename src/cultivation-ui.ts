import { FINAL_TRIAL_STAGE, REALMS, spiritRootInfo } from './data.ts';
import { realmInfo, lifespanInfo, trainingYears, trainingCost, type SaveData } from './progress.ts';
import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';
import {
  currency,
  realmVerse,
  spiritRootSummary,
  lifespanSummary,
  retreatSection,
} from './common-ui.ts';
import { icon } from './icons.ts';
import type { PanelDefinition } from './panel-host.ts';
export function cultivationPanel(save: SaveData, selectedStage: number): PanelDefinition {
  const r = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const current = spiritPower(save);
  const next = r.max
    ? null
    : spiritPower({
        ...save,
        cultivation: save.cultivation + Math.max(0, r.needed - r.progress),
        completed: r.step === 23 ? [...save.completed, FINAL_TRIAL_STAGE] : save.completed,
      });
  return {
    title: '积一寸修为，近一寸长生',
    subtitle: '洞府',
    body: `<div class="cultivation-summary"><h3>${r.name}<small>累计修为 ${save.cultivation}</small></h3><p>${r.max ? '长生久视' : r.ascending || r.locked ? '成仙需通关第七境「万劫归墟」' : `距下一境界还需 ${Math.max(0, r.needed - r.progress)} 修为`}</p><span>年岁 ${save.age.toFixed(1)} / ${Number.isFinite(lifespanInfo(save).limit) ? `${lifespanInfo(save).limit} 年寿元` : '无限寿元'}</span></div><div class="section-heading"><h3>修习根基</h3><div class="header-right">${currency(save)}</div></div><div class="training-grid">${(
      [
        {
          id: 'vitality',
          name: '淬体',
          icon: 'guard',
          desc: '每阶气血上限 +5%，满二十阶 +100%',
          detail: '筋骨如玉，百劫不摧',
        },
        {
          id: 'power',
          name: '悟道',
          icon: 'power',
          desc: `每阶独立增伤 +${spiritRootInfo(save.spiritRoot).powerPerLevel}%`,
          detail: `${spiritRootInfo(save.spiritRoot).name} · 当前增伤 +${Number((save.training.power * spiritRootInfo(save.spiritRoot).powerPerLevel).toFixed(1))}%`,
        },
        {
          id: 'speed',
          name: '身法',
          icon: 'haste',
          desc: '每阶移动速度 +2%',
          detail: '身随风起，踏雪无痕',
        },
      ] as const
    )
      .map(
        (t) =>
          `<article class="training-card">${icon(t.icon, '#cfcb9c')}<h3>${t.name}<small>${save.training[t.id]} / 20 阶</small></h3><p>${t.detail}</p><strong>${t.desc}</strong><button class="secondary-button" data-action="train" data-id="${t.id}" data-cost-stones="${trainingCost(save.training[t.id])}" ${save.training[t.id] >= 20 || lifespanInfo(save).remaining <= trainingYears(save) + 1e-9 ? 'disabled' : ''}>${save.training[t.id] >= 20 ? '修习圆满' : lifespanInfo(save).remaining <= trainingYears(save) + 1e-9 ? '寿元不足' : `修炼 · ${trainingCost(save.training[t.id])} 灵石 · ${trainingYears(save)} 年`}</button></article>`,
      )
      .join(
        '',
      )}</div><details class="disclosure" data-disclosure="cultivation"><summary>境界属性与根基说明</summary><div class="cultivation-overview"><div class="realm-circle"><small>当前境界</small><strong>${save.cultivation === 0 ? '凡人' : r.ascending ? '渡劫' : REALMS[r.index]}</strong><span>${save.cultivation === 0 ? '尚未入道' : r.max ? '长生久视' : r.ascending ? '待破七境' : ['初期', '中期', '后期'][r.step % 3]}</span></div><div class="cultivation-progress"><h3>${r.name}<span>累计修为 ${save.cultivation}</span></h3><p class="realm-verse">${realmVerse(r)}</p><div class="thin-bar"><i style="width:${r.max ? 100 : Math.min(100, (r.progress / r.needed) * 100)}%"></i></div><p>${save.cultivation === 0 ? `斩妖积累修为，即可引气入体、踏入炼气初期；炼气中期需累计 ${r.needed} 修为。` : r.max ? '真仙 · 长生久视，仙途无尽。' : r.ascending ? '修为已达标，正待渡劫。通关第七境「万劫归墟」后成就真仙，气血与法宝威力大幅提升；无需再刷一轮修为。' : r.locked ? `成仙瓶颈：须通关第七境「万劫归墟」。已积攒 ${r.progress} / ${r.needed} 修为，超额保留。` : `距下一境界还需 ${Math.max(0, r.needed - r.progress)} 修为，斩妖、升级实时积累，满额立即突破。`}</p><p><strong>当前入场气血 ${formatNumber(current.hp)}</strong><br>${current.weapon}基础伤害约 ${formatNumber(Math.round(current.weaponDamage))}${next ? `<br>${r.step === 23 ? '通关第七境成仙后' : '下次突破后'}：气血 ${formatNumber(next.hp)}（+${formatNumber(next.hp - current.hp)}），本命基础伤害约 ${formatNumber(Math.round(next.weaponDamage))}（+${formatNumber(Math.round(next.weaponDamage) - Math.round(current.weaponDamage))}）` : ''}</p><small>按当前根基、炼器、宗门与药效估算新历练；本命按一重、未觉醒、非暴击计算，具体招式与敌方减伤另计。灵根主要影响修炼速度，境界越高，气血与伤害越强。</small></div></div><div class="realm-road">${REALMS.map((name, i) => `<div class="${i === r.index && save.cultivation > 0 ? 'current' : i < r.index ? 'passed' : ''}"><span>${['一', '二', '三', '四', '五', '六', '七', '八', '九'][i]}</span><strong>${r.ascending && i === r.index ? '渡劫' : name}</strong></div>`).join('')}</div><p class="panel-note">修习根基每阶消耗 ${trainingYears(save)} 年岁（${spiritRootInfo(save.spiritRoot).name}），资质越高修炼越快；寿元不足不扣资源。悟道各阶增伤相加后独立生效，不被境界与功法稀释；前十阶费用保持，后十阶涨幅放缓，单项修满共需 47373 灵石。斩妖与升级的修为实时入账，突破立即生效。通关额外修为、灵石和玄铁在历练结束时结算，失败也有收益。</p></details>${spiritRootSummary(save)}${lifespanSummary(save, selectedStage)}${retreatSection(save)}<div class="save-record"><div class="save-record-copy"><h3>此世存档</h3><p>把这一世的修为、旧事与未尽历练收进行囊，日后仍可续上仙途。</p><small>本地保存为 JSON，不会上传。</small></div><div class="save-actions"><button class="secondary-button" data-action="export-save">导出此世</button><button class="secondary-button" data-action="import-save">导入旧档</button><input id="save-import" type="file" accept=".json,application/json" hidden></div></div>`,
    wide: true,
  };
}
