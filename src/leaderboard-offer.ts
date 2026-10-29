import type { SaveData } from './progress.ts';
import { journeyScore } from './journey-score.ts';
import { extractLeaderboardFacts, type LeaderboardBoard } from './leaderboard-contract.ts';
import { fetchLeaderboardBoard, canSubmitLeaderboardScore } from './leaderboard-client.ts';

// 一世最多核对一次；查询失败不自动循环，也不影响结算和轮回。
export class LeaderboardOffer {
  private checked: number | null = null;
  private pending: AbortController | null = null;
  private qualified: number | null = null;
  private readonly enabled: () => boolean;
  private readonly read: (signal: AbortSignal) => Promise<LeaderboardBoard>;
  private readonly score: (save: SaveData) => number;
  constructor(
    enabled: () => boolean,
    read: (signal: AbortSignal) => Promise<LeaderboardBoard> = (signal) =>
      fetchLeaderboardBoard(signal, { enabled }),
    score: (save: SaveData) => number = (save) => journeyScore(save).total,
  ) {
    this.enabled = enabled;
    this.read = read;
    this.score = score;
  }
  clear() {
    this.pending?.abort();
    this.pending = null;
    this.checked = this.qualified = null;
  }
  flush(save: SaveData, ready: boolean, notify: () => void) {
    const key = save.medicine.recipeSeed;
    if (!this.enabled()) {
      this.clear();
      return;
    }
    if (this.checked !== null && this.checked !== key) this.clear();
    if (!ready || (this.checked === key && this.qualified !== key)) return;
    if (!extractLeaderboardFacts(save)) return;
    if (this.qualified === key) {
      this.qualified = null;
      notify();
    }
    if (this.checked === key) return;
    this.checked = key;
    const request = new AbortController();
    this.pending = request;
    const score = this.score(save);
    void this.read(request.signal)
      .then((board) => {
        if (
          this.pending === request &&
          !request.signal.aborted &&
          this.enabled() &&
          this.checked === key &&
          canSubmitLeaderboardScore(board, score)
        )
          this.qualified = key;
      })
      .catch(() => {})
      .finally(() => {
        if (this.pending === request) this.pending = null;
      });
  }
}
