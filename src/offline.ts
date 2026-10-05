import { assetUrl } from './asset-url.ts';

const build = typeof __QINGLAN_BUILD_ID__ === 'undefined' ? '' : __QINGLAN_BUILD_ID__;
type Progress = { count: number; total: number; bytes: number; totalBytes: number };
type Status = { ready: boolean; stored: boolean; busy: boolean; progress?: Progress };
type State = Status & { checking: boolean; error: string; notice: string; bytes?: number };
const state: State = {
  ready: false,
  stored: false,
  busy: false,
  checking: false,
  error: '',
  notice: '',
};
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let operating = false;
let cancelled = false;
let statusRevision = 0;
let notify: () => void = () => {};

function supported() {
  return !!build && window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window;
}

function update(next: Partial<State>) {
  Object.assign(state, next);
  notify();
}

async function registration(create: boolean) {
  const scope = new URL(import.meta.env.BASE_URL, location.href).href;
  const script = new URL('offline-worker.js', scope).href;
  let reg = await navigator.serviceWorker.getRegistration(scope);
  if (reg && (reg.active || reg.installing || reg.waiting)?.scriptURL !== script)
    throw new Error('other-worker');
  if (create)
    reg = await navigator.serviceWorker.register(script, { scope, updateViaCache: 'none' });
  if (!reg) return null;
  if (!reg.active) {
    await new Promise<void>((resolve, reject) => {
      const worker = reg!.installing || reg!.waiting;
      const timeout = setTimeout(() => reject(new Error('worker-timeout')), 15000);
      const changed = () => {
        if (worker?.state === 'activated') {
          clearTimeout(timeout);
          resolve();
        } else if (worker?.state === 'redundant') {
          clearTimeout(timeout);
          reject(new Error('worker-failed'));
        }
      };
      worker?.addEventListener('statechange', changed);
      changed();
    });
  }
  return reg;
}

async function request(action: 'status' | 'cache' | 'cancel' | 'clear'): Promise<Status> {
  const reg = await registration(action === 'cache');
  if (action === 'cache' && cancelled) throw new Error('cancelled');
  if (!reg?.active) {
    if (action === 'clear') {
      const scope = new URL(import.meta.env.BASE_URL, location.href);
      const prefix = `qinglan-offline:${scope.pathname}:`;
      for (const name of await caches.keys()) {
        if (name.startsWith(prefix)) await caches.delete(name);
      }
    }
    return { ready: false, stored: false, busy: false };
  }
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    // 有进度时重置超时；慢网和正常缓存都能继续，死掉的 worker 可重试。
    let timeout: ReturnType<typeof setTimeout>;
    const touch = () => {
      clearTimeout(timeout);
      timeout = setTimeout(
        () => {
          channel.port1.close();
          reject(new Error('worker-timeout'));
        },
        action === 'cache' ? 90000 : 20000,
      );
    };
    touch();
    channel.port1.onmessage = ({ data }) => {
      touch();
      if (data.progress) {
        update({ busy: true, checking: false, progress: data.progress });
        return;
      }
      clearTimeout(timeout);
      channel.port1.close();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    reg.active!.postMessage({ action, build }, [channel.port2]);
  });
}

function message(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'cancelled') return '已取消缓存，已有完整缓存仍可使用。';
  if (code === 'resource-changed')
    return '资源刚刚更新，请联网刷新页面后重新缓存。已有完整缓存仍可使用。';
  if (code === 'QuotaExceededError' || /quota/i.test(code))
    return '浏览器空间不足，缓存未完成。请释放空间后重试。';
  if (code === 'busy') return '另一个页面正在缓存，请稍后查看进度。';
  if (code === 'other-worker') return '当前页面的缓存服务无法启用，请稍后重试。';
  return '缓存未完成，请检查网络或浏览器存储权限后重试。已有完整缓存仍可使用。';
}

export function offlinePanel() {
  return `<section class="offline-resources" aria-label="离线资源缓存"><p>缓存完成后，断网重新打开也能游玩秘境与城镇。AI 对话与新故事需要联网。</p><p class="offline-status" role="status" aria-live="polite"></p><progress aria-label="离线资源缓存进度" max="100" value="0" hidden></progress><div class="offline-actions"><button class="primary-button" data-action="offline-cache">缓存所有离线资源</button><button class="secondary-button" data-action="offline-cancel" hidden>取消缓存</button><button class="secondary-button" data-action="offline-clear" disabled>清除所有缓存资源</button></div><small>资源保存在当前浏览器中；清理浏览器数据后需重新缓存。清除缓存不会删除存档，清除后可联网重新打开，加载最新版本。</small></section>`;
}

