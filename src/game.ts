import {
  TREASURES,
  PASSIVES,
  STAGES,
  DIFFICULTIES,
  ENEMIES,
  MAX_WEAPONS,
  MAX_PASSIVES,
  MAX_WEAPON_LEVEL,
  MAX_PASSIVE_LEVEL,
  TAU,
  treasure,
  xpNeeded,
} from './data.ts';
import type { WeaponKind } from './data.ts';
import { cultivationReward, realmInfo } from './progress.ts';
import type { SaveData } from './progress.ts';

export interface Point {
  x: number;
  y: number;
}
export interface Weapon {
  id: WeaponKind;
  level: number;
  evolved: boolean;
  timer: number;
}
export interface Enemy extends Point {
  id: number;
  type: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  elite: boolean;
  boss: boolean;
  cooldown: number;
  slow: number;
  flash: number;
  charge: number;
  dx: number;
  dy: number;
  dead: boolean;
}
export interface Shot extends Point {
  vx: number;
  vy: number;
  life: number;
  radius: number;
  damage: number;
  color: string;
  kind: WeaponKind | 'hostile';
  pierce: number;
  hit: Set<number>;
  origin: Point;
  age: number;
  bounce: number;
  crit: boolean;
}
export interface Zone extends Point {
  radius: number;
  life: number;
  maxLife: number;
  damage: number;
  tick: number;
  color: string;
  kind: string;
  delay: number;
  hostile: boolean;
}
export interface Effect extends Point {
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  kind: string;
  text?: string;
  x2?: number;
  y2?: number;
}
export interface Pickup extends Point {
  kind: 'xp' | 'heal' | 'magnet' | 'iron' | 'chest';
  value: number;
  pull: boolean;
}
export interface Choice {
  type: 'weapon' | 'passive' | 'evolve' | 'heal';
  id: string;
  level: number;
}
export type GameState = 'playing' | 'paused' | 'upgrade' | 'won' | 'lost';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class Game {
  state: GameState = 'playing';
  time = 0;
  level = 1;
  xp = 0;
  kills = 0;
  creditedCultivation = 0;
  iron = 0;
  rerolls = 3;
  player = { x: 0, y: 0, hp: 100, maxHp: 100, invincible: 0, facing: 1, moving: false };
  weapons: Weapon[] = [];
  passives: Record<string, number> = {};
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  zones: Zone[] = [];
  effects: Effect[] = [];
  pickups: Pickup[] = [];
  choices: Choice[] = [];
  viewport = { width: 1440, height: 900 };
  input: Point = { x: 0, y: 0 };
  notice = '';
  noticeTime = 0;
  bossSpawned = false;
  damageDealt = 0;
  nextElite = 60;
  onEvent: (name: string) => void = () => {};
  private spawnBudget = 0;
  private serial = 0;
  private baseHp: number;
  private realm: number;
  save: SaveData;
  stage: number;
  difficulty: number;
  random: () => number;
  constructor(
    save: SaveData,
    stage: number,
    difficulty: number,
    random: () => number = Math.random,
  ) {
    this.save = save;
    this.stage = stage;
    this.difficulty = difficulty;
    this.random = random;
    this.realm = realmInfo(save.cultivation).step;
    this.baseHp = 100 + save.training.vitality * 10 + this.realm * 3;
    this.player.hp = this.player.maxHp = this.baseHp;
    this.weapons.push({ id: save.starter as WeaponKind, level: 1, evolved: false, timer: 0 });
    this.announce('踏入秘境 · 妖物将至');
  }
  get boss() {
    return this.enemies.find((e) => e.boss && !e.dead);
  }
  get remaining() {
    return Math.max(0, STAGES[this.stage].minutes * 60 - this.time);
  }
  get stats() {
    const p = this.passives;
    return {
      damage:
        1 +
        this.save.training.power * 0.05 +
        this.realm * 0.025 +
        (p.power || 0) * 0.12 +
        (p.spirit || 0) * 0.04,
      cooldown: 1 - (p.haste || 0) * 0.07,
      area: 1 + (p.area || 0) * 0.12,
      duration: 1 + (p.duration || 0) * 0.18,
      speed: 175 * (1 + this.save.training.speed * 0.02 + (p.crit || 0) * 0.03),
      crit: 0.07 + (p.crit || 0) * 0.07,
      armor: 1 - (p.guard || 0) * 0.06,
      magnet: 85 * (1 + (p.magnet || 0) * 0.28),
      xp:
        ((1 + (p.spirit || 0) * 0.15 + (p.magnet || 0) * 0.08) /
          DIFFICULTIES[this.difficulty].amount) *
        0.9,
      regen: 0.18 + (p.duration || 0) * 0.2,
    };
  }
  announce(message: string) {
    this.notice = message;
    this.noticeTime = 3;
  }
  private creditCultivation() {
    if (this.kills === 0 && this.level === 1) return;
    const earned = cultivationReward(this);
    const delta = earned - this.creditedCultivation;
    if (delta <= 0) return;
    this.save.cultivation += delta;
    this.creditedCultivation = earned;
    const realm = realmInfo(this.save.cultivation);
    if (realm.step > this.realm) {
      const hp = (realm.step - this.realm) * 3;
      this.realm = realm.step;
      this.baseHp += hp;
      this.player.maxHp += hp;
      if (this.player.hp > 0) this.player.hp += hp;
      this.announce(`境界突破 · ${realm.name} · 气血与法宝威力提升`);
      this.effect(this.player.x, this.player.y, 1.2, 85, '#ebd99c', 'pulse');
      this.onEvent('breakthrough');
    }
  }
  snapshot() {
    return {
      version: 1,
      stage: this.stage,
      difficulty: this.difficulty,
      state: this.state,
      time: this.time,
      level: this.level,
      xp: this.xp,
      kills: this.kills,
      creditedCultivation: this.creditedCultivation,
      iron: this.iron,
      rerolls: this.rerolls,
      player: { ...this.player },
      weapons: this.weapons.map((w) => ({ ...w })),
      passives: { ...this.passives },
      enemies: this.enemies.map((e) => ({ ...e })),
      shots: this.shots.map((s) => ({ ...s, hit: [...s.hit] })),
      zones: this.zones.map((z) => ({ ...z })),
      pickups: this.pickups.map((p) => ({ ...p })),
      choices: this.choices.map((c) => ({ ...c })),
      bossSpawned: this.bossSpawned,
      nextElite: this.nextElite,
      damageDealt: this.damageDealt,
      spawnBudget: this.spawnBudget,
      serial: this.serial,
    };
  }
  static restore(save: SaveData, raw: unknown): Game | null {
    const numbers = (value: unknown, fields: string[]) =>
      !!value &&
      typeof value === 'object' &&
      fields.every((key) => Number.isFinite((value as Record<string, unknown>)[key]));
    try {
      const s = raw as ReturnType<Game['snapshot']>;
      if (!s || s.version !== 1 || !['playing', 'paused', 'upgrade'].includes(s.state)) return null;
      if (
        !numbers(s, [
          'stage',
          'difficulty',
          'time',
          'level',
          'xp',
          'kills',
          'iron',
          'rerolls',
          'nextElite',
          'damageDealt',
          'spawnBudget',
          'serial',
        ])
      )
        return null;
      if (
        !Number.isInteger(s.stage) ||
        s.stage < 0 ||
        s.stage > save.unlocked ||
        !DIFFICULTIES[s.difficulty] ||
        s.time < 0 ||
        s.level < 1 ||
        s.rerolls < 0 ||
        s.rerolls > 3
      )
        return null;
      if (
        s.creditedCultivation !== undefined &&
        (!Number.isInteger(s.creditedCultivation) ||
          s.creditedCultivation < 0 ||
          s.creditedCultivation > Math.min(save.cultivation, cultivationReward(s)))
      )
        return null;
      if (
        !numbers(s.player, ['x', 'y', 'hp', 'maxHp', 'invincible', 'facing']) ||
        s.player.hp <= 0 ||
        s.player.maxHp < s.player.hp
      )
        return null;
      if (
        !Array.isArray(s.weapons) ||
        !s.weapons.length ||
        s.weapons.length > MAX_WEAPONS ||
        !s.weapons.every(
          (w) =>
            TREASURES.some((t) => t.id === w.id) &&
            Number.isInteger(w.level) &&
            w.level >= 1 &&
            w.level <= 6 &&
            Number.isFinite(w.timer) &&
            typeof w.evolved === 'boolean',
        )
      )
        return null;
      if (
        !s.passives ||
        typeof s.passives !== 'object' ||
        Object.keys(s.passives).length > MAX_PASSIVES ||
        !Object.entries(s.passives).every(
          ([id, level]) =>
            PASSIVES.some((p) => p.id === id) &&
            Number.isInteger(level) &&
            level >= 1 &&
            level <= 5,
        )
      )
        return null;
      if (
        !Array.isArray(s.enemies) ||
        s.enemies.length > 300 ||
        !s.enemies.every(
          (e) =>
            numbers(e, [
              'id',
              'type',
              'x',
              'y',
              'hp',
              'maxHp',
              'radius',
              'speed',
              'damage',
              'cooldown',
              'slow',
              'flash',
              'charge',
              'dx',
              'dy',
            ]) && ENEMIES[e.type],
        )
      )
        return null;
      if (
        !Array.isArray(s.shots) ||
        s.shots.length > 1500 ||
        !s.shots.every(
          (b) =>
            numbers(b, [
              'x',
              'y',
              'vx',
              'vy',
              'life',
              'radius',
              'damage',
              'age',
              'pierce',
              'bounce',
            ]) &&
            typeof b.color === 'string' &&
            Array.isArray(b.hit) &&
            (b.kind === 'hostile' || TREASURES.some((t) => t.id === b.kind)),
        )
      )
        return null;
      if (
        !Array.isArray(s.zones) ||
        s.zones.length > 500 ||
        !s.zones.every(
          (z) =>
            numbers(z, ['x', 'y', 'radius', 'life', 'maxLife', 'damage', 'tick', 'delay']) &&
            typeof z.color === 'string',
        )
      )
        return null;
      if (
        !Array.isArray(s.pickups) ||
        s.pickups.length > 800 ||
        !s.pickups.every(
          (p) =>
            numbers(p, ['x', 'y', 'value']) &&
            ['xp', 'heal', 'magnet', 'iron', 'chest'].includes(p.kind),
        )
      )
        return null;
      if (
        !Array.isArray(s.choices) ||
        s.choices.length > 3 ||
        !s.choices.every(
          (c) =>
            c.type === 'heal' ||
            ((c.type === 'weapon' || c.type === 'evolve') &&
              TREASURES.some((t) => t.id === c.id)) ||
            (c.type === 'passive' && PASSIVES.some((p) => p.id === c.id)),
        )
      )
        return null;
      const g = new Game(save, s.stage, s.difficulty);
      g.time = s.time;
      g.level = s.level;
      g.xp = s.xp;
      g.kills = s.kills;
      g.creditedCultivation = s.creditedCultivation ?? 0;
      g.iron = s.iron;
      g.rerolls = s.rerolls;
      g.player = { ...s.player, moving: false };
      g.weapons = s.weapons.map((w) => ({ ...w }));
      g.passives = { ...s.passives };
      g.enemies = s.enemies.map((e) => ({ ...e }));
      g.shots = s.shots.map((b) => ({ ...b, hit: new Set(b.hit) }));
      g.zones = s.zones.map((z) => ({ ...z }));
      g.pickups = s.pickups.map((p) => ({ ...p }));
      g.choices = s.choices.map((c) => ({ ...c }));
      g.bossSpawned = s.bossSpawned;
      g.nextElite = s.nextElite;
      g.damageDealt = s.damageDealt;
      g.spawnBudget = s.spawnBudget;
      g.serial = s.serial;
      g.state = s.state === 'upgrade' ? 'upgrade' : 'paused';
      if (g.state === 'upgrade' && !g.choices.length) return null;
      g.announce('重续仙缘 · 上次历练已恢复');
      g.creditCultivation();
      return g;
    } catch {
      return null;
    }
  }
  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input = { x: 0, y: 0 };
    }
  }
  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }
  update(dt: number) {
    if (this.state !== 'playing' || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.noticeTime -= dt;
    const p = this.player,
      stats = this.stats;
    p.invincible = Math.max(0, p.invincible - dt);
    p.hp = Math.min(p.maxHp, p.hp + stats.regen * dt);
    const length = Math.hypot(this.input.x, this.input.y);
    p.moving = length > 0.05;
    if (p.moving) {
      p.x += (this.input.x / Math.max(1, length)) * stats.speed * dt;
      p.y += (this.input.y / Math.max(1, length)) * stats.speed * dt;
      if (Math.abs(this.input.x) > 0.05) p.facing = this.input.x > 0 ? 1 : -1;
    }
    this.spawnBudget +=
      dt *
      (1.3 + this.time * 0.017 + this.stage * 0.3) *
      DIFFICULTIES[this.difficulty].amount *
      (this.bossSpawned ? 0.32 : 1);
    while (this.spawnBudget >= 1) {
      this.spawnBudget--;
      if (this.enemies.length < 240) this.spawnEnemy();
    }
    if (this.time >= this.nextElite && !this.bossSpawned) {
      this.spawnEnemy(Math.min(10, 4 + Math.floor(this.time / 120) * 3), true);
      this.nextElite += 60;
      this.announce('精英现身 · 击败可得炼器宝匣');
    }
    if (!this.bossSpawned && this.remaining === 0) {
      this.bossSpawned = true;
      this.spawnEnemy(10, false, true);
      this.announce(`${STAGES[this.stage].boss}降临 · 小心红色预警`);
      this.onEvent('boss');
    }
    for (const w of this.weapons) {
      w.timer -= dt;
      if (w.timer <= 0) {
        this.cast(w);
        w.timer = treasure(w.id).cooldown * stats.cooldown * (w.evolved ? 0.7 : 1);
      }
    }
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    for (const e of this.effects) {
      e.life -= dt;
      if (e.kind === 'text') e.y -= dt * 28;
    }
    this.effects = this.effects.filter((e) => e.life > 0);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.state = 'lost';
      this.onEvent('lose');
    }
    if (this.state === 'playing' && this.xp >= xpNeeded(this.level)) {
      this.xp -= xpNeeded(this.level);
      this.level++;
      this.creditCultivation();
      this.state = 'upgrade';
      this.choices = this.makeChoices();
      this.onEvent('upgrade');
      this.input = { x: 0, y: 0 };
    }
  }
  spawnEnemy(type?: number, elite = false, boss = false, at?: Point) {
    const available = Math.min(ENEMIES.length, 1 + Math.floor(this.time / 25) + this.stage * 2);
    type ??= Math.floor(this.random() * available);
    const template = ENEMIES[type],
      angle = this.random() * TAU;
    const difficulty = DIFFICULTIES[this.difficulty];
    const strength = (1 + this.time / 260) * (1 + this.stage * 0.22);
    const hp = boss
      ? (16000 + this.stage * 11000) * difficulty.hp
      : template.hp * strength * difficulty.hp * (elite ? 7 : 1);
    const enemy: Enemy = {
      id: ++this.serial,
      type,
      x: at?.x ?? this.player.x + Math.cos(angle) * (this.viewport.width / 2 + 70),
      y: at?.y ?? this.player.y + Math.sin(angle) * (this.viewport.height / 2 + 70),
      hp,
      maxHp: hp,
      radius: boss ? 48 : template.radius * (elite ? 1.55 : 1),
      speed: boss
        ? 53 + this.stage * 3
        : template.speed * (1 + Math.min(0.3, this.time / 1400)) * (elite ? 1.1 : 1),
      damage:
        (boss ? 26 + this.stage * 3 : template.damage * (1 + this.stage * 0.12)) *
        difficulty.damage,
      elite,
      boss,
      cooldown: boss ? 2.5 : 1 + this.random() * 3,
      slow: 0,
      flash: 0,
      charge: 0,
      dx: 0,
      dy: 0,
      dead: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }
  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.slow -= dt;
      e.flash -= dt;
      e.cooldown -= dt;
      let d = distance(e, p),
        nx = (p.x - e.x) / (d || 1),
        ny = (p.y - e.y) / (d || 1);
      const behavior = ENEMIES[e.type].behavior;
      if (e.charge > 0) {
        e.charge -= dt;
        if (e.charge < 0.55) {
          e.x += e.dx * 380 * dt;
          e.y += e.dy * 380 * dt;
        }
      } else {
        const move = behavior === 'ranged' && d < 240 && !e.boss ? (d < 160 ? -0.4 : 0) : 1;
        const speed = e.speed * (e.slow > 0 ? 0.35 : 1) * move;
        e.x += nx * speed * dt;
        e.y += ny * speed * dt;
      }
      if (e.boss && e.cooldown <= 0) {
        e.cooldown = e.hp < e.maxHp / 2 ? 2 : 3.4;
        const phase = Math.floor(this.time) % 3;
        if (phase === 0) {
          e.charge = 1.3;
          e.dx = nx;
          e.dy = ny;
          this.effect(
            e.x,
            e.y,
            1,
            30,
            '#ed8879',
            'line',
            undefined,
            e.x + nx * 240,
            e.y + ny * 240,
          );
        } else if (phase === 1) {
          for (let i = 0; i < 10 + this.stage; i++) {
            const a = (i / (10 + this.stage)) * TAU;
            this.hostileShot(e, Math.cos(a), Math.sin(a), 105, e.damage * 0.75);
          }
        } else {
          for (let i = 0; i < 3; i++)
            this.zone(
              p.x + (i - 1) * 105,
              p.y + (i % 2) * 65,
              68,
              0.5,
              e.damage,
              '#ef8a7a',
              'blast',
              1.2,
              true,
            );
        }
      } else if (!e.boss && e.cooldown <= 0) {
        e.cooldown = 3 + this.random() * 2;
        if (behavior === 'ranged' && d < 600) this.hostileShot(e, nx, ny, 145, e.damage);
        if (behavior === 'dash' && d < 330) {
          e.charge = 1.25;
          e.dx = nx;
          e.dy = ny;
          this.effect(
            e.x,
            e.y,
            0.75,
            10,
            '#e9af85',
            'line',
            undefined,
            e.x + nx * 180,
            e.y + ny * 180,
          );
        }
        if (behavior === 'summon' && this.enemies.length < 230) {
          this.spawnEnemy(0, false, false, { x: e.x + 35, y: e.y });
          this.spawnEnemy(0, false, false, { x: e.x - 35, y: e.y });
        }
        if (behavior === 'poison' && d < 350)
          this.zone(p.x, p.y, 45, 3, e.damage * 0.7, '#adbe73', 'poison', 1, true);
      }
      if (behavior === 'explode' && !e.boss && d < 60 && !e.dead) {
        e.dead = true;
        this.zone(e.x, e.y, 66, 0.3, e.damage * 1.4, '#ee9b76', 'blast', 0.85, true);
      }
      d = distance(e, p);
      if (d < e.radius + 13 && !e.dead) this.hurtPlayer(e.damage);
      if (d > Math.max(this.viewport.width, this.viewport.height) * 1.5 && !e.boss) {
        const a = this.random() * TAU;
        e.x = p.x + Math.cos(a) * (this.viewport.width / 2 + 60);
        e.y = p.y + Math.sin(a) * (this.viewport.height / 2 + 60);
      }
    }
  }
  private nearest(at: Point, excluded = new Set<number>(), range = 950) {
    let result: Enemy | undefined,
      nearest = range;
    for (const e of this.enemies) {
      const d = distance(e, at);
      if (!e.dead && !excluded.has(e.id) && d < nearest) {
        nearest = d;
        result = e;
      }
    }
    return result;
  }
  private cast(w: Weapon) {
    const t = treasure(w.id),
      p = this.player,
      s = this.stats,
      target = this.nearest(p);
    const count = 1 + Math.floor(w.level / 2) + (w.evolved ? 3 : 0);
    const dmg =
      t.damage *
      (1 + (w.level - 1) * 0.32) *
      s.damage *
      (1 + (this.save.forge[w.id] || 0) * 0.08) *
      (w.evolved ? 1.8 : 1);
    const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : this.time;
    const radius = (95 + w.level * 7) * s.area;
    if (w.id === 'orbit') {
      for (let i = 0; i < count + 1; i++) {
        const angle = this.time * 1.5 + (i / (count + 1)) * TAU;
        this.areaDamage(
          { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius },
          32 * s.area,
          dmg,
          'orbit',
        );
      }
      return;
    }
    if (w.id === 'pulse' || w.id === 'ice') {
      this.effect(p.x, p.y, 0.75, radius * 1.5, t.color, w.id);
      this.areaDamage(p, radius * 1.5, dmg, w.id);
      return;
    }
    if (!target) return;
    if (['poison', 'vortex', 'meteor'].includes(w.id)) {
      this.zone(
        target.x,
        target.y,
        (w.id === 'meteor' ? 75 : 90) * s.area * (w.evolved ? 1.45 : 1),
        (w.id === 'meteor' ? 0.25 : 3.5) * s.duration,
        dmg,
        t.color,
        w.id,
        w.id === 'meteor' ? 0.55 : 0.1,
      );
      return;
    }
    if (w.id === 'lightning') {
      const selected = [...this.enemies]
        .filter((e) => !e.dead && distance(e, p) < 650)
        .sort((a, b) => distance(a, p) - distance(b, p))
        .slice(0, count);
      for (const e of selected) {
        this.effect(e.x, e.y, 0.45, 60, t.color, 'lightning');
        this.areaDamage(e, 65 * s.area, dmg, 'lightning');
      }
      this.onEvent('lightning');
      return;
    }
    if (w.id === 'chain') {
      let current = target,
        from: Point = p;
      const hit = new Set<number>();
      for (let i = 0; i < count + 2; i++) {
        hit.add(current.id);
        this.effect(from.x, from.y, 0.4, 5, t.color, 'line', undefined, current.x, current.y);
        this.hitEnemy(current, dmg, false);
        current.slow = 2;
        from = current;
        const next = this.nearest(current, hit, 190 * s.area);
        if (!next) break;
        current = next;
      }
      return;
    }
    const number = w.id === 'talisman' ? count + 3 : count;
    for (let i = 0; i < number; i++) {
      const angle =
        w.id === 'talisman'
          ? (i / number) * TAU + this.time
          : a + (i - (number - 1) / 2) * (w.id === 'fan' ? 0.24 : 0.11);
      const speed = w.id === 'arrow' ? 630 : w.id === 'blade' ? 280 : 380;
      const crit = this.random() < s.crit + (w.id === 'arrow' ? 0.18 : 0);
      this.shots.push({
        x: p.x,
        y: p.y - 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2.2 * s.duration,
        radius: (w.id === 'dragon' ? 18 : 9) * s.area,
        damage: dmg * (crit ? 1.8 : 1),
        color: t.color,
        kind: w.id,
        pierce: ['sword', 'fan', 'blade', 'dragon'].includes(w.id) ? 2 + w.level : 1,
        hit: new Set(),
        origin: { x: p.x, y: p.y },
        age: 0,
        bounce: w.id === 'pearl' ? count + 2 : 0,
        crit,
      });
    }
    this.onEvent('cast');
  }
  private updateShots(dt: number) {
    for (const b of this.shots) {
      b.life -= dt;
      b.age += dt;
      if (b.kind === 'blade' && b.age > 0.7) {
        const d = distance(b, this.player) || 1;
        b.vx = ((this.player.x - b.x) / d) * 330;
        b.vy = ((this.player.y - b.y) / d) * 330;
        if (d < 15) b.life = 0;
      }
      if (b.kind === 'dragon') {
        const angle = Math.sin(b.age * 9) * dt * 2;
        const vx = b.vx;
        b.vx = vx * Math.cos(angle) - b.vy * Math.sin(angle);
        b.vy = vx * Math.sin(angle) + b.vy * Math.cos(angle);
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.kind === 'hostile') {
        if (distance(b, this.player) < b.radius + 12) {
          this.hurtPlayer(b.damage);
          b.life = 0;
        }
        continue;
      }
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (e.dead || b.hit.has(e.id) || distance(b, e) > b.radius + e.radius) continue;
        b.hit.add(e.id);
        this.hitEnemy(e, b.damage, b.crit);
        b.pierce--;
        if (b.kind === 'fire') {
          this.areaDamage(b, 62 * this.stats.area, b.damage * 0.65, 'fire');
          this.effect(b.x, b.y, 0.45, 62, b.color, 'pulse');
        }
        if (b.kind === 'dragon') {
          const d = distance(e, this.player) || 1;
          e.x += ((e.x - this.player.x) / d) * 25;
          e.y += ((e.y - this.player.y) / d) * 25;
        }
        if (b.bounce > 0) {
          const next = this.nearest(b, b.hit, 300);
          if (next) {
            const d = distance(next, b) || 1;
            b.vx = ((next.x - b.x) / d) * 450;
            b.vy = ((next.y - b.y) / d) * 450;
            b.bounce--;
            b.pierce = 1;
            break;
          }
        }
        if (b.pierce <= 0) {
          b.life = 0;
          break;
        }
      }
    }
    this.shots = this.shots.filter((b) => b.life > 0);
  }
  private updateZones(dt: number) {
    for (const z of this.zones) {
      if (z.delay > 0) {
        z.delay -= dt;
        continue;
      }
      z.life -= dt;
      z.tick -= dt;
      if (z.kind === 'vortex')
        for (const e of this.enemies) {
          const d = distance(e, z);
          if (d < z.radius && d > 10 && !e.boss) {
            e.x += ((z.x - e.x) / d) * 60 * dt;
            e.y += ((z.y - e.y) / d) * 60 * dt;
          }
        }
      if (z.tick <= 0) {
        z.tick = 0.5;
        if (z.hostile) {
          if (distance(z, this.player) < z.radius + 8) this.hurtPlayer(z.damage);
        } else this.areaDamage(z, z.radius, z.damage, z.kind);
      }
    }
    this.zones = this.zones.filter((z) => z.life > 0);
  }
  private updatePickups(dt: number) {
    const p = this.player,
      s = this.stats;
    for (const item of this.pickups) {
      const d = distance(item, p);
      if (d < s.magnet || item.pull) {
        item.pull = true;
        const step = Math.min(d, (360 + (d > 300 ? 500 : 0)) * dt);
        item.x += ((p.x - item.x) / (d || 1)) * step;
        item.y += ((p.y - item.y) / (d || 1)) * step;
      }
      if (distance(item, p) < 20) {
        if (item.kind === 'xp') this.xp += item.value * s.xp;
        if (item.kind === 'heal') {
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
          this.float(p, '+气血', '#b4e4aa');
        }
        if (item.kind === 'iron') {
          this.iron += item.value;
          this.float(p, '+玄铁', '#ded1b0');
        }
        if (item.kind === 'magnet') {
          for (const gem of this.pickups) if (gem.kind === 'xp') gem.pull = true;
          this.announce('聚灵石 · 灵气归一');
        }
        if (item.kind === 'chest') {
          this.iron += 2;
          p.hp = Math.min(p.maxHp, p.hp + 20);
          const candidates = this.weapons.filter((w) => w.level < MAX_WEAPON_LEVEL);
          if (candidates.length) {
            const w = candidates[Math.floor(this.random() * candidates.length)];
            w.level++;
            this.announce(`炼器宝匣 · ${treasure(w.id).name}升至${w.level}重 · 玄铁 +2`);
          } else {
            this.iron += 2;
            this.announce('炼器宝匣 · 玄铁 +4 · 气血回复');
          }
          this.onEvent('upgrade');
        }
        item.value = 0;
      }
    }
    this.pickups = this.pickups.filter((i) => i.value > 0);
    if (this.pickups.length > 550) {
      const gems = this.pickups.filter((i) => i.kind === 'xp');
      const target = gems[0];
      if (target) {
        for (const gem of gems.slice(1, 150)) {
          target.value += gem.value;
          gem.value = 0;
        }
        this.pickups = this.pickups.filter((i) => i.value > 0);
      }
    }
  }
  private hostileShot(from: Point, nx: number, ny: number, speed: number, damage: number) {
    this.shots.push({
      x: from.x,
      y: from.y,
      vx: nx * speed,
      vy: ny * speed,
      life: 6,
      radius: 7,
      damage,
      color: '#f0a5ab',
      kind: 'hostile',
      pierce: 1,
      hit: new Set(),
      origin: { ...from },
      age: 0,
      bounce: 0,
      crit: false,
    });
  }
  private zone(
    x: number,
    y: number,
    radius: number,
    life: number,
    damage: number,
    color: string,
    kind: string,
    delay = 0,
    hostile = false,
  ) {
    this.zones.push({
      x,
      y,
      radius,
      life,
      maxLife: life,
      damage,
      tick: 0,
      color,
      kind,
      delay,
      hostile,
    });
  }
  private areaDamage(at: Point, radius: number, damage: number, kind: string) {
    for (const e of this.enemies) {
      if (e.dead || distance(at, e) > radius + e.radius) continue;
      this.hitEnemy(e, damage, false);
      if (kind === 'ice') e.slow = 2.5 * this.stats.duration;
      if (kind === 'pulse' && !e.boss) {
        const d = distance(e, at) || 1;
        e.x += ((e.x - at.x) / d) * 70;
        e.y += ((e.y - at.y) / d) * 70;
      }
    }
  }
  hitEnemy(e: Enemy, damage: number, crit = false) {
    if (e.dead) return;
    const actual = Math.min(e.hp, damage);
    e.hp -= damage;
    e.flash = 0.12;
    this.damageDealt += actual;
    if (this.effects.length < 100)
      this.float(e, `${Math.ceil(damage)}${crit ? '!' : ''}`, crit ? '#f8db88' : '#e5edce');
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.creditCultivation();
      this.pickups.push({
        x: e.x,
        y: e.y,
        kind: 'xp',
        value: ENEMIES[e.type].xp * (e.elite ? 8 : 1),
        pull: false,
      });
      if (e.elite) this.pickups.push({ x: e.x + 14, y: e.y, kind: 'chest', value: 1, pull: false });
      else if (!e.boss) {
        const r = this.random();
        const kind = r < 0.005 ? 'heal' : r < 0.01 ? 'magnet' : r < 0.027 ? 'iron' : null;
        if (kind) this.pickups.push({ x: e.x + 10, y: e.y, kind, value: 1, pull: false });
      }
      if (e.boss && this.player.hp > 0) {
        this.state = 'won';
        this.onEvent('win');
      }
    }
  }
  hurtPlayer(damage: number) {
    if (this.player.invincible > 0 || this.state !== 'playing') return;
    this.player.hp -= damage * this.stats.armor;
    this.player.invincible = 0.8;
    this.effect(this.player.x, this.player.y, 0.35, 35, '#f3a69b', 'pulse');
    this.onEvent('hurt');
  }
  private effect(
    x: number,
    y: number,
    life: number,
    radius: number,
    color: string,
    kind: string,
    text?: string,
    x2?: number,
    y2?: number,
  ) {
    if (this.effects.length < 250)
      this.effects.push({ x, y, life, maxLife: life, radius, color, kind, text, x2, y2 });
  }
  private float(at: Point, text: string, color: string) {
    this.effect(at.x + (this.random() - 0.5) * 16, at.y - 22, 0.65, 0, color, 'text', text);
  }
  makeChoices(exclude: Choice[] = []): Choice[] {
    const pool: Choice[] = [];
    for (const t of TREASURES) {
      const owned = this.weapons.find((w) => w.id === t.id);
      if (
        owned &&
        owned.level === MAX_WEAPON_LEVEL &&
        !owned.evolved &&
        (this.passives[t.passive] || 0) >= 3
      )
        pool.push({ type: 'evolve', id: t.id, level: 7 });
      else if (owned && owned.level < MAX_WEAPON_LEVEL)
        pool.push({ type: 'weapon', id: t.id, level: owned.level + 1 });
      else if (!owned && this.weapons.length < MAX_WEAPONS)
        pool.push({ type: 'weapon', id: t.id, level: 1 });
    }
    for (const p of PASSIVES) {
      const current = this.passives[p.id] || 0;
      if (
        (current > 0 || Object.keys(this.passives).length < MAX_PASSIVES) &&
        current < MAX_PASSIVE_LEVEL
      )
        pool.push({ type: 'passive', id: p.id, level: current + 1 });
    }
    const result: Choice[] = [];
    const pick = (c: Choice) => {
      result.push(c);
      pool.splice(pool.indexOf(c), 1);
    };
    const evolution = pool.find((c) => c.type === 'evolve');
    if (evolution) pick(evolution);
    const owned = pool.filter((c) => c.type === 'weapon' && c.level > 1);
    if (!evolution && owned.length && this.random() < 0.75)
      pick(owned[Math.floor(this.random() * owned.length)]);
    while (result.length < 3 && pool.length) {
      const fresh = pool.filter((c) => !exclude.some((e) => e.id === c.id && e.type === c.type));
      const source = fresh.length ? fresh : pool;
      pick(source[Math.floor(this.random() * source.length)]);
    }
    if (result.length < 3) result.push({ type: 'heal', id: 'heal', level: 1 });
    return result;
  }
  reroll() {
    if (this.state !== 'upgrade' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choices = this.makeChoices(this.choices);
    return true;
  }
  choose(index: number) {
    if (this.state !== 'upgrade') return false;
    const c = this.choices[index];
    if (!c) return false;
    if (c.type === 'weapon') {
      const w = this.weapons.find((w) => w.id === c.id);
      if (w) w.level = c.level;
      else this.weapons.push({ id: c.id as WeaponKind, level: 1, evolved: false, timer: 0 });
    }
    if (c.type === 'evolve') {
      this.weapons.find((w) => w.id === c.id)!.evolved = true;
      this.announce(`仙器觉醒 · ${treasure(c.id).evolution}`);
    }
    if (c.type === 'passive') {
      this.passives[c.id] = c.level;
      if (c.id === 'guard') {
        this.player.maxHp = this.baseHp + c.level * 20;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
      }
    }
    if (c.type === 'heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.4);
      this.iron++;
    }
    this.state = 'playing';
    this.choices = [];
    this.onEvent('select');
    return true;
  }
}
