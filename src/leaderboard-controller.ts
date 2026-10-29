import {
  LEADERBOARD_NAME_LIMIT,
  normalizeLeaderboardName,
  type LeaderboardBoard,
  type LeaderboardEntry,
  type LeaderboardFacts,
} from './leaderboard-contract.ts';
import {
  LeaderboardClient,
  canSubmitLeaderboardScore,
  leaderboardErrorMessage,
} from './leaderboard-client.ts';

export interface LeaderboardPanelOptions {
  isCurrent(): boolean;
  eligibleFacts(): LeaderboardFacts | null;
  score?(): number;
  enabled?(): boolean;
  client?: LeaderboardClient;
  onClose?(): void;
}

// 只管理父面板中的内容；关闭、轮回和存档替换仍由正常入口负责。
export class LeaderboardPanel {
  private readonly host: HTMLElement;
  private readonly options: LeaderboardPanelOptions;
  private readonly client: LeaderboardClient;
  private readonly listeners = new AbortController();
  private request: AbortController | null = null;
  private board: LeaderboardBoard | null = null;
  private busy = false;
  private closed = false;

  constructor(host: HTMLElement, options: LeaderboardPanelOptions) {
    this.host = host;
    this.options = options;
    this.client = options.client ?? new LeaderboardClient({ enabled: options.enabled });
    host.innerHTML = `<div class="leaderboard-panel"><div class="leaderboard-tools"><p class="panel-note">按此世道果排列，同名只保留最高分。</p><button type="button" class="secondary-button" data-leaderboard-refresh>刷新</button></div><p class="leaderboard-status panel-note" role="status" aria-live="polite" data-leaderboard-status></p><section class="leaderboard-sign" data-leaderboard-sign hidden><h3>留名万魂幡</h3><p class="panel-note" data-leaderboard-score></p><form data-leaderboard-form><label>姓名<input name="leaderboard-name" autocomplete="off" maxlength="${LEADERBOARD_NAME_LIMIT * 2}" aria-label="留名姓名" required data-leaderboard-name></label><p class="panel-note">最多 ${LEADERBOARD_NAME_LIMIT} 字；已有人使用的名字需另取。</p><button class="primary-button" type="submit" data-leaderboard-submit>署名入榜</button></form></section><p class="panel-note" data-leaderboard-eligibility></p><div data-leaderboard-list aria-label="万魂幡前一百名"></div><button type="button" class="secondary-button leaderboard-return" data-leaderboard-close>返回</button></div>`;
    host.addEventListener(
      'submit',
      (event) => {
        const form = this.element<HTMLFormElement>('[data-leaderboard-form]');
        if (event.target !== form || !this.current()) return;
        event.preventDefault();
        void this.submit();
      },
      { signal: this.listeners.signal },
    );
    host.addEventListener(
      'click',
      (event) => {
        const button = (event.target as Element | null)?.closest('button');
        if (!button || !host.contains(button) || !this.current()) return;
        if (button.hasAttribute('data-leaderboard-refresh')) void this.load();
        if (button.hasAttribute('data-leaderboard-close')) {
          this.destroy();
          options.onClose?.();
        }
      },
      { signal: this.listeners.signal },
    );
  }
  destroy() {
    this.closed = true;
    this.request?.abort();
    this.request = null;
    this.listeners.abort();
  }
  private current(request?: AbortController) {
    return (
      !this.closed &&
      this.options.enabled?.() !== false &&
      this.host.isConnected &&
      this.options.isCurrent() &&
      (!request || (this.request === request && !request.signal.aborted))
    );
  }
  private element<T extends HTMLElement>(selector: string) {
    return this.host.querySelector<T>(selector)!;
  }
  private status(message: string) {
    this.element('[data-leaderboard-status]').textContent = message;
  }
  private setBusy(busy: boolean) {
    this.busy = busy;
    this.element<HTMLButtonElement>('[data-leaderboard-refresh]').disabled = busy;
    this.element<HTMLButtonElement>('[data-leaderboard-submit]').disabled = busy;
    this.element<HTMLInputElement>('[data-leaderboard-name]').disabled = busy;
    this.element('[data-leaderboard-list]').setAttribute('aria-busy', String(busy));
  }
  private canSign() {
    return (
      !!this.board &&
      !!this.options.eligibleFacts() &&
      (!this.options.score || canSubmitLeaderboardScore(this.board, this.options.score()))
    );
  }
  private eligibility() {
    const eligible = this.canSign();
    this.element('[data-leaderboard-sign]').hidden = !eligible;
    const score = this.options.score?.();
    this.element('[data-leaderboard-score]').textContent =
      score === undefined ? '' : `此世道果 ${score}`;
    this.element('[data-leaderboard-eligibility]').textContent =
      !this.board || eligible
        ? ''
        : this.options.eligibleFacts()
          ? `当前入榜需高于 ${this.board.minimumScore} 道果。`
          : '成仙或此世落幕后，可选择署名入榜。';
  }
  private list(board: LeaderboardBoard) {
    this.board = board;
    const host = this.element('[data-leaderboard-list]');
    host.replaceChildren();
    if (!board.entries.length) {
      const empty = document.createElement('p');
      empty.className = 'leaderboard-empty panel-note';
      empty.textContent = '尚无人留名。';
      host.append(empty);
    } else {
      const list = document.createElement('ol');
      list.className = 'leaderboard-entries';
      board.entries.forEach((entry, index) => list.append(this.row(entry, index)));
      host.append(list);
    }
    this.eligibility();
  }
  private row(entry: LeaderboardEntry, index: number) {
    const row = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1);
    const name = document.createElement('strong');
    name.className = 'leaderboard-name';
    name.textContent = entry.name;
    name.title = entry.name;
    const score = document.createElement('strong');
    score.className = 'leaderboard-score';
    score.textContent = String(entry.score);
    score.setAttribute('aria-label', `${entry.score} 道果`);
    const meta = document.createElement('div');
    meta.className = 'leaderboard-meta';
    for (const label of [
      entry.grade,
      entry.title,
      entry.lifeMode === 'extreme' ? '一命问道' : '普通修行',
    ]) {
      const part = document.createElement('span');
      part.textContent = label;
      meta.append(part);
    }
    row.append(rank, name, score, meta);
    return row;
  }
  async load() {
    if (this.busy || !this.current()) return;
    if (!this.client.available()) {
      this.status('排行榜仅在官网开放。');
      this.element('[data-leaderboard-sign]').hidden = true;
      return;
    }
    const request = new AbortController();
    this.request = request;
    this.setBusy(true);
    this.status('正在读取榜单…');
    try {
      const board = await this.client.read(request.signal);
      if (!this.current(request)) return;
      this.list(board);
      this.status('');
    } catch (error) {
      if (this.current(request)) this.status(leaderboardErrorMessage(error));
    } finally {
      if (this.current(request)) this.setBusy(false);
      if (this.request === request) this.request = null;
    }
  }
  private async submit() {
    if (this.busy || !this.current() || !this.canSign()) return;
    const input = this.element<HTMLInputElement>('[data-leaderboard-name]');
    const name = normalizeLeaderboardName(input.value);
    if (!name) {
      this.status(`姓名需为 1～${LEADERBOARD_NAME_LIMIT} 字，请检查后重试。`);
      return;
    }
    const facts = this.options.eligibleFacts();
    if (!facts) return;
    const snapshot = structuredClone(facts);
    const identity = JSON.stringify(snapshot);
    const request = new AbortController();
    this.request = request;
    this.setBusy(true);
    this.status('正在留名…');
    const sameLife = () =>
      this.current(request) && JSON.stringify(this.options.eligibleFacts()) === identity;
    try {
      const result = await this.client.submit(name.name, snapshot, request.signal);
      if (!sameLife()) return;
      input.value = name.name;
      const message = result.status === 'saved' ? '已留名万魂幡。' : '已保留这个名字的最高道果。';
      this.status(message);
      try {
        const board = await this.client.read(request.signal);
        if (!sameLife()) return;
        this.list(board);
      } catch {
        if (sameLife()) this.status(`${message} 榜单暂未刷新，可稍后手动刷新。`);
      }
    } catch (error) {
      if (sameLife()) this.status(leaderboardErrorMessage(error, true));
    } finally {
      if (sameLife()) {
        this.setBusy(false);
        this.eligibility();
      }
      if (this.request === request) this.request = null;
    }
  }
}