export function refreshOfflinePanel() {
  const host = document.querySelector<HTMLElement>('.offline-resources');
  if (!host) return;
  const status = host.querySelector<HTMLElement>('.offline-status')!;
  const cache = host.querySelector<HTMLButtonElement>('[data-action="offline-cache"]')!;
  const cancel = host.querySelector<HTMLButtonElement>('[data-action="offline-cancel"]')!;
  const clear = host.querySelector<HTMLButtonElement>('[data-action="offline-clear"]')!;
  const progress = host.querySelector<HTMLProgressElement>('progress')!;
  const amount = state.bytes ? `约 ${(state.bytes / 1024 / 1024).toFixed(1)} MB` : '';
  const p = state.progress;
  const percent = p ? Math.min(100, Math.floor((p.bytes / Math.max(1, p.totalBytes)) * 100)) : 0;
  const summary = document.querySelector<HTMLElement>('[data-offline-summary]');
  if (summary)
    summary.textContent = state.busy
      ? p
        ? `正在缓存 · ${percent}%`
        : '正在准备缓存…'
      : state.ready
        ? '全部资源已缓存'
        : state.stored
          ? '有资源更新'
          : '按需缓存，断网游玩';
  let text = state.ready
    ? '全部离线资源已缓存，可断网重新打开游玩。'
    : state.stored
      ? '已有旧版离线资源；请缓存当前版本以离线使用本次更新。'
      : `尚未缓存全部资源${amount ? ` · ${amount}` : ''}。`;
  if (!supported()) text = '此浏览器暂不支持离线缓存，请在支持的浏览器中打开官网。';
  else if (state.busy)
    text = p ? `正在缓存 · ${percent}% · ${p.count} / ${p.total} 项` : '正在准备缓存…';
  else if (state.checking) text = '正在检查离线资源…';
  else if (state.error) text = state.error;
  else if (state.notice) text = state.notice;
  status.textContent = text;
  cache.textContent = state.ready
    ? '全部资源已缓存'
    : state.stored
      ? '更新离线资源'
      : '缓存所有离线资源';
  cache.disabled = !supported() || state.ready || state.busy || state.checking || operating;
  cache.hidden = state.busy;
  cancel.hidden = !state.busy;
  cancel.disabled = state.checking;
  clear.hidden = false;
  clear.disabled = !supported() || state.busy || state.checking || operating;
  progress.hidden = !state.busy;
  progress.value = percent;
}

export async function checkOffline() {
  if (!supported()) return refreshOfflinePanel();
  if (operating) return refreshOfflinePanel();
  clearTimeout(refreshTimer);
  const revision = ++statusRevision;
  try {
    const result = await request('status');
    if (revision !== statusRevision) return;
    update({
      ...result,
      checking: false,
      ...(result.ready ? { error: '' } : {}),
      ...(result.stored || result.busy ? { notice: '' } : {}),
    });
    if (result.busy && !operating) refreshTimer = setTimeout(() => void checkOffline(), 1000);
  } catch {
    if (revision !== statusRevision) return;
    update({ checking: false, error: '暂时无法检查缓存，请重试。' });
  }
}

export async function openOfflinePanel() {
  refreshOfflinePanel();
  if (!supported() || operating) return;
  update({ checking: true });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const manifest = fetch(assetUrl(`offline-manifest-${build}.json`), {
    cache: 'no-store',
    signal: controller.signal,
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data?.build === build && Number.isSafeInteger(data.bytes)) update({ bytes: data.bytes });
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
  await checkOffline();
  await manifest;
}

export async function offlineAction(action: string) {
  if (!supported()) return;
  if (action === 'offline-cache') {
    if (operating || state.busy) return;
    operating = true;
    statusRevision++;
    cancelled = false;
    update({ busy: true, error: '', notice: '', progress: undefined });
    try {
      const result = await request('cache');
      update({ ...result, error: '' });
    } catch (error) {
      update({ busy: false, error: message(error) });
    } finally {
      operating = false;
      await checkOffline();
    }
  } else if (action === 'offline-cancel') {
    cancelled = true;
    statusRevision++;
    update({ checking: true });
    try {
      await request('cancel');
    } catch (error) {
      update({ error: message(error) });
    } finally {
      update({ checking: false });
      await checkOffline();
    }
  } else if (action === 'offline-clear') {
    if (operating) return;
    operating = true;
    statusRevision++;
    update({ checking: true, error: '', notice: '' });
    try {
      const result = await request('clear');
      update({
        ...result,
        error: '',
        notice: '已清除所有缓存资源，游戏存档保留。',
        progress: undefined,
      });
    } catch (error) {
      update({ error: message(error) });
    } finally {
      operating = false;
      update({ checking: false });
    }
  }
}

export function initOffline() {
  notify = refreshOfflinePanel;
  // 没有选择缓存的玩家不注册服务，也不自动获取整包资源。
  if (supported()) void checkOffline();
}
