type MarketEventModule = typeof import('./market-event-ui.ts');

async function fetchMarketEvent(attempt: number): Promise<MarketEventModule> {
  if (!attempt) return import('./market-event-ui.ts');
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let path = 'src/market-event-ui.ts';
  if (!import.meta.env.DEV) {
    const response = await fetch(new URL(`offline-manifest-${__QINGLAN_BUILD_ID__}.json`, base));
    if (!response.ok) throw new Error('market-manifest-unavailable');
    const manifest = await response.json();
    if (manifest.build !== __QINGLAN_BUILD_ID__ || !Array.isArray(manifest.resources))
      throw new Error('market-manifest-invalid');
    const entry = manifest.resources.find(
      (resource: { path?: unknown }) =>
        typeof resource.path === 'string' &&
        /^assets\/market-event-ui-[\w-]+\.js$/.test(resource.path),
    );
    if (!entry) throw new Error('market-module-missing');
    path = entry.path;
  }
  // 重试同一构建；片段绕过浏览器失败模块缓存，不改变网络和离线资源地址。
  const url = new URL(path, base);
  url.hash = `market-retry-${attempt}`;
  return import(/* @vite-ignore */ url.href);
}

export class MarketEventSource {
  current: MarketEventModule | null = null;
  private pending: Promise<MarketEventModule> | null = null;
  private attempts = 0;
  private fetchModule: (attempt: number) => Promise<MarketEventModule>;
  constructor(fetchModule = fetchMarketEvent) {
    this.fetchModule = fetchModule;
  }
  load() {
    if (this.current) return Promise.resolve(this.current);
    this.pending ??= Promise.resolve()
      .then(() => this.fetchModule(this.attempts++))
      .then(
        (module) => {
          this.current = module;
          this.pending = null;
          return module;
        },
        (error) => {
          this.pending = null;
          throw error;
        },
      );
    return this.pending;
  }
}
