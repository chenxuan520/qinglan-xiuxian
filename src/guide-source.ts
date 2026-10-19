import { ModuleSource, retryModule } from './module-source.ts';
type GuideModule = typeof import('./guide.ts');

async function fetchGuide(attempt: number): Promise<GuideModule> {
  if (!attempt) return import('./guide.ts');
  return retryModule<GuideModule>('guide', 'guide', attempt);
}

// 指南按需加载，离线资源清单仍包含完整指南代码。
export class GuideSource extends ModuleSource<GuideModule> {
  constructor(fetchModule = fetchGuide) {
    super(fetchModule);
  }
}
