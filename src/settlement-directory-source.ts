import { ModuleSource } from './module-source.ts';
import { resourceFailureContent } from './resource-panel.ts';
import type { SaveData } from './progress.ts';
type DirectoryModule = typeof import('./settlement-directory.ts');

export function settlementDirectoryEntrance(market = false) {
  return `<details class="mortal-journal settlement-directory" data-settlement-directory="${market ? 'market' : 'town'}"><summary>${market ? '坊中去处' : '街巷去处'} · 建筑用途与花费</summary><div data-directory-content></div></details>`;
}

// 清单只在主动展开时加载；失败依赖可能被浏览器缓存，沿用保护保存后的整页重载。
export function bindSettlementDirectory(
  root: HTMLElement,
  context: () => { save: SaveData; unfinished: boolean; locked: boolean },
  source = new ModuleSource<DirectoryModule>(() => import('./settlement-directory.ts')),
) {
  const pending = new WeakSet<HTMLDetailsElement>();
  const render = async (details: HTMLDetailsElement) => {
    const host = details.querySelector<HTMLElement>('[data-directory-content]');
    const current = () =>
      details.isConnected && root.contains(details) && details.open && !context().locked;
    if (!host || !current() || pending.has(details)) return;
    pending.add(details);
    host.innerHTML = '<p class="panel-note" role="status">正在整理街巷去处…</p>';
    try {
      const module = await source.load();
      if (!current()) return;
      const { save, unfinished } = context();
      host.innerHTML = module.settlementDirectory(
        save,
        details.dataset.settlementDirectory === 'market',
        unfinished,
      );
    } catch {
      if (!current()) return;
      host.innerHTML = resourceFailureContent(
        'refresh-game',
        '去处说明未能加载，请联网后重新加载，再展开查看。',
        '重新加载',
        false,
      );
    } finally {
      pending.delete(details);
    }
  };
  root.addEventListener(
    'toggle',
    (event) => {
      const target = event.target as HTMLDetailsElement;
      if (target.matches?.('details[data-settlement-directory]')) void render(target);
    },
    true,
  );
}
