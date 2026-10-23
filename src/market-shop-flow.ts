import type { ActionShell } from './action-controller.ts';
import {
  executeMarketShop,
  marketShopQuote,
  marketShopStamp,
  type MarketShopId,
} from './market-shop.ts';
import {
  marketShopContent,
  marketShopConfirmation,
  type MarketShopSelection,
} from './market-shop-ui.ts';
import { marketVenueContent } from './market-venue-ui.ts';

function shopSelection(host: ParentNode): MarketShopSelection {
  return {
    from: host.querySelector<HTMLSelectElement>('#shop-from')?.value,
    to: host.querySelector<HTMLSelectElement>('#shop-to')?.value,
    artifact: host.querySelector<HTMLSelectElement>('#shop-artifact')?.value,
  };
}
export function bindMarketShop(shell: ActionShell) {
  const host = shell.modal.querySelector<HTMLElement>('#market-shop-content');
  if (!host) return;
  host.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
    select.onchange = () => {
      const venue = host.dataset.shop as MarketShopId;
      if (
        !host.isConnected ||
        shell.saveLock ||
        shell.panel !== 'market-venue' ||
        !shell.inMarket ||
        shell.marketScene?.nearVenue?.id !== venue
      )
        return;
      const selection = shopSelection(host);
      if (select.id === 'shop-from') selection.to = '';
      host.innerHTML = marketShopContent(shell.save, venue, !!shell.pendingRun, selection);
      bindMarketShop(shell);
      host.querySelector<HTMLElement>(`#${select.id}`)?.focus({ preventScroll: true });
    };
  });
}

// 已由院落控制器验证场景、所处建筑与真实按钮，所有结算仍先写副本再应用。
export function marketShopAction(
  shell: ActionShell,
  action: string,
  choice: string,
  button: HTMLButtonElement,
) {
  const host = shell.modal.querySelector<HTMLElement>('#market-shop-content');
  const venue = host?.dataset.shop;
  if (!host || (venue !== 'medicine' && venue !== 'stalls' && venue !== 'caravan')) return;
  if (action === 'market-venue-shop-cancel' && venue === 'stalls') {
    host.innerHTML = marketShopContent(shell.save, venue, !!shell.pendingRun, { artifact: choice });
    bindMarketShop(shell);
    host
      .querySelector<HTMLElement>('[data-action="market-venue-shop"]')
      ?.focus({ preventScroll: true });
    return;
  }
  if (
    action !== 'market-venue-shop' &&
    !(
      action === 'market-venue-shop-confirm' &&
      venue === 'stalls' &&
      host.querySelector('[data-shop-confirm]')
    )
  )
    return;
  const stamp = button.dataset.stamp ?? '';
  if (stamp !== marketShopStamp(shell.save, venue, choice)) {
    shell.toast('物品或报价已变化，请重新查看');
    return;
  }
  const q = marketShopQuote(shell.save, venue, choice, !!shell.pendingRun);
  if (q.reason) {
    shell.toast(q.reason);
    return;
  }
  if (venue === 'stalls' && action === 'market-venue-shop') {
    host.innerHTML = marketShopConfirmation(shell.save, choice, stamp);
    host.querySelector<HTMLElement>('[data-action="market-venue-shop-cancel"]')?.focus();
    return;
  }
  const next = shell.structuredClone(shell.save);
  const result = executeMarketShop(next, venue, choice, stamp, !!shell.pendingRun);
  if (!result) return;
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    if (!shell.saveLock) shell.toast('交割未能保存，物品与灵石未扣，请重试');
    return;
  }
  Object.assign(shell.save, next);
  const selection = venue === 'stalls' ? { artifact: choice } : shopSelection(host);
  const section = shell.modal.querySelector<HTMLElement>('.panel');
  const scroll = section?.scrollTop ?? 0;
  const content = shell.modal.querySelector<HTMLElement>('#market-venue-content')!;
  content.innerHTML = marketVenueContent(shell.save, venue, !!shell.pendingRun);
  content.querySelector<HTMLElement>('#market-shop-content')!.innerHTML = marketShopContent(
    shell.save,
    venue,
    !!shell.pendingRun,
    selection,
  );
  bindMarketShop(shell);
  content.querySelector<HTMLElement>('#market-venue-result')!.textContent = result;
  if (section) section.scrollTop = scroll;
  const status = shell.document.getElementById('town-status');
  if (status) status.innerHTML = shell.townStatus(shell.save);
  shell.toast('交割已毕');
}
