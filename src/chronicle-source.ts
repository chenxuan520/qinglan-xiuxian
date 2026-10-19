import { ModuleSource, retryModule } from './module-source.ts';
type ChronicleModule = typeof import('./chronicle-content.ts');

async function fetchChronicle(attempt: number): Promise<ChronicleModule> {
  if (!attempt) return import('./chronicle-content.ts');
  return retryModule<ChronicleModule>('chronicle-content', 'chronicle', attempt);
}

// 履历与属性明细按需载入，完整模块照常纳入离线资源清单。
export class ChronicleSource extends ModuleSource<ChronicleModule> {
  constructor(fetchModule = fetchChronicle) {
    super(fetchModule);
  }
}
