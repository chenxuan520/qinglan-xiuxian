type GuideModule = typeof import('./guide.ts');

async function fetchGuide(attempt: number): Promise<GuideModule> {
  if (!attempt) return import('./guide.ts');
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let path = 'src/guide.ts';
  if (!import.meta.env.DEV) {
    // 使用当前构建的清单，不能在重试时混入新部署的指南模块。
    const response = await fetch(new URL(`offline-manifest-${__QINGLAN_BUILD_ID__}.json`, base));
    if (!response.ok) throw new Error('guide-manifest-unavailable');
    const manifest = await response.json();
    if (manifest.build !== __QINGLAN_BUILD_ID__ || !Array.isArray(manifest.resources))
      throw new Error('guide-manifest-invalid');
    const entry = manifest.resources.find(
      (resource: { path?: unknown }) =>
        typeof resource.path === 'string' && /^assets\/guide-[\w-]+\.js$/.test(resource.path),
    );
    if (!entry) throw new Error('guide-module-missing');
    path = entry.path;
  }
  const url = new URL(path, base);
  // 浏览器会记住失败的 import；片段生成新模块身份，但网络/离线缓存仍请求原文件。
  url.hash = `guide-retry-${attempt}`;
  return import(/* @vite-ignore */ url.href);
}

// 指南按需加载，离线资源清单仍包含完整指南代码。
export class GuideSource {
  current: GuideModule | null = null;
  private pending: Promise<GuideModule> | null = null;
  private fetchModule: (attempt: number) => Promise<GuideModule>;
  private attempts = 0;
  constructor(fetchModule = fetchGuide) {
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
