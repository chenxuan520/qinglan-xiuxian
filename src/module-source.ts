import { resourceFailed } from './update-check.ts';

// 同一加载共享请求；失败后保留重试资格，并通知页面核验是否已有新版。
export class ModuleSource<T> {
  current: T | null = null;
  private pending: Promise<T> | null = null;
  private attempts = 0;
  private fetchModule: (attempt: number) => Promise<T>;
  constructor(fetchModule: (attempt: number) => Promise<T>) {
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
          resourceFailed(true);
          throw error;
        },
      );
    return this.pending;
  }
}

// 失败后仍只重试当前构建，避免混用新部署模块；片段绕过浏览器的失败模块缓存。
export async function retryModule<T>(name: string, prefix: string, attempt: number): Promise<T> {
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let path = `src/${name}.ts`;
  if (!import.meta.env.DEV) {
    const response = await fetch(new URL(`offline-manifest-${__QINGLAN_BUILD_ID__}.json`, base));
    if (!response.ok) throw Error(`${prefix}-manifest-unavailable`);
    const manifest = await response.json();
    if (manifest.build !== __QINGLAN_BUILD_ID__ || !Array.isArray(manifest.resources))
      throw Error(`${prefix}-manifest-invalid`);
    const entry = manifest.resources.find(
      (resource: { path?: unknown }) =>
        typeof resource.path === 'string' &&
        new RegExp(`^assets/${name}-[\\w-]+\\.js$`).test(resource.path),
    );
    if (!entry) throw Error(`${prefix}-module-missing`);
    path = entry.path;
  }
  const url = new URL(path, base);
  url.hash = `${prefix}-retry-${attempt}`;
  return import(/* @vite-ignore */ url.href);
}
