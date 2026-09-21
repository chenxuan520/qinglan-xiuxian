import {
  MEDICINES,
  activeMedicines,
  medicineFormula,
  medicineInfo,
  type Medicine,
} from './medicine-data.ts';
import {
  medicineUseReason,
  medicineCraftReason,
  medicineCraftStones,
  medicineRecipePrice,
} from './medicine.ts';
import { STAGES, STAGE_YEARS_PER_MINUTE, formatTime } from './data.ts';
import type { SaveData } from './progress.ts';
import { assetUrl } from './asset-url.ts';

export type MedicineView = 'bag' | 'craft' | 'shop' | 'recipes';
export type MedicineTierFilter = 'all' | Medicine['tier'];
const art = (m: Medicine) => {
  const i = MEDICINES.indexOf(m);
  return `<span class="medicine-art" aria-hidden="true" style="background-image:url('${assetUrl('/assets/medicines.webp')}');background-position:${((i % 8) / 7) * 100}% ${(Math.floor(i / 8) / 3) * 100}%"></span>`;
};
export function medicineTime(years: number, stage: number) {
  return `${years.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 年 · 本关约 ${formatTime((years / STAGE_YEARS_PER_MINUTE[stage]) * 60)}`;
}
export function medicineEntrance(save: SaveData, stage: number) {
  const active = activeMedicines(save.medicine, save.age);
  const count = Object.values(save.medicine.bag).reduce((sum, n) => sum + n, 0);
  return `<div class="medicine-entrance"><div><span class="field-label">行前备药</span><p>${active.length ? active.map((m) => `${m.name} · ${medicineTime(save.medicine.active[m.id] - save.age, stage)}`).join('<br>') : '一炉丹香，伴此行山海。'}</p></div><button class="secondary-button" data-action="medicine">丹囊 · ${count} 份 →</button></div>`;
}
export function medicineContent(
  save: SaveData,
  stage: number,
  view: MedicineView,
  unfinished: boolean,
  atShop: boolean,
  tier: MedicineTierFilter = 'all',
) {
  const active = activeMedicines(save.medicine, save.age);
  // 库存为零仍保留键，已吃完的永久珍品继续留在药谱中。
  const discovered = MEDICINES.filter((m) => m.years || Object.hasOwn(save.medicine.bag, m.id));
  const available = discovered.filter((m) =>
    view === 'shop'
      ? save.medicine.shop?.ids.includes(m.id)
      : view === 'craft' || view === 'recipes'
        ? m.tier !== '凡品' && m.years > 0
        : true,
  );
  const list = available.filter((m) => tier === 'all' || m.tier === tier);
  return `<div class="medicine-toolbar"><div><strong>已识丹药 ${discovered.length} 种 · 药方 ${save.medicine.recipes.length} / 16</strong><span>灵石 ${save.stones} · 年岁 ${save.age.toFixed(1)}</span></div><div class="medicine-tabs" role="group" aria-label="丹药用途">${[['bag', '丹囊与药谱'], ['craft', '开炉炼丹'], ['recipes', '购置药方'], ...(atShop ? [['shop', '药铺凡品']] : [])].map(([id, name]) => `<button data-action="medicine-view" data-id="${id}" aria-pressed="${view === id}">${name}</button>`).join('')}</div></div>
  <div class="medicine-tabs medicine-tier-tabs" role="group" aria-label="丹药品级筛选">${(['all', '凡品', '灵品', '珍品'] as const).map((id) => `<button data-action="medicine-tier" data-id="${id}" aria-pressed="${tier === id}">${id === 'all' ? '全部' : id}<span>${available.filter((m) => id === 'all' || m.tier === id).length}</span></button>`).join('')}</div>
  <p class="panel-note">${view === 'shop' ? `药铺本批三种凡品，每种最多购三份，${Math.max(0, (save.medicine.shop?.refreshAt ?? save.age) - save.age).toFixed(1)} 年后换货。<br>` : ''}${STAGES[stage].name} · 战斗每分钟 ${STAGE_YEARS_PER_MINUTE[stage]} 年。同名丹药可叠存；仅战前服用，同时最多三种限时药效。可填写数量一次服用多份，剩余时长累加，强度不叠加。历练、闭关和人间办事均消耗药效，暂停与离线不消耗。${unfinished ? '<br>当前有未结束的历练，暂不能服药或炼丹。' : ''}</p>
  <div class="medicine-active" aria-label="当前药效"><strong>药效 ${active.length} / 3</strong>${active.length ? active.map((m) => `<div>${art(m)}<span>${m.name}<small>${medicineTime(save.medicine.active[m.id] - save.age, stage)}</small></span><button data-action="medicine-discard" data-id="${m.id}" ${unfinished ? 'disabled' : ''}>散去药效</button></div>`).join('') : '<p>尚未服用限时丹药</p>'}</div>
  <div class="medicine-grid">${list
    .map((m) => {
      const owned = save.medicine.bag[m.id] || 0;
      const useReason = medicineUseReason(save, m.id, unfinished);
      const craftReason = medicineCraftReason(save, m.id, unfinished);
      const source = !m.years
        ? '高阶妖王或青岚镇仙人赠药的稀有机缘；不可购买、不可炼制。'
        : m.tier === '凡品'
          ? '青岚镇药铺每十年轮售三种；采药或听书偶有获赠。'
          : m.tier === '灵品'
            ? '妖王概率掉落，亦可炼制。'
            : `第 ${m.stage + 1} 境起妖王概率掉落，亦可炼制。`;
      const formula = medicineFormula(save.medicine, m.id)
        .map(
          (item) =>
            `${medicineInfo(item.id)!.name} ×${item.count}（持有 ${save.medicine.bag[item.id] || 0}）`,
        )
        .join('、');
      const known = save.medicine.recipes.includes(m.id);
      const action =
        view === 'shop'
          ? `<small class="medicine-source">本批已购 ${save.medicine.shop?.bought?.[m.id] || 0} / 3 份</small><button class="secondary-button" data-action="medicine-buy" data-id="${m.id}" data-cost-stones="${m.price}" ${(save.medicine.shop?.bought?.[m.id] || 0) >= 3 ? 'disabled' : ''}>${(save.medicine.shop?.bought?.[m.id] || 0) >= 3 ? '本批售罄 · 待换新货' : `${m.price} 灵石 · 购入一份`}</button>`
          : view === 'recipes'
            ? `<small class="medicine-recipe">本世配方：${formula}<br>合成另需 ${medicineCraftStones(m.id)} 灵石 · ${m.craftYears} 年</small><button class="secondary-button" data-action="medicine-recipe" data-id="${m.id}" data-cost-stones="${medicineRecipePrice(m.id)}" ${known || save.unlocked < m.stage ? 'disabled' : ''}>${known ? '本世已习得' : save.unlocked < m.stage ? `探索第 ${m.stage + 1} 境后解锁` : `${medicineRecipePrice(m.id)} 灵石 · 购得药方`}</button>`
            : view === 'craft'
              ? `<small class="medicine-recipe">${formula}<br>${medicineCraftStones(m.id)} 灵石 · ${m.craftYears} 年</small><button class="secondary-button" data-action="medicine-craft" data-id="${m.id}" ${craftReason ? 'disabled' : ''}>${craftReason || '合成 · 即时结算年岁'}</button>`
              : `${m.years ? `<label class="medicine-quantity" for="medicine-quantity-${m.id}">服用数量<input id="medicine-quantity-${m.id}" type="number" inputmode="numeric" min="1" max="${Math.max(1, owned)}" step="1" value="1" ${useReason ? 'disabled' : ''} aria-label="${m.name}服用数量"></label>` : ''}<button class="secondary-button" data-action="medicine-use" data-id="${m.id}" ${useReason ? 'disabled' : ''}>${useReason || ((save.medicine.active[m.id] || 0) > save.age ? '服用 · 延续药效' : '战前服用')}</button>`;
      return `<article class="medicine-card ${!m.years ? 'medicine-permanent' : ''}"><header>${art(m)}<div><small>${m.tier}${!m.years ? ' · 永久机缘' : ''}</small><h3>${m.name}</h3><span>持有 ${owned} 份</span></div></header><p>${m.desc}</p><small class="medicine-duration">${m.years ? `每份 ${medicineTime(m.years, stage)}` : '即时生效 · 随此世保留'}${m.id === 'peiying' || m.id === 'huiyang' ? `<br>本世已用 ${save.medicine.used[m.id] || 0} / ${m.id === 'peiying' ? 3 : 2} 次` : ''}</small><small class="medicine-source">${source}</small>${action}</article>`;
    })
    .join(
      '',
    )}</div>${list.length ? '' : '<p class="panel-note">此处暂无该品级丹药。</p>'}<p class="panel-note">第三至第七境首次通关各保底一份限时珍品，不含永久珍品。凡品无需合成；灵品消耗三份凡品与 50 年，限时珍品消耗四份灵品与 500 年。药方仅购买获得，本世材料组合固定，轮回后重新生成。所有掉落自动入库；轮回清空此世丹囊与药效。</p>`;
}
