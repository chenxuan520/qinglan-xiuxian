import { chronicleAchievements } from './chronicle-achievements.ts';
import type { SaveData } from './progress.ts';

// 沿用普通顶部提示；同一批成就合成一条，战斗和其他提示期间等待。
export class AchievementNotices {
  private pending = new Map<string, string>();
  add(save: SaveData, ids: string[]) {
    for (const achievement of chronicleAchievements(save)) {
      if (achievement.achieved && ids.includes(achievement.id))
        this.pending.set(achievement.id, achievement.title);
    }
  }
  clear() {
    this.pending.clear();
  }
  flush(ready: boolean, announce: (text: string) => void) {
    if (!this.pending.size || !ready) return;
    const titles = [...this.pending.values()];
    this.clear();
    announce(
      `仙途成就 · ${titles.slice(0, 2).join('、')}${titles.length > 2 ? `等${titles.length}项` : ''} · 仙途履历`,
    );
  }
}
