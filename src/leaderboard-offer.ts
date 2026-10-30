import type { SaveData } from './progress.ts';
import { journeyScore } from './journey-score.ts';
import { extractLeaderboardFacts, type LeaderboardBoard } from './leaderboard-contract.ts';
import { fetchLeaderboardBoard, canSubmitLeaderboardScore } from './leaderboard-client.ts';
import {
  improvesLeaderboardProfile,
  readLeaderboardProfile,
  type LeaderboardProfile,
} from './leaderboard-profile.ts';

// 一世最多核对一次；查询失败不自动循环，也不影响结算和轮回。
export class LeaderboardOffer {
  private checked: number | null = null;
  private pending: AbortController | null = null;
  private qualified: number | null = null;
  private offered: number | null = null;
  private board: LeaderboardBoard | null = null;
  private readonly enabled: () => boolean;
  private readonly read: (signal: AbortSignal) => Promise<LeaderboardBoard>;
  private readonly score: (save: SaveData) => number;
  private readonly profile: () => LeaderboardProfile | null;
  constructor(
    enabled: () => boolean,
    read: (signal: AbortSignal) => Promise<LeaderboardBoard> = (signal) =>
      fetchLeaderboardBoard(signal, { enabled }),
    score: (save: SaveData) => number = (save) => journeyScore(save).total,
    profile: () => LeaderboardProfile | null = readLeaderboardProfile,
  ) {
    this.enabled = enabled;
    this.read = read;
    this.score = score;
    this.profile = profile;
  }
  canSign(save: SaveData) {
    return (
      this.enabled() &&
      !save.factsTampered &&
      this.offered === save.medicine.recipeSeed &&
      !!this.board &&
      !!extractLeaderboardFacts(save) &&
      canSubmitLeaderboardScore(this.board, this.score(save)) &&
      improvesLeaderboardProfile(this.board, this.score(save), this.profile())
    );
  }
  complete() {
    this.offered = this.qualified = null;
  }
  clear() {
    this.pending?.abort();
    this.pending = null;
    this.checked = this.qualified = this.offered = null;
    this.board = null;
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
      this.offered = key;
      this.qualified = null;
      if (this.canSign(save)) notify();
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
          canSubmitLeaderboardScore(board, score) &&
          improvesLeaderboardProfile(board, score, this.profile())
        ) {
          this.board = board;
          this.qualified = key;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (this.pending === request) this.pending = null;
      });
  }
}
