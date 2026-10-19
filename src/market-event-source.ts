import { ModuleSource, retryModule } from './module-source.ts';
type MarketEventModule = typeof import('./market-event-ui.ts');

async function fetchMarketEvent(attempt: number): Promise<MarketEventModule> {
  if (!attempt) return import('./market-event-ui.ts');
  return retryModule<MarketEventModule>('market-event-ui', 'market', attempt);
}

export class MarketEventSource extends ModuleSource<MarketEventModule> {
  constructor(fetchModule = fetchMarketEvent) {
    super(fetchModule);
  }
}
