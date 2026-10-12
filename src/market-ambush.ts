export type AmbushOutcome = 'victory' | 'defeat' | 'escaped';
export interface DuelPoint {
  x: number;
  y: number;
}
export class MarketAmbushDuel {
  readonly width = 640;
  readonly height = 360;
  time = 0;
  outcome: AmbushOutcome | null = null;
  player = { x: 150, y: 180, hp: 100, maxHp: 100 };
  enemy = { x: 470, y: 180, hp: 100, maxHp: 100 };
  shots: { x: number; y: number; vx: number; vy: number }[] = [];
  warning: { x: number; y: number; origin: DuelPoint; remaining: number } | null = null;
  private lunge: { from: DuelPoint; to: DuelPoint; time: number } | null = null;
  private fire = 0;
  private strike = 1;
  private stats: {
    hp: number;
    damage: number;
    enemyHp: number;
    enemyDamage: number;
    speed: number;
  };
  constructor(stats: {
    hp: number;
    damage: number;
    enemyHp: number;
    enemyDamage: number;
    speed: number;
  }) {
    this.stats = stats;
    this.player.hp = this.player.maxHp = stats.hp;
    this.enemy.hp = this.enemy.maxHp = stats.enemyHp;
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
    const x = Number.isFinite(input.x) ? input.x : 0,
      y = Number.isFinite(input.y) ? input.y : 0;
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
      this.enemy.x = this.lunge.from.x + (this.lunge.to.x - this.lunge.from.x) * t;
      this.enemy.y = this.lunge.from.y + (this.lunge.to.y - this.lunge.from.y) * t;
      if (t === 1) {
        if (Math.hypot(this.player.x - this.enemy.x, this.player.y - this.enemy.y) < 65)
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
      this.strike -= dt;
      if (this.strike <= 0 && distance <= 190) {
        const reach = Math.min(160, distance);
        this.warning = {
          x: this.enemy.x + (distance ? dx / distance : 1) * reach,
          y: this.enemy.y + (distance ? dy / distance : 0) * reach,
          origin: { x: this.enemy.x, y: this.enemy.y },
          remaining: 0.8,
        };
      }
    }
    this.fire -= dt;
    if (this.fire <= 0) {
      const dx = this.enemy.x - this.player.x,
        dy = this.enemy.y - this.player.y,
        d = Math.hypot(dx, dy);
      if (d <= 300) {
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
    if (this.enemy.hp === 0) this.outcome = 'victory';
    else if (this.player.hp === 0) this.outcome = 'defeat';
    else if (this.time >= 15) this.outcome = 'escaped';
  }
}
