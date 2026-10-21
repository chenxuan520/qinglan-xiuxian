import { FINAL_TRIAL_STAGE, MAX_FORGE_LEVEL, TREASURES } from './data.ts';
import { CURIOS } from './curio-info.ts';
import { acquiredCurio, isCurio } from './curio-data.ts';
import { MEDICINES } from './medicine-data.ts';
import { debugAccess } from './debug-access.ts';
import {
  DEBUG_REALMS,
  debugCultivationRemaining,
  debugGrant,
  debugQuantityLimit,
} from './debug-resources.ts';
import type { DebugResourceKind } from './debug-resources.ts';
import { realmInfo, type SaveData } from './progress.ts';

export interface DebugHost {
  modal: HTMLElement;
  endpoint: string;
  getSave(): SaveData;
  canOpen(): boolean;
  active(): boolean;
  blocked(): string;
  show(body: string): void;
  commit(next: SaveData): boolean;
  toast(message: string): void;
}
const accessMessage = (result: string) =>
  result === 'disabled' ? '服务端当前未开放调试。' : '暂时无法确认调试权限，请联网后重试。';

export async function openDebugPanel(host: DebugHost, current: () => boolean) {
  const allowed = await debugAccess(host.endpoint);
  if (!current()) return;
  if (allowed !== 'enabled') {
    host.toast(accessMessage(allowed));
    return;
  }
  host.show(
    `<div id="debug-tools"><p class="panel-note">物资直接保存到当前存档，退出面板后保留。法宝收入收藏后自行选择本命，丹药收入丹囊后自行服用；奇物持有即生效。发放成功后关闭本机匿名统计。</p><form class="auction-seller"><fieldset style="border:0;padding:0;min-width:0"><label>发放类别<select name="kind" aria-label="发放类别">${[
      ['stones', '灵石'],
      ['iron', '玄铁'],
      ['artifact', '法宝'],
      ['medicine', '丹药'],
      ['curio', '奇物'],
      ['cultivation', '修为'],
      ['realm', '境界'],
    ]
      .map(([id, name]) => `<option value="${id}">${name}</option>`)
      .join(
        '',
      )}</select></label><div id="debug-fields"></div><p id="debug-stock" class="panel-note"></p><button class="primary-button" type="submit">发放到当前存档</button></fieldset></form><p id="debug-status" class="panel-note" role="status"></p></div>`,
  );
  const root = host.modal.querySelector<HTMLElement>('#debug-tools')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const fieldset = root.querySelector<HTMLFieldSetElement>('fieldset')!;
  const kind = form.elements.namedItem('kind') as HTMLSelectElement;
  const fields = root.querySelector<HTMLElement>('#debug-fields')!;
  const status = root.querySelector<HTMLElement>('#debug-status')!;
  const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  let busy = false;
  const active = () => root.isConnected && host.active();
  const stock = () => {
    const s = host.getSave();
    const selection = form.elements.namedItem('id') as HTMLSelectElement | null;
    const id = selection?.value ?? '';
    if (kind.value === 'cultivation' || kind.value === 'realm') {
      const remaining = debugCultivationRemaining(s);
      const target = DEBUG_REALMS.find((r) => r.id === id);
      root.querySelector('#debug-stock')!.textContent =
        `当前${realmInfo(s.cultivation, s.completed.includes(FINAL_TRIAL_STAGE)).name} · 永久修为 ${s.cultivation.toLocaleString('zh-CN')} · 最多还能增加 ${remaining.toLocaleString('zh-CN')} 点，最高渡劫。`;
      submit.disabled =
        !remaining || (kind.value === 'realm' && (!target || target.cultivation <= s.cultivation));
      if (!busy)
        submit.textContent = !remaining
          ? '已达调试上限'
          : submit.disabled
            ? '已达此境界'
            : '发放到当前存档';
      if (selection)
        for (const option of selection.options)
          option.disabled =
            !remaining ||
            (DEBUG_REALMS.find((r) => r.id === option.value)?.cultivation ?? 0) <= s.cultivation;
      const quantity = form.elements.namedItem('quantity') as HTMLInputElement | null;
      if (quantity) quantity.max = String(remaining);
      return;
    }
    const amount =
      kind.value === 'stones'
        ? s.stones
        : kind.value === 'iron'
          ? s.iron
          : kind.value === 'medicine'
            ? s.medicine.bag[id] || 0
            : kind.value === 'curio'
              ? s.curios.bag[id as keyof typeof s.curios.bag] || 0
              : s.artifacts.includes(id)
                ? s.forge[id] || 0
                : null;
    root.querySelector('#debug-stock')!.textContent =
      kind.value === 'artifact'
        ? amount === null
          ? '尚未收藏'
          : `已收藏 · 当前炼器${amount}阶；发放不会降低已有阶数。`
        : `当前持有 ${amount?.toLocaleString('zh-CN')}`;
    const acquired = kind.value === 'curio' && isCurio(id) && acquiredCurio(s, id);
    submit.disabled = kind.value === 'curio' && (!isCurio(id) || acquired);
    if (!busy) submit.textContent = acquired ? '本世已获得' : '发放到当前存档';
    if (kind.value === 'curio' && selection)
      for (const option of selection.options)
        option.disabled = isCurio(option.value) && acquiredCurio(s, option.value);
  };
  const renderFields = () => {
    status.textContent = '';
    const type = kind.value as DebugResourceKind;
    const items =
      type === 'artifact'
        ? TREASURES
        : type === 'medicine'
          ? MEDICINES
          : type === 'curio'
            ? CURIOS.filter((c) => !acquiredCurio(host.getSave(), c.id))
            : null;
    submit.disabled = items?.length === 0;
    fields.innerHTML = `${type === 'realm' ? `<label>选择境界<select name="id" aria-label="选择境界">${DEBUG_REALMS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>` : ''}${items ? `<label>选择物品<select name="id" aria-label="选择物品">${items.map((item) => `<option value="${item.id}">${item.name}</option>`).join('') || '<option value="">本世奇物均已结缘</option>'}</select></label>` : ''}${type === 'artifact' ? `<label>炼器阶数<input type="number" name="forge" aria-label="炼器阶数" min="0" max="${MAX_FORGE_LEVEL}" step="1" value="0"></label>` : type === 'realm' ? '<p class="panel-note">补足到所选境界的起点，不改变年岁、本命和通关记录。</p>' : type === 'curio' ? '<p class="panel-note">每件奇物本世唯一，每次发放一件。</p>' : `<label>${type === 'cultivation' ? '修为点数' : '数量'}<input type="number" name="quantity" aria-label="发放数量" min="1" max="${debugQuantityLimit(type)}" step="1" value="${type === 'cultivation' ? Math.min(1000, debugCultivationRemaining(host.getSave())) : type === 'stones' || type === 'iron' ? 1000 : 1}"></label>`}`;
    if (type === 'realm') {
      const selection = form.elements.namedItem('id') as HTMLSelectElement;
      selection.value =
        DEBUG_REALMS.find((r) => r.cultivation > host.getSave().cultivation)?.id ?? '24';
    }
    fields.querySelector('select')?.addEventListener('change', () => {
      status.textContent = '';
      stock();
    });
    stock();
  };
  kind.onchange = renderFields;
  renderFields();
  const blocked = host.blocked();
  if (blocked) {
    fieldset.disabled = true;
    status.textContent = blocked;
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    if (busy || submit.disabled || !active()) return;
    const blocked = host.blocked();
    if (blocked) {
      status.textContent = blocked;
      return;
    }
    const input = new FormData(form);
    const grant = {
      kind: String(input.get('kind')),
      id: String(input.get('id') ?? ''),
      quantity: kind.value === 'curio' ? 1 : Number(input.get('quantity')),
      forge: Number(input.get('forge')),
    };
    busy = true;
    fieldset.disabled = true;
    submit.textContent = '正在核验…';
    status.textContent = '';
    void (async () => {
      try {
        const allowed = await debugAccess(host.endpoint);
        if (!active()) return;
        if (allowed !== 'enabled') {
          status.textContent = `${accessMessage(allowed)} 未发放物资。`;
          return;
        }
        const blocked = host.blocked();
        if (blocked) {
          status.textContent = blocked;
          return;
        }
        const result = debugGrant(host.getSave(), grant);
        if ('error' in result) {
          status.textContent = result.error!;
          return;
        }
        if (!host.commit(result.next)) {
          if (active()) status.textContent = '保存未成功，本次未发放，请重试。';
          return;
        }
        if (!active()) return;
        status.textContent = `${result.message} · 已保存`;
        stock();
      } catch {
        if (active()) status.textContent = '本次未能发放，请重试。';
      } finally {
        busy = false;
        if (active()) {
          fieldset.disabled = !!host.blocked();
          stock();
        }
      }
    })();
  };
}
