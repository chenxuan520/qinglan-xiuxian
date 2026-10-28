import { ModuleSource, retryModule } from './module-source.ts';
import { ACHIEVEMENT_IDS } from './chronicle.ts';
import type { SaveData } from './progress.ts';
type ChronicleModule = typeof import('./chronicle-content.ts');

async function fetchChronicle(attempt: number): Promise<ChronicleModule> {
  if (!attempt) return import('./chronicle-content.ts');
  return retryModule<ChronicleModule>('chronicle-content', 'chronicle', attempt);
}

// 履历与属性明细按需载入，完整模块照常纳入离线资源清单。
export class ChronicleSource extends ModuleSource<ChronicleModule> {
  #seen: Record<string, number | null> = {};
  #epoch = 0;
  #notices: InstanceType<ChronicleModule['AchievementNotices']> | null = null;
  #fallback = false;
  #unread = false;
  constructor(fetchModule = fetchChronicle) {
    super(fetchModule);
  }
  get unread() {
    return this.#unread;
  }
  markRead() {
    this.#unread = false;
  }
  // 只由成功写档调用；读档、导入与轮回建立基线，不补弹历史成就。
  observe(save: SaveData, reset = false) {
    const next = save.chronicle.milestones;
    const ids = [...ACHIEVEMENT_IDS, 'peerless'].filter((id) => id in next && !(id in this.#seen));
    this.#seen = { ...next };
    if (reset) {
      this.#unread = false;
      this.#epoch++;
      this.#notices?.clear();
      this.#fallback = false;
      return;
    }
    if (!ids.length) return;
    this.#unread = true;
    const epoch = this.#epoch;
    void this.load()
      .then(({ AchievementNotices }) => {
        if (epoch === this.#epoch) (this.#notices ??= new AchievementNotices()).add(save, ids);
      })
      .catch(() => {
        if (epoch === this.#epoch) this.#fallback = true;
      });
  }
  flush(ready: boolean, announce: (text: string) => void) {
    if (this.#fallback && ready) {
      this.#fallback = false;
      announce('成就达成');
    }
    this.#notices?.flush(ready, announce);
  }
}
