import { evolutionPassives, treasure, type WeaponKind } from './data.ts';
import { enemyCombatStats } from './enemy-stats.ts';
import { Game } from './game.ts';
import type { BossAttack, Enemy, Point } from './game-types.ts';
import { freshSave } from './progress.ts';

export type TrialForm = 'one' | 'six' | 'evolved';
export type TrialFormation = 'scattered' | 'surround' | 'single';

function trialRandom() {
  let seed = 19375;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// The ordinary battle engine still casts, moves, collides and applies damage.
// Only the exhibition's population, rewards and fatal consequence differ.
class TrialGame extends Game {
  private placingTarget = false;

  override spawnEnemy(...args: Parameters<Game['spawnEnemy']>): Enemy {
    const enemy = super.spawnEnemy(...args);
    if (!this.placingTarget) this.enemies.pop();
    return enemy;
  }

  addTarget(type: number, at: Point, boss = false, stationary = false) {
    this.placingTarget = true;
    const enemy = this.spawnEnemy(type, false, boss, at, 0);
    this.placingTarget = false;
    const stats = enemyCombatStats(0, 0, 0, type, false, boss);
    enemy.hp = enemy.maxHp = stats.hp;
    enemy.damage = stats.damage;
    // Guardians use normal hit/death handling without dropping rewards.
    enemy.cacheGuardian = true;
    if (stationary) enemy.speed = 0;
    if (boss) enemy.cooldown = enemy.pursuitCooldown = Number.MAX_SAFE_INTEGER;
    return enemy;
  }

  override hitEnemy(
    enemy: Enemy,
    damage: number,
    crit = false,
    source = 'other',
    attack?: BossAttack,
  ) {
    const wasAlive = !enemy.dead;
    super.hitEnemy(enemy, damage, crit, source, attack);
    if (wasAlive && enemy.dead) {
      this.kills++;
      if (this.player.hp > 0)
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.killHeal);
    }
  }

  override hurtPlayer(damage: number, burn = false, poison = false) {
    super.hurtPlayer(damage, burn, poison);
    // Retain ordinary hurt/retaliation/invulnerability. A fatal exhibition hit
    // replenishes health instead of entering the real death/revival flow.
    if (this.player.hp <= 0) this.player.hp = this.player.maxHp;
  }
}

export class TreasureTrial {
  readonly weapon: WeaponKind;
  game!: Game;
  form: TrialForm;
  formation: TrialFormation;
  private viewport = { width: 1440, height: 900 };
  private targets: { enemy: Enemy; slot: number; respawnAt: number }[] = [];

  constructor(
    weapon: WeaponKind,
    form: TrialForm = 'one',
    formation: TrialFormation = 'scattered',
  ) {
    this.weapon = weapon;
    this.form = form;
    this.formation = formation;
    this.reset();
  }

  get recipe() {
    const item = treasure(this.weapon);
    return evolutionPassives(item, item.school)[0];
  }

  reset(form = this.form, formation = this.formation) {
    this.form = form;
    this.formation = formation;
    const random = trialRandom();
    const save = freshSave('none', [], 'dual', random);
    save.starter = this.weapon;
    save.artifacts = [this.weapon];
    const game = new TrialGame(save, 0, 0, random);
    this.game = game;
    game.viewport = { ...this.viewport };
    game.bossSpawned = true;
    game.nextElite = Number.MAX_SAFE_INTEGER;
    game.weapons[0].level = form === 'one' ? 1 : 6;
    game.level = form === 'one' ? 1 : 6;
    if (form === 'evolved') {
      game.state = 'upgrade';
      game.choices = [{ type: 'passive', id: this.recipe, level: 5 }];
      game.choose(0);
      game.state = 'upgrade';
      game.choices = [{ type: 'evolve', id: this.weapon, level: 7 }];
      game.choose(0);
      game.level = 12;
    }
    game.notice = '';
    game.noticeTime = 0;
    this.targets = [];
    const count = formation === 'single' ? 1 : formation === 'surround' ? 12 : 8;
    for (let slot = 0; slot < count; slot++)
      this.targets.push({ enemy: this.placeTarget(game, slot, count), slot, respawnAt: 0 });
  }

  resize(width: number, height: number) {
    const changed = width !== this.viewport.width || height !== this.viewport.height;
    this.viewport = { width, height };
    this.game.viewport = { ...this.viewport };
    if (changed)
      for (const target of this.targets)
        if (!target.enemy.dead)
          Object.assign(
            target.enemy,
            this.targetPosition(this.game, target.slot, this.targets.length),
          );
  }

  update(dt: number, input?: Point) {
    if (dt <= 0 || !Number.isFinite(dt) || this.game.state !== 'playing') return;
    const game = this.game as TrialGame;
    if (input) game.input = { ...input };
    game.update(dt);
    // The trial owns a fresh character; its clock cannot reach a lifespan gate.
    game.save.age = 15;
    game.elapsedYears = 0;
    for (const target of this.targets) {
      if (target.enemy.dead) {
        if (!target.respawnAt) target.respawnAt = game.time + 0.8;
        if (game.time >= target.respawnAt) {
          target.enemy = this.placeTarget(game, target.slot, this.targets.length);
          target.respawnAt = 0;
        }
      } else if (Math.hypot(target.enemy.x - game.player.x, target.enemy.y - game.player.y) > 700) {
        target.enemy.dead = true;
        target.respawnAt = game.time + 0.8;
      }
    }
  }

  private placeTarget(game: TrialGame, slot: number, count: number) {
    const near = this.formation === 'surround';
    const single = this.formation === 'single';
    return game.addTarget(
      single ? 10 : near || slot % 3 ? 0 : 2,
      this.targetPosition(game, slot, count),
      single,
      !near,
    );
  }

  private targetPosition(game: Game, slot: number, count: number): Point {
    const single = this.formation === 'single';
    const angle = (slot / count) * Math.PI * 2;
    const radius = single ? 180 : this.formation === 'surround' ? 100 : 170 + (slot % 2) * 65;
    const marginX = single ? 80 : 32;
    const marginY = single ? 80 : 34;
    // Sprite feet are the world anchor. Shift the formation down slightly so
    // both its heads/health bars and its feet fit between the trial controls.
    const offsetY = single ? 42 : 16;
    return {
      x:
        game.player.x +
        Math.cos(angle) * Math.min(radius, Math.max(0, this.viewport.width / 2 - marginX)),
      y:
        game.player.y +
        offsetY +
        Math.sin(angle) * Math.min(radius, Math.max(0, this.viewport.height / 2 - marginY)),
    };
  }
}
