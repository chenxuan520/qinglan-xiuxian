type ChronicleModule = typeof import('./chronicle-content.ts');

async function fetchChronicle(attempt: number): Promise<ChronicleModule> {
  if (!attempt) return import('./chronicle-content.ts');
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let path = 'src/chronicle-content.ts';
  if (!import.meta.env.DEV) {
    // 使用当前构建的清单，不能在重试时混入新部署的履历模块。
    const response = await fetch(new URL(`offline-manifest-${__QINGLAN_BUILD_ID__}.json`, base));
    if (!response.ok) throw new Error('chronicle-manifest-unavailable');
    const manifest = await response.json();
    if (manifest.build !== __QINGLAN_BUILD_ID__ || !Array.isArray(manifest.resources))
      throw new Error('chronicle-manifest-invalid');
    const entry = manifest.resources.find(
      (resource: { path?: unknown }) =>
        typeof resource.path === 'string' &&
        /^assets\/chronicle-content-[\w-]+\.js$/.test(resource.path),
    );
    if (!entry) throw new Error('chronicle-module-missing');
    path = entry.path;
  }
  const url = new URL(path, base);
  // 浏览器会记住失败的 import；片段生成新模块身份，但网络/离线缓存仍请求原文件。
  url.hash = `chronicle-retry-${attempt}`;
  return import(/* @vite-ignore */ url.href);
}

// 履历与属性明细按需载入，完整模块照常纳入离线资源清单。
export class ChronicleSource {
  current: ChronicleModule | null = null;
  private pending: Promise<ChronicleModule> | null = null;
  private fetchModule: (attempt: number) => Promise<ChronicleModule>;
  private attempts = 0;
  constructor(fetchModule = fetchChronicle) {
    this.fetchModule = fetchModule;
  }
  load() {
    if (this.current) return Promise.resolve(this.current);
    if (!this.pending)
      this.pending = Promise.resolve()
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
