import type { SaveData } from './progress.ts';
import { journeyScore } from './journey-score.ts';
import { extractLeaderboardFacts, type LeaderboardBoard } from './leaderboard-contract.ts';
import { fetchLeaderboardBoard, canSubmitLeaderboardScore } from './leaderboard-client.ts';
import {
  improvesLeaderboardProfile,
  readLeaderboardProfile,
  type LeaderboardProfile,
} from './leaderboard-profile.ts';

// 正常一世核对一次；失败后仅在可提示时退避重试一次，不影响结算和轮回。
export class LeaderboardOffer {
  private checked: number | null = null;
  private pending: AbortController | null = null;
  private attempts = 0;
  private retryAt: number | null = null;
  private unavailable: number | null = null;
  private qualified: number | null = null;
  private offered: number | null = null;
  private board: LeaderboardBoard | null = null;
  private readonly enabled: () => boolean;
  private readonly read: (signal: AbortSignal) => Promise<LeaderboardBoard>;
  private readonly score: (save: SaveData) => number;
  private readonly profile: () => LeaderboardProfile | null;
  private readonly now: () => number;
  private readonly testing: () => boolean;
  constructor(
    enabled: () => boolean,
    read: (signal: AbortSignal) => Promise<LeaderboardBoard> = (signal) =>
      fetchLeaderboardBoard(signal, { enabled }),
    score: (save: SaveData) => number = (save) => journeyScore(save).total,
    profile: () => LeaderboardProfile | null = readLeaderboardProfile,
    now: () => number = Date.now,
    testing: () => boolean = () => false,
  ) {
    this.enabled = enabled;
    this.read = read;
    this.score = score;
    this.profile = profile;
    this.now = now;
    this.testing = testing;
  }
  canSign(save: SaveData) {
    return (
      this.enabled() &&
      (!save.factsTampered || this.testing()) &&
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
    this.attempts = 0;
    this.retryAt = null;
    this.unavailable = null;
    this.board = null;
  }
  flush(save: SaveData, ready: boolean, notify: () => void, failed: () => void = () => {}) {
    const key = save.medicine.recipeSeed;
    if (!this.enabled()) {
      this.clear();
      return;
    }
    if (this.checked !== null && this.checked !== key) this.clear();
    if (!ready || (save.factsTampered && !this.testing())) return;
    if (!extractLeaderboardFacts(save)) return;
    if (this.unavailable === key) {
      this.unavailable = null;
      failed();
    }
    if (this.qualified === key) {
      this.offered = key;
      this.qualified = null;
      if (this.canSign(save)) notify();
    }
    if (this.checked === key && (this.retryAt === null || this.now() < this.retryAt)) return;
    this.checked = key;
    this.retryAt = null;
    this.attempts++;
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
      .catch(() => {
        if (
          this.pending === request &&
          !request.signal.aborted &&
          this.enabled() &&
          this.checked === key &&
          this.attempts < 2
        )
          this.retryAt = this.now() + 1500;
        else if (this.pending === request && !request.signal.aborted && this.checked === key)
          this.unavailable = key;
      })
      .finally(() => {
        if (this.pending === request) this.pending = null;
      });
  }
}
