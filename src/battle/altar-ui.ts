import { ALTARS } from './altars.ts';
import { STAGES } from '../core/data.ts';
import type { Game } from './game.ts';
import { lifespanInfo } from '../core/progress.ts';

export function altarDefinition(game: Game) {
  return ALTARS.find((altar) => altar.kind === game.altar?.kind);
}

export function altarHudStatus(game: Game): string {
  const altar = game.altar;
  const definition = altarDefinition(game);
  if (!altar || !definition || game.state !== 'playing') return '';
  if (altar.phase === 'offered' && altar.expiresAt > game.time) {
    const dx = altar.x - game.player.x,
      dy = altar.y - game.player.y;
    const direction = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][
      (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8
    ];
    return `${definition.name} ${direction} ${Math.round(Math.hypot(dx, dy))} 步 · ${Math.ceil(altar.expiresAt - game.time)} 秒后隐去`;
  }
  if (altar.phase === 'accepted') {
    const remaining =
      Math.max(
        altar.regenUntil,
        altar.slowUntil,
        altar.damageUntil,
        altar.deathUntil,
        altar.thunderUntil,
      ) - game.time;
    if (remaining > 0) return `${definition.name} · 剩余 ${Math.ceil(remaining)} 秒`;
  }
  return '';
}

export function altarPromptModal(game: Game): string {
  const definition = altarDefinition(game);
  if (game.altar?.phase !== 'prompt' || !definition) return '';
  const cost =
    definition.kind === 'wood'
      ? Number.isFinite(lifespanInfo(game.save).limit)
        ? `年岁增加 ${game.altarCostYears.toFixed(1)} 年（寿元上限的 20%）`
        : '寿元无尽，此祭无损'
      : definition.cost;
  return `<div class="modal-backdrop"><section class="upgrade-panel altar-panel" role="dialog" aria-modal="true" aria-labelledby="altar-name"><div class="choice-card altar-card" style="--item-color:${STAGES[game.stage].color}"><div class="choice-art" aria-hidden="true">${definition.glyph}</div><h3 id="altar-name">${definition.name}</h3><p>效果：${definition.effect}</p><p class="altar-cost">代价：${cost}</p><div class="altar-actions"><button class="primary-button" data-action="accept-altar"${game.canAcceptAltar ? '' : ' disabled'}>${game.canAcceptAltar ? '接受献祭' : '寿元不足以献祭'}</button><button class="secondary-button" data-action="leave-altar">离开</button></div></div></section></div>`;
}
