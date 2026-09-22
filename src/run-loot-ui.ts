import type { Game } from './game.ts';
import { treasure } from './data.ts';
import { icon } from './icons.ts';
import { medicineInfo } from './medicine-data.ts';
import { medicineArt } from './medicine-ui.ts';

export function runLootContent(loot: Game['loot']) {
  const items = [
    ...loot.artifacts.map((id) => {
      const item = treasure(id);
      return { name: item.name, detail: '新获法宝', art: icon(id, item.color), count: 1 };
    }),
    ...Object.entries(loot.medicines).map(([id, count]) => {
      const item = medicineInfo(id)!;
      return {
        name: item.name,
        detail: item.years ? `${item.tier}丹药` : '永久珍品丹药',
        art: medicineArt(item),
        count,
      };
    }),
  ];
  return `<section class="result-loot" aria-label="此行收获"><h3>此行收获</h3>${items.length ? `<div class="result-loot-items">${items.map((item) => `<div class="result-loot-item">${item.art}<div class="result-loot-copy"><strong>${item.name}</strong><small>${item.detail}</small></div><b>×${item.count}</b></div>`).join('')}</div>` : ''}<p class="panel-note">${!loot.complete ? '仅记录本次续局后的收获；旧续局之前的物品记录未载。' : items.length ? '物品已自动入库，此处仅展示，不会重复发放。' : '本局未获新的法宝或丹药。'}</p></section>`;
}
