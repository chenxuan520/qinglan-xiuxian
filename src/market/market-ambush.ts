import {
  AMBUSH_HEIGHT,
  AMBUSH_MAX_SHOTS,
  AMBUSH_RETREAT_SECONDS,
  AMBUSH_WIDTH,
  initialAmbushSnapshot,
  validAmbushSnapshot,
  validAmbushStats,
  type AmbushOutcome,
  type AmbushSnapshot,
  type AmbushStats,
  type DuelPoint,
} from './market-ambush-data.ts';
export type {
  AmbushOutcome,
  AmbushSnapshot,
  AmbushStats,
  DuelPoint,
} from './market-ambush-data.ts';
export class MarketAmbushDuel {
  readonly width = AMBUSH_WIDTH;
  readonly height = AMBUSH_HEIGHT;
  time = 0;
  outcome: AmbushOutcome | null = null;
  player = { x: 150, y: 180, hp: 100, maxHp: 100 };
  enemy = { x: 470, y: 180, hp: 100, maxHp: 100 };
  shots: { x: number; y: number; vx: number; vy: number }[] = [];
  warning: { x: number; y: number; origin: DuelPoint; remaining: number } | null = null;
  retreatRequested = false;
  retreatProgress = 0;
  invincible = 0;
  private lunge: { from: DuelPoint; to: DuelPoint; time: number } | null = null;
  private fire = 0;
  private strike = 1;
  private stats: AmbushStats;
  constructor(stats: AmbushStats, snapshot?: AmbushSnapshot) {
    if (!validAmbushStats(stats) || (snapshot && !validAmbushSnapshot(snapshot, stats)))
      throw new Error('劫修战斗存档无效');
    const s = structuredClone(snapshot ?? initialAmbushSnapshot(stats));
    this.stats = { ...s.stats };
    this.time = s.time;
    this.outcome = s.outcome;
    this.player = s.player;
    this.enemy = s.enemy;
    this.shots = s.shots;
    this.warning = s.warning;
    this.lunge = s.lunge;
    this.fire = s.fire;
    this.strike = s.strike;
    this.retreatRequested = s.retreatRequested;
    this.retreatProgress = s.retreatProgress;
    this.invincible = s.invincible;
  }
  static restore(value: unknown, stats?: AmbushStats) {
    return validAmbushSnapshot(value, stats) ? new MarketAmbushDuel(value.stats, value) : null;
  }
  snapshot(): AmbushSnapshot {
    return structuredClone({
      version: 1,
      stats: this.stats,
      time: this.time,
      player: this.player,
      enemy: this.enemy,
      shots: this.shots,
      warning: this.warning,
      lunge: this.lunge,
      fire: this.fire,
      strike: this.strike,
      retreatRequested: this.retreatRequested,
      retreatProgress: this.retreatProgress,
      invincible: this.invincible,
      outcome: this.outcome,
    });
  }
  requestRetreat() {
    if (this.outcome) return false;
    this.retreatRequested = true;
    return true;
  }
  revive() {
    if (this.outcome !== 'defeat') return false;
    this.player.hp = this.player.maxHp;
    this.shots = [];
    this.warning = null;
    this.lunge = null;
    this.fire = 0.65;
    this.strike = 1.4;
    this.retreatRequested = false;
    this.retreatProgress = 0;
    this.invincible = 3;
    this.outcome = this.enemy.hp === 0 ? 'victory' : null;
    return true;
  }
  update(seconds: number, input: DuelPoint, active = true) {
    if (this.outcome || !active || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = Math.min(seconds, 1);
    while (remaining > 1e-9 && !this.outcome) {
      const step = Math.min(remaining, 0.05);
      this.time += step;
      this.step(step, input);
      remaining -= step;
    }
  }
  private step(dt: number, input: DuelPoint) {
    this.invincible = Math.max(0, this.invincible - dt);
    let x = Number.isFinite(input.x) ? input.x : 0;
    const y = Number.isFinite(input.y) ? input.y : 0;
    if (this.retreatRequested && Math.hypot(x, y) < 1e-6) x = -1;
    const magnitude = Math.max(1, Math.hypot(x, y));
    this.player.x = Math.max(
      28,
      Math.min(this.width - 28, this.player.x + (x / magnitude) * this.stats.speed * dt),
    );
    this.player.y = Math.max(
      28,
      Math.min(this.height - 28, this.player.y + (y / magnitude) * this.stats.speed * dt),
    );
    if (this.lunge) {
      this.lunge.time += dt;
      const t = Math.min(1, this.lunge.time / 0.3);
      this.enemy.x = Math.max(
        28,
        Math.min(this.width - 28, this.lunge.from.x + (this.lunge.to.x - this.lunge.from.x) * t),
      );
      this.enemy.y = Math.max(
        28,
        Math.min(this.height - 28, this.lunge.from.y + (this.lunge.to.y - this.lunge.from.y) * t),
      );
      if (t === 1) {
        if (
          this.invincible === 0 &&
          Math.hypot(this.player.x - this.enemy.x, this.player.y - this.enemy.y) < 65
        )
          this.player.hp = Math.max(0, this.player.hp - this.stats.enemyDamage);
        this.lunge = null;
        this.strike = 1.4;
      }
    } else if (this.warning) {
      this.warning.remaining -= dt;
      if (this.warning.remaining <= 0) {
        this.lunge = {
          from: { ...this.warning.origin },
          to: { x: this.warning.x, y: this.warning.y },
          time: 0,
        };
        this.warning = null;
      }
    } else {
      const dx = this.player.x - this.enemy.x,
        dy = this.player.y - this.enemy.y,
        distance = Math.hypot(dx, dy);
      if (distance > 115) {
        this.enemy.x += (dx / distance) * 95 * dt;
        this.enemy.y += (dy / distance) * 95 * dt;
      }
      this.strike = Math.max(0, this.strike - dt);
      if (this.strike <= 0 && distance <= 190) {
        const aimX = this.player.x - this.enemy.x,
          aimY = this.player.y - this.enemy.y,
          aimDistance = Math.hypot(aimX, aimY),
          reach = Math.min(160, aimDistance);
        this.warning = {
          x: Math.max(
            28,
            Math.min(
              this.width - 28,
              this.enemy.x + (aimDistance ? aimX / aimDistance : 1) * reach,
            ),
          ),
          y: Math.max(
            28,
            Math.min(
              this.height - 28,
              this.enemy.y + (aimDistance ? aimY / aimDistance : 0) * reach,
            ),
          ),
          origin: { x: this.enemy.x, y: this.enemy.y },
          remaining: 0.8,
        };
      }
    }
    this.fire = Math.max(0, this.fire - dt);
    if (this.fire <= 0) {
      const dx = this.enemy.x - this.player.x,
        dy = this.enemy.y - this.player.y,
        d = Math.hypot(dx, dy);
      if (d <= 300 && this.shots.length < AMBUSH_MAX_SHOTS) {
        this.shots.push({
          x: this.player.x,
          y: this.player.y,
          vx: d ? (dx / d) * 420 : 420,
          vy: d ? (dy / d) * 420 : 0,
        });
        this.fire = 0.65;
      }
    }
    this.shots = this.shots.filter((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.hypot(s.x - this.enemy.x, s.y - this.enemy.y) < 29) {
        this.enemy.hp = Math.max(0, this.enemy.hp - this.stats.damage);
        return false;
      }
      return s.x >= 0 && s.x <= this.width && s.y >= 0 && s.y <= this.height;
    });
    if (this.player.hp === 0) this.outcome = 'defeat';
    else if (this.enemy.hp === 0) this.outcome = 'victory';
    else if (
      this.retreatRequested &&
      this.player.x <= 60 &&
      Math.hypot(this.player.x - this.enemy.x, this.player.y - this.enemy.y) >= 150
    ) {
      this.retreatProgress = Math.min(AMBUSH_RETREAT_SECONDS, this.retreatProgress + dt);
      if (this.retreatProgress === AMBUSH_RETREAT_SECONDS) this.outcome = 'escaped';
    } else this.retreatProgress = 0;
  }
}
