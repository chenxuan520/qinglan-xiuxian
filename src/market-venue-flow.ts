import type { ActionShell } from './action-controller.ts';
import { MARKET_BUILDINGS, MARKET_VENUES, type MarketVenueId } from './sect-market-data.ts';
import { executeVenue } from './market-venues.ts';
import { marketVenueContent } from './market-venue-ui.ts';

export function renderVenue(shell: ActionShell, id: MarketVenueId) {
  const venue = MARKET_VENUES.find((v) => v.id === id);
  if (!venue || shell.saveLock || !shell.inMarket || shell.marketScene?.nearVenue?.id !== id)
    return;
  shell.marketNpc = null;
  shell.panel = 'market-venue';
  shell.panelFrame(
    MARKET_BUILDINGS[venue.building].label,
    '宗门坊市 · 坊中诸事',
    `<div id="market-venue-content" data-venue="${id}">${marketVenueContent(shell.save, id, !!shell.pendingRun)}</div>`,
  );
}
export function marketVenueAction(shell: ActionShell, action: string, choice?: string) {
  const host = shell.modal.querySelector<HTMLElement>('#market-venue-content');
  const venue = MARKET_VENUES.find((v) => v.id === host?.dataset.venue);
  if (
    !host ||
    !venue ||
    !shell.inMarket ||
    shell.saveLock ||
    shell.game ||
    shell.panel !== 'market-venue' ||
    shell.marketScene?.nearVenue?.id !== venue.id
  )
    return;
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.dataset.action === action && b.dataset.id === choice,
  );
  if (!button || button.disabled || !choice) return;
  if (action === 'market-venue-guide') {
    if (!shell.marketScene.guideTo(choice)) return;
    shell.panel = '';
    shell.modal.innerHTML = '';
    shell.document.getElementById('sect-market-view')?.focus({ preventScroll: true });
    return;
  }
  if (action !== 'market-venue-act') return;
  const next = shell.structuredClone(shell.save);
  const result = executeVenue(next, choice, button.dataset.stamp ?? '', !!shell.pendingRun);
  if (!result) return;
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    if (!shell.saveLock) shell.toast('这桩事项未能保存，请重试');
    return;
  }
  Object.assign(shell.save, next);
  const section = shell.modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  host.innerHTML = marketVenueContent(shell.save, venue.id, !!shell.pendingRun);
  host.querySelector<HTMLElement>('#market-venue-result')!.textContent = result;
  if (section) section.scrollTop = scroll;
  const status = shell.document.getElementById('town-status');
  if (status) status.innerHTML = shell.townStatus(shell.save);
  shell.toast('已结清，结果记在此处');
}
