import { ModuleSource, retryModule } from './module-source.ts';
type TownModule = typeof import('./town-scene.ts');

export class TownSource extends ModuleSource<TownModule> {
  constructor() {
    super((attempt) =>
      attempt ? retryModule<TownModule>('town-scene', 'town', attempt) : import('./town-scene.ts'),
    );
  }
}
