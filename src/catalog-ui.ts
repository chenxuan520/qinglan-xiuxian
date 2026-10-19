import {
  TREASURES,
  PASSIVES,
  CULTIVATION_PATHS,
  MAX_FORGE_LEVEL,
  pathInfo,
  allowsSchool,
  evolutionPassives,
  treasure,
} from './data.ts';
import { forgeCost, forgeDamageBonus, type SaveData } from './progress.ts';
import { currency, weaponAffinity, catalogEvolutionRecipe } from './common-ui.ts';
import { icon, smallIcon } from './icons.ts';
import { masteryDescription } from './mortal-ui.ts';
import type { PanelDefinition } from './panel-host.ts';
import { CURIOS } from './curio-info.ts';
import { curioCollection } from './curio-ui.ts';
export interface CatalogView {
  panel: 'arsenal' | 'treasure-detail';
  catalogTreasures: typeof TREASURES;
  schoolFilter: string;
  treasurePage: number;
  selectedTreasure: string;
  bookTab: string;
}
export function catalogPanel(save: SaveData, view: CatalogView): PanelDefinition {
  const { panel, catalogTreasures, schoolFilter, treasurePage, selectedTreasure, bookTab } = view;
  const visibleTreasures = catalogTreasures.filter(
    (t) => schoolFilter === 'all' || t.school === schoolFilter,
  );
  const pageCount = Math.ceil(visibleTreasures.length / 12);
  const t = treasure(selectedTreasure),
    level = save.forge[t.id] || 0,
    cost = forgeCost(level, save),
    owned = save.artifacts.includes(t.id);
  const detail =
    bookTab === 'treasures'
      ? `<div class="treasure-detail ${owned && level === MAX_FORGE_LEVEL ? 'is-forged-max' : ''}"><div class="detail-emblem" style="--item-color:${t.color}">${icon(t.id, t.color)}</div><div class="detail-copy"><span class="item-tag">${pathInfo(t.school).name} · ${t.tag}</span><h3>${t.name}<small>炼器 ${level} / ${MAX_FORGE_LEVEL}<span class="forge-bonus">伤害 +${Math.round(forgeDamageBonus(level) * 100)}%</span></small></h3><p>${t.desc}</p>${weaponAffinity(t, save.spiritRoot, save.rootElements)}${catalogEvolutionRecipe(t)}<p>法宝六重与任一配套功法五重齐备后，在局内升级中选择仙器觉醒。纯修使用本流派功法，兼修可任选上述两种之一。这里的重数是局内等级，与永久炼器阶数无关。</p></div><div class="detail-actions"><button class="secondary-button" data-action="equip" ${!owned || save.starter === t.id || !allowsSchool(save.path, t.school) ? 'disabled' : ''}>${!owned ? '可获妖王遗宝或赴法器阁寻访' : !allowsSchool(save.path, t.school) ? `需选择${pathInfo(t.school).name}或兼修` : save.starter === t.id ? '已设为本命法宝' : '设为本命法宝'}</button><button class="primary-button compact" data-action="forge" data-cost-stones="${cost.stones}" data-cost-iron="${cost.iron}" ${!owned || level >= MAX_FORGE_LEVEL ? 'disabled' : ''}>${!owned ? '尚未收藏 · 可局内领悟' : level >= MAX_FORGE_LEVEL ? '炼器圆满' : `炼器 · ${cost.iron} 玄铁 + ${cost.stones} 灵石`}</button><small>炼器伤害 +${Math.round(forgeDamageBonus(level) * 100)}%${level < MAX_FORGE_LEVEL ? ` · 下一阶 +${Math.round(forgeDamageBonus(level + 1) * 100)}%（较当前提升 ${(((1 + forgeDamageBonus(level + 1)) / (1 + forgeDamageBonus(level)) - 1) * 100).toFixed(1)}%）` : ' · 十阶圆满奖励已计入'}</small></div></div>`
      : '<p class="panel-note">正道与魔道各 8 种功法，纯修仅出现本流派功法，兼修可自由混搭。每局最多修炼 4 种，每种可升至五重。将对应功法修满五重，才可使六重法宝进化为仙器。</p>';
  if (panel === 'treasure-detail') {
    return {
      title: t.name,
      subtitle: '藏器阁 · 法宝详情',
      body: `${detail}<button class="secondary-button guide-close" data-action="close">返回法宝列表</button>`,
      wide: false,
    };
  }
  const header = `<p class="panel-note">已收藏 ${save.artifacts.length} / ${TREASURES.length} 件 · 妖王必掉 3 件未拥有法宝，击败即收入藏器阁，可设本命与炼器。</p><div class="panel-toolbar collection-toolbar"><div class="book-tabs" role="group" aria-label="藏器分类">${[
    { id: 'treasures', name: '法宝', count: TREASURES.length },
    { id: 'passives', name: '功法', count: PASSIVES.length },
    { id: 'curios', name: '奇物', count: CURIOS.length },
  ]
    .map(
      (tab) =>
        `<button data-action="book-tab" data-id="${tab.id}" class="${bookTab === tab.id ? 'active' : ''}" aria-pressed="${bookTab === tab.id}">${tab.name} <b>${tab.count}</b></button>`,
    )
    .join('')}</div><div class="header-right">${currency(save)}</div></div>`;
  return {
    title: '万般法宝，皆可入道',
    subtitle: '藏器阁',
    body: `${header}${
      bookTab === 'curios'
        ? curioCollection(save)
        : `<div class="collection-navigation"><div class="collection-filters" role="group" aria-label="物品流派筛选">${[{ id: 'all', name: '全部流派' }, ...CULTIVATION_PATHS.filter((p) => p.id !== 'dual')].map((p) => `<button data-action="school-filter" data-id="${p.id}" class="${schoolFilter === p.id ? 'active' : ''}" aria-pressed="${schoolFilter === p.id}">${p.name}</button>`).join('')}</div>${
            bookTab === 'treasures' && pageCount > 1
              ? `<nav class="collection-pages" aria-label="法宝分页"><button class="collection-previous" data-action="treasure-page" data-id="previous" aria-label="上一页法宝" ${treasurePage === 0 ? 'disabled' : ''}>${smallIcon('arrow')}</button><span aria-live="polite" aria-atomic="true" title="第 ${treasurePage * 12 + 1}–${Math.min(visibleTreasures.length, (treasurePage + 1) * 12)} 件，共 ${visibleTreasures.length} 件"><span class="sr-only">第 </span>${treasurePage + 1}<span aria-hidden="true"> / </span><span class="sr-only"> 页，共 </span>${pageCount}<span class="sr-only"> 页</span></span><button data-action="treasure-page" data-id="next" aria-label="下一页法宝" ${treasurePage === pageCount - 1 ? 'disabled' : ''}>${smallIcon('arrow')}</button></nav>`
              : ''
          }</div><div class="collection-grid ${bookTab === 'treasures' ? 'treasure-grid' : ''}">${
            bookTab === 'treasures'
              ? visibleTreasures
                  .slice(treasurePage * 12, treasurePage * 12 + 12)
                  .map(
                    (t) =>
                      `<button class="collection-card ${selectedTreasure === t.id ? 'selected' : ''}${save.artifacts.includes(t.id) ? (save.forge[t.id] === MAX_FORGE_LEVEL ? ' is-forged-max' : '') : ' is-unowned'}" data-action="treasure" data-id="${t.id}" style="--item-color:${t.color}">${icon(t.id, t.color)}<div><strong>${t.name}</strong><small>${pathInfo(t.school).name} · ${save.artifacts.includes(t.id) ? '已收藏' : '待收集'}</small>${weaponAffinity(t, save.spiritRoot, save.rootElements, true)}${catalogEvolutionRecipe(t)}</div>${save.starter === t.id ? '<span class="equipped-label">本命</span>' : ''}<span class="forge-dots"><span>炼器 ${save.forge[t.id] || 0} / ${MAX_FORGE_LEVEL}</span><span class="forge-bonus">伤害 +${Math.round(forgeDamageBonus(save.forge[t.id] || 0) * 100)}%</span></span></button>`,
                  )
                  .join('')
              : PASSIVES.filter((p) => schoolFilter === 'all' || p.school === schoolFilter)
                  .map(
                    (p) =>
                      `<article class="passive-card">${icon(p.id, p.color)}<h3>${p.name}</h3><span class="school-label" style="color:${pathInfo(p.school).color}">${pathInfo(p.school).name} · 每重效果</span><p>${p.desc}</p><small>${masteryDescription(save, p.id)}</small><small>共鸣：${
                        TREASURES.filter((t) => evolutionPassives(t).includes(p.id))
                          .map((t) => t.name)
                          .join('、') || '提升所有法宝'
                      }</small></article>`,
                  )
                  .join('')
          }</div>${bookTab === 'passives' ? detail : ''}<p class="panel-note">当前路线：${pathInfo(save.path).name}。纯修只领悟本流派法宝和功法，兼修可混搭。出发携带 1 件本命法宝，局内最多 6 件。精英宝匣可直接提升法宝重数，妖王遗宝收入藏器阁后可设本命与永久炼器；未收藏法宝仍可在局内领悟。</p>`
    }`,
    wide: true,
  };
}
