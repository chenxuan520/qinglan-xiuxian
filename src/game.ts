import { medicineEffects, medicineLoot } from './medicine-data.ts';
import { recordChronicle } from './chronicle.ts';
import { masteryBonus } from './mortal.ts';
import {
  TREASURES,
  PASSIVES,
  STAGES,
  STAGE_COMBAT_SCALING,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  DIFFICULTIES,
  ENEMIES,
  ENEMY_TACTICS,
  STAGE_ENEMIES,
  enemyRoster,
  enemyWave,
  MAX_WEAPONS,
  MAX_PASSIVES,
  MAX_WEAPON_LEVEL,
  MAX_RUN_LEVEL,
  MAX_REVIVES,
  MAX_PASSIVE_LEVEL,
  TAU,
  treasure,
  xpNeeded,
  passive,
  allowsSchool,
  evolutionPassives,
  isCultivationPath,
  spiritRootInfo,
  SPIRIT_ROOTS,
  ELEMENTS,
  rootElementsFor,
  weaponRootBonus,
  rootStarter,
  REALM_LIFESPANS,
  STAGE_YEARS_PER_MINUTE,
  tribulationRules,
} from './data.ts';
import type { CultivationPath, WeaponKind, SpiritRootId, ElementId, EnemySkill } from './data.ts';
import {
  cultivationReward,
  realmInfo,
  realmBonuses,
  realmDamageMultiplier,
  forgeDamageBonus,
  dropArtifacts,
  cultivationFactor,
  bossCultivationReward,
  extendLifespan,
  syncTribulationClock,
  tribulationDue,
  gainCultivation,
} from './progress.ts';
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
  bossStage?: number;
  skillStep?: number;
  pursuitCooldown?: number;
  windup?: number;
  pendingSkill?: EnemySkill;
  summonedBy?: number;
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
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class Game {
  state: GameState = 'playing';
  time = 0;
  level = 1;
  xp = 0;
  kills = 0;
  creditedCultivation = 0;
  combatCultivation = 0;
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
  slowed = 0;
  bossSpawned = false;
  trialBossesDefeated = 0;
  trialBossesSpawned = 0;
  nextTrialBossAt = TRIAL_BOSS_TIMES[0];
  damageDealt = 0;
  damageBySource: Record<string, number> = {};
  bossCultivation = 0;
  revivesUsed = 0;
  tribulation = 0;
  tribulationStep = 0;
  tribulationNextAt = 1.2;
  tribulationOpeningDamage = 0;
  nextElite = 60;
  onEvent: (name: string, items?: string[]) => void = () => {};
  private spawnBudget = 0;
  private serial = 0;
  private nextEnemySkillAt = 0;
  private medicine: ReturnType<typeof medicineEffects>;
  private nextMedicinePulse = 0;
  private baseHp: number;
  private realm: number;
  save: SaveData;
  stage: number;
  difficulty: number;
  path: CultivationPath;
  spiritRoot: SpiritRootId;
  rootElements: ElementId[];
  startedImmortal: boolean;
  random: () => number;
  constructor(
    save: SaveData,
    stage: number,
    difficulty: number,
    random: () => number = Math.random,
    path: CultivationPath = save.mortal.member ? passive(save.mortal.member.id).school : save.path,
  ) {
    this.save = save;
    this.medicine = medicineEffects(save.medicine, save.age);
    syncTribulationClock(save);
    this.stage = stage;
    this.nextElite = this.eliteInterval;
    this.difficulty = difficulty;
    this.random = random;
    this.path = path;
    this.spiritRoot = save.spiritRoot;
    this.rootElements = [...save.rootElements];
    this.realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).step;
    this.startedImmortal = this.realm === 24;
    this.baseHp =
      spiritRootInfo(this.spiritRoot).baseHp +
      save.training.vitality * 10 +
      realmBonuses(this.realm).hp;
    if (save.mortal.member) this.passives[save.mortal.member.id] = 1;
    this.player.hp = this.player.maxHp = this.maximumHealth;
    const starter =
      TREASURES.find(
        (t) =>
          t.id === save.starter && save.artifacts.includes(t.id) && allowsSchool(path, t.school),
      ) ?? treasure(rootStarter(this.rootElements, path));
    this.weapons.push({ id: starter.id, level: 1, evolved: false, timer: 0 });
    this.announce('踏入秘境 · 妖物将至');
  }
  private passivePower(id: string) {
    return (this.passives[id] || 0) * (1 + masteryBonus(this.save, id));
  }
  private get maximumHealth() {
    const base = this.baseHp + this.passivePower('guard') * 20;
    return Math.round(
      base *
        (1 + this.passivePower('bone') * 0.18) *
        (1 - (this.passives.frenzy || 0) * 0.02 * this.medicine.drawback) *
        (this.path === 'orthodox' ? 1.12 : 1) *
        (1 + this.save.tribulations * 0.03) *
        (1 + this.save.retreatBonus.vitality / 100) *
        this.medicine.hp,
    );
  }
  get boss() {
    return this.enemies.find((e) => e.boss && !e.dead);
  }
  get eliteInterval() {
    return this.isFinalTrial
      ? 60
      : (60 * STAGES[this.stage].minutes) / (STAGES[this.stage].minutes + 2);
  }
  get lifespan() {
    return REALM_LIFESPANS[Math.floor(this.realm / 3)] + this.save.lifespanBonus;
  }
  get expired() {
    return this.save.age >= this.lifespan;
  }
  borrowLife() {
    const expired = this.expired;
    const years = extendLifespan(this.save);
    if (years && expired && this.state === 'lost') {
      this.player.hp = this.player.maxHp;
      this.player.invincible = 3;
      this.slowed = 0;
      this.state = 'paused';
      this.announce(`向天借寿 · 寿元 +${years} 年`);
    }
    return years;
  }
  get isFinalTrial() {
    return this.stage === FINAL_TRIAL_STAGE && !this.tribulation;
  }
  get encounterName() {
    return this.tribulation ? `天劫 · 第 ${this.tribulation} 劫` : STAGES[this.stage].name;
  }
  get tribulationVulnerable() {
    return this.tribulation > 0 && this.tribulationStep === 0 && this.time > 1.2;
  }
  get tribulationRadius() {
    return 460;
  }
  static createTribulation(save: SaveData, source: Game | null) {
    const g = new Game(
      save,
      source?.stage ?? save.unlocked,
      0,
      Math.random,
      source?.path ?? save.path,
    );
    g.tribulation = save.tribulations + 1;
    if (source) {
      g.spiritRoot = source.spiritRoot;
      g.rootElements = [...source.rootElements];
      g.weapons = source.weapons.map((w) => ({ ...w, timer: 0 }));
      g.passives = { ...source.passives };
      g.level = source.level;
    } else {
      g.weapons[0].level = 6;
      g.weapons[0].evolved = true;
    }
    g.baseHp =
      spiritRootInfo(g.spiritRoot).baseHp + save.training.vitality * 10 + realmBonuses(g.realm).hp;
    g.player.hp = g.player.maxHp = g.maximumHealth;
    g.player.y = 240;
    g.bossSpawned = true;
    const boss = g.spawnEnemy(10, false, true, { x: 0, y: 0 }, 6);
    boss.hp = boss.maxHp = tribulationRules(g.tribulation).hp;
    boss.radius = 65;
    boss.speed = 0;
    boss.damage = g.player.maxHp * tribulationRules(g.tribulation).damage;
    g.announce(`第 ${g.tribulation} 次天劫 · 先避雷，再攻核心`);
    return g;
  }
  get remaining() {
    return Math.max(0, STAGES[this.stage].minutes * 60 - this.time);
  }
  get stats() {
    return {
      damage:
        (1 +
          realmBonuses(this.realm).damage +
          this.passivePower('power') * 0.12 +
          this.passivePower('spirit') * 0.04 +
          this.passivePower('blood') * 0.18 +
          this.passivePower('forbidden') * 0.08 +
          (this.path === 'demonic' ? 0.12 : 0)) *
        (1 - (this.passives.abyss || 0) * 0.02 * this.medicine.drawback) *
        (1 + (this.save.training.power * spiritRootInfo(this.spiritRoot).powerPerLevel) / 100) *
        (1 + this.save.tribulations * 0.02) *
        (1 + this.save.retreatBonus.power / 100) *
        realmDamageMultiplier(this.realm) *
        this.medicine.damage,
      cooldown:
        Math.max(
          0.3,
          1 -
            this.passivePower('haste') * 0.07 -
            this.passivePower('frenzy') * (this.player.hp < this.player.maxHp / 2 ? 0.1 : 0.08) +
            (this.passives.soul || 0) * 0.01 * this.medicine.drawback,
        ) * this.medicine.cooldown,
      area:
        (1 + this.passivePower('area') * 0.12 + this.passivePower('abyss') * 0.16) *
        this.medicine.area,
      duration:
        (1 + this.passivePower('duration') * 0.18 + this.passivePower('devour') * 0.2) *
        this.medicine.duration,
      speed:
        spiritRootInfo(this.spiritRoot).baseSpeed *
        (1 +
          this.save.training.speed * 0.02 +
          this.passivePower('crit') * 0.03 +
          (this.player.hp < this.player.maxHp / 2 ? this.passivePower('frenzy') * 0.04 : 0)) *
        (1 + this.save.retreatBonus.speed / 100) *
        (1 - (this.passives.bone || 0) * 0.01 * this.medicine.drawback) *
        (this.slowed > 0 ? 1 - 0.25 * this.medicine.drawback : 1) *
        this.medicine.speed,
      crit: Math.min(
        0.85,
        spiritRootInfo(this.spiritRoot).baseCrit +
          this.passivePower('crit') * 0.07 +
          this.passivePower('curse') * 0.08 +
          this.medicine.crit,
      ),
      criticalDamage: 1.8 + this.passivePower('curse') * 0.12,
      armor:
        Math.max(
          0.3,
          1 -
            this.passivePower('guard') * 0.06 +
            (this.passives.blood || 0) * 0.03 * this.medicine.drawback +
            (this.passives.curse || 0) * 0.015 * this.medicine.drawback +
            (this.passives.forbidden || 0) * 0.015 * this.medicine.drawback,
        ) * this.medicine.armor,
      magnet: 85 * (1 + this.passivePower('magnet') * 0.28) * this.medicine.magnet,
      xp:
        ((1 +
          this.passivePower('spirit') * 0.15 +
          this.passivePower('magnet') * 0.08 +
          this.passivePower('soul') * 0.1 +
          this.passivePower('forbidden') * 0.18) /
          DIFFICULTIES[this.difficulty].amount) *
        0.9 *
        spiritRootInfo(this.spiritRoot).rate,
      regen:
        (spiritRootInfo(this.spiritRoot).baseRegen * this.medicine.regen +
          this.passivePower('duration') * 0.2) *
        (this.path === 'orthodox' ? 1.2 : 1) *
        (1 - (this.passives.devour || 0) * 0.04 * this.medicine.drawback),
      killHeal: this.passivePower('devour') * (0.18 + this.player.maxHp * 0.0002),
    };
  }
  announce(message: string) {
    this.notice = message;
    this.noticeTime = 3;
  }
  private recordRunAchievements() {
    if (this.level >= MAX_RUN_LEVEL)
      recordChronicle(this.save, '百级归真', '一场历练中修至一百级。', 'level-100');
    if (
      this.weapons.length === MAX_WEAPONS &&
      new Set(this.weapons.map((weapon) => weapon.id)).size === MAX_WEAPONS &&
      this.weapons.every((weapon) => weapon.evolved && weapon.level === MAX_WEAPON_LEVEL)
    )
      recordChronicle(this.save, '六仙同御', '单局六件法宝同时觉醒为仙器。', 'six-immortals');
  }
  private creditCultivation() {
    if (this.tribulation) return;
    if (this.kills === 0 && this.level === 1) return;
    const earned = cultivationReward(this);
    const delta = earned - this.creditedCultivation;
    if (delta <= 0) return;
    gainCultivation(this.save, delta, this.spiritRoot);
    syncTribulationClock(this.save);
    this.creditedCultivation = earned;
    const realm = realmInfo(this.save.cultivation, this.save.completed.includes(FINAL_TRIAL_STAGE));
    if (realm.step > this.realm) {
      const hp = realmBonuses(realm.step).hp - realmBonuses(this.realm).hp;
      const major = realm.index > Math.floor(this.realm / 3);
      this.realm = realm.step;
      this.baseHp += hp;
      const increase = this.maximumHealth - this.player.maxHp;
      this.player.maxHp = this.maximumHealth;
      if (this.player.hp > 0) this.player.hp += increase;
      this.announce(`${major ? '大境界突破' : '境界突破'} · ${realm.name} · 气血与法宝威力提升`);
      this.effect(this.player.x, this.player.y, 1.2, 85, '#ebd99c', 'pulse');
      this.onEvent('breakthrough');
    }
  }
  snapshot() {
    return {
      spiritRoot: this.spiritRoot,
      rootElements: [...this.rootElements],
      startedImmortal: this.startedImmortal,
      version: 1,
      stage: this.stage,
      stageDuration: STAGES[this.stage].minutes * 60,
      difficulty: this.difficulty,
      path: this.path,
      state: this.state,
      time: this.time,
      level: this.level,
      xp: this.xp,
      kills: this.kills,
      creditedCultivation: this.creditedCultivation,
      combatCultivation: this.combatCultivation,
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
      trialBossesDefeated: this.trialBossesDefeated,
      trialBossesSpawned: this.trialBossesSpawned,
      nextTrialBossAt: this.nextTrialBossAt,
      trialBossSchedule: 4,
      nextElite: this.nextElite,
      damageDealt: this.damageDealt,
      damageBySource: { ...this.damageBySource },
      bossCultivation: this.bossCultivation,
      revivesUsed: this.revivesUsed,
      tribulation: this.tribulation,
      tribulationStep: this.tribulationStep,
      tribulationNextAt: this.tribulationNextAt,
      tribulationOpeningDamage: this.tribulationOpeningDamage,
      spawnBudget: this.spawnBudget,
      serial: this.serial,
      slowed: this.slowed,
      nextEnemySkillAt: this.nextEnemySkillAt,
      nextMedicinePulse: this.nextMedicinePulse,
      medicineHpFactor: this.medicine.hp,
    };
  }
  static restore(save: SaveData, raw: unknown): Game | null {
    const numbers = (value: unknown, fields: string[]) =>
      !!value &&
      typeof value === 'object' &&
      fields.every((key) => Number.isFinite((value as Record<string, unknown>)[key]));
    try {
      const s = raw as ReturnType<Game['snapshot']>;
      if (!s || s.version !== 1 || !['playing', 'paused', 'upgrade', 'lost'].includes(s.state))
        return null;
      if (
        s.stageDuration !== undefined &&
        (!Number.isFinite(s.stageDuration) || s.stageDuration <= 0)
      )
        return null;
      if (s.path !== undefined && !isCultivationPath(s.path)) return null;
      if (
        s.tribulation !== undefined &&
        (!Number.isSafeInteger(s.tribulation) || s.tribulation < 0)
      )
        return null;
      if (
        s.tribulation &&
        (!tribulationDue(save) ||
          s.tribulation !== save.tribulations + 1 ||
          !Number.isInteger(s.tribulationStep) ||
          s.tribulationStep < 0 ||
          s.tribulationStep > 4 ||
          !Number.isFinite(s.tribulationNextAt) ||
          s.tribulationNextAt < 0 ||
          !Number.isFinite(s.tribulationOpeningDamage) ||
          s.tribulationOpeningDamage < 0 ||
          !Array.isArray(s.enemies) ||
          s.enemies.length !== 1 ||
          !s.enemies[0].boss)
      )
        return null;
      if (s.spiritRoot !== undefined && !SPIRIT_ROOTS.some((root) => root.id === s.spiritRoot))
        return null;
      if (
        s.rootElements !== undefined &&
        (!Array.isArray(s.rootElements) ||
          s.rootElements.length !== spiritRootInfo(s.spiritRoot ?? 'heaven').count ||
          new Set(s.rootElements).size !== s.rootElements.length ||
          !s.rootElements.every((id) => ELEMENTS.some((e) => e.id === id)))
      )
        return null;
      if (
        s.stage === FINAL_TRIAL_STAGE &&
        (!Number.isInteger(s.trialBossesDefeated) ||
          s.trialBossesDefeated < 0 ||
          s.trialBossesDefeated > TRIAL_BOSS_STAGES.length ||
          (s.trialBossesDefeated === TRIAL_BOSS_STAGES.length && s.state !== 'lost') ||
          !Number.isFinite(s.nextTrialBossAt) ||
          s.nextTrialBossAt < TRIAL_BOSS_TIMES[0])
      )
        return null;
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
        s.combatCultivation !== undefined &&
        (!Number.isFinite(s.combatCultivation) || s.combatCultivation < 0)
      )
        return null;
      if (
        s.creditedCultivation !== undefined &&
        (!Number.isInteger(s.creditedCultivation) ||
          s.creditedCultivation < 0 ||
          s.creditedCultivation >
            Math.min(
              save.cultivation,
              cultivationReward({ ...s, spiritRoot: s.spiritRoot ?? 'heaven' }),
            ))
      )
        return null;
      if (
        !numbers(s.player, ['x', 'y', 'hp', 'maxHp', 'invincible', 'facing']) ||
        (s.state === 'lost' ? s.player.hp !== 0 : s.player.hp <= 0) ||
        s.player.maxHp < s.player.hp
      )
        return null;
      if (
        (s.slowed !== undefined &&
          (!Number.isFinite(s.slowed) || s.slowed < 0 || s.slowed > 0.65)) ||
        (s.nextEnemySkillAt !== undefined &&
          (!Number.isFinite(s.nextEnemySkillAt) || s.nextEnemySkillAt < 0))
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
            allowsSchool(s.path ?? 'dual', passive(id).school) &&
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
            ]) &&
            ENEMIES[e.type] &&
            (e.windup === undefined ||
              (Number.isFinite(e.windup) && e.windup >= 0 && e.windup <= 1.2)) &&
            (e.pendingSkill === undefined ||
              ['ranged', 'volley', 'nova', 'soul'].includes(e.pendingSkill)) &&
            (e.summonedBy === undefined ||
              (Number.isSafeInteger(e.summonedBy) && e.summonedBy > 0)) &&
            (e.pursuitCooldown === undefined || Number.isFinite(e.pursuitCooldown)) &&
            (e.bossStage === undefined ||
              (Number.isInteger(e.bossStage) &&
                e.bossStage >= 0 &&
                e.bossStage <= FINAL_TRIAL_STAGE)),
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
            (c.type === 'passive' &&
              PASSIVES.some((p) => p.id === c.id && allowsSchool(s.path ?? 'dual', p.school))),
        )
      )
        return null;
      if (s.startedImmortal !== undefined && typeof s.startedImmortal !== 'boolean') return null;
      const g = new Game(save, s.stage, s.difficulty, Math.random, s.path ?? 'dual');
      g.startedImmortal =
        s.startedImmortal ??
        realmInfo(
          Math.max(0, save.cultivation - (s.creditedCultivation ?? 0)),
          save.completed.includes(FINAL_TRIAL_STAGE),
        ).step === 24;
      g.tribulation = s.tribulation ?? 0;
      g.tribulationStep = s.tribulationStep ?? 0;
      g.tribulationNextAt = s.tribulationNextAt ?? 1.2;
      g.tribulationOpeningDamage = s.tribulationOpeningDamage ?? 0;
      g.spiritRoot = s.spiritRoot ?? 'heaven';
      g.baseHp =
        spiritRootInfo(g.spiritRoot).baseHp +
        save.training.vitality * 10 +
        realmBonuses(g.realm).hp;
      g.rootElements = rootElementsFor(g.spiritRoot, s.rootElements ?? save.rootElements, () => 0);
      const duration = STAGES[s.stage].minutes * 60;
      // 无时长标记的早期六境固定为 5–10 分钟，终关按旧十分钟迁移。
      const oldDuration = s.stageDuration ?? (g.isFinalTrial ? 600 : (s.stage + 5) * 60);
      const timeScale = g.tribulation ? 1 : duration / oldDuration;
      g.time = s.time * timeScale;
      g.level = Math.min(MAX_RUN_LEVEL, s.level);
      g.xp = g.level === MAX_RUN_LEVEL ? 0 : s.xp;
      g.kills = s.kills;
      g.creditedCultivation = s.creditedCultivation ?? 0;
      g.combatCultivation = s.combatCultivation ?? 0;
      g.iron = s.iron;
      g.rerolls = s.rerolls;
      g.player = { ...s.player, moving: false };
      g.slowed = s.slowed ?? 0;
      if (
        s.nextMedicinePulse !== undefined &&
        (!Number.isFinite(s.nextMedicinePulse) || s.nextMedicinePulse < 0)
      )
        return null;
      g.nextMedicinePulse = s.nextMedicinePulse ?? 0;
      g.nextEnemySkillAt = s.nextEnemySkillAt ?? 0;
      g.weapons = s.weapons.map((w) => ({ ...w }));
      g.passives = { ...s.passives };
      const maxHp = g.maximumHealth;
      if (
        s.medicineHpFactor !== undefined &&
        (!Number.isFinite(s.medicineHpFactor) || s.medicineHpFactor <= 0)
      )
        return null;
      const growth =
        Math.round((maxHp * (s.medicineHpFactor ?? 1)) / g.medicine.hp) - g.player.maxHp;
      // 旧对局补齐境界收益，保留已损失气血；新快照的差额为零。
      g.player.hp = Math.max(1, Math.min(maxHp, g.player.hp + growth));
      g.player.maxHp = maxHp;
      g.enemies = s.enemies.map((e) => ({ ...e }));
      for (const e of g.enemies) if (e.boss && !e.dead && e.charge > 0.7) g.bossChargeWarning(e);
      g.shots = s.shots.map((b) => ({ ...b, hit: new Set(b.hit) }));
      g.zones = s.zones.map((z) => ({ ...z }));
      g.pickups = s.pickups
        .filter((p) => !g.isFinalTrial || p.kind !== 'heal')
        .map((p) => ({ ...p }));
      g.choices = s.choices.map((c) => ({ ...c }));
      g.bossSpawned = s.bossSpawned;
      g.trialBossesDefeated = Math.min(s.trialBossesDefeated ?? 0, TRIAL_BOSS_STAGES.length);
      if (s.trialBossSchedule === 3 || s.trialBossSchedule === 4) {
        if (
          !Number.isInteger(s.trialBossesSpawned) ||
          s.trialBossesSpawned < g.trialBossesDefeated ||
          s.trialBossesSpawned > TRIAL_BOSS_STAGES.length
        )
          return null;
        g.trialBossesSpawned = s.trialBossesSpawned;
      } else {
        g.trialBossesSpawned = Math.min(
          TRIAL_BOSS_STAGES.length,
          g.trialBossesDefeated + g.enemies.filter((e) => e.boss && !e.dead).length,
        );
      }
      g.nextTrialBossAt =
        TRIAL_BOSS_TIMES[g.trialBossesSpawned] ?? STAGES[FINAL_TRIAL_STAGE].minutes * 60;
      g.nextElite = s.nextElite * timeScale;
      g.damageDealt = s.damageDealt;
      if (s.damageBySource !== undefined) {
        if (!s.damageBySource || typeof s.damageBySource !== 'object') return null;
        for (const [id, amount] of Object.entries(s.damageBySource)) {
          if (
            !(TREASURES.some((t) => t.id === id) || id === 'bone' || id === 'other') ||
            !Number.isFinite(amount) ||
            amount < 0
          )
            return null;
          g.damageBySource[id] = amount;
        }
        if (Object.values(g.damageBySource).reduce((sum, n) => sum + n, 0) > g.damageDealt + 0.01)
          return null;
      }
      if (
        s.bossCultivation !== undefined &&
        (!Number.isFinite(s.bossCultivation) || s.bossCultivation < 0)
      )
        return null;
      g.bossCultivation = s.bossCultivation ?? 0;
      // 旧版可复活十次：保留续局已用次数，新版不补发复活机会。
      if (
        s.revivesUsed !== undefined &&
        (!Number.isInteger(s.revivesUsed) || s.revivesUsed < 0 || s.revivesUsed > 10)
      )
        return null;
      g.revivesUsed = s.revivesUsed ?? 0;
      g.spawnBudget = s.spawnBudget;
      g.serial = s.serial;
      g.state = s.state === 'upgrade' && s.level <= MAX_RUN_LEVEL ? 'upgrade' : 'paused';
      if (s.level > MAX_RUN_LEVEL) g.choices = [];
      if (g.state === 'upgrade' && !g.choices.length) return null;
      if (g.state === 'upgrade' && g.choices.length === 1) {
        g.choose(0);
        g.state = 'paused';
      }
      if (s.state === 'lost') {
        g.state = 'lost';
        g.player.hp = 0;
      }
      g.announce('重续仙缘 · 上次历练已恢复');
      g.creditCultivation();
      g.recordRunAchievements();
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
    if (!this.tribulation) {
      this.save.age += (dt * STAGE_YEARS_PER_MINUTE[this.stage]) / 60;
      if (tribulationDue(this.save)) {
        this.save.age = this.save.nextTribulationAge;
        this.pause();
        return;
      }
    }
    if (this.save.age >= this.lifespan - 1e-9) {
      this.save.age = this.lifespan;
      this.player.hp = 0;
      this.state = 'lost';
      this.onEvent('lose');
      return;
    }
    if (this.save.age >= this.medicine.expiresAt) {
      this.medicine = medicineEffects(this.save.medicine, this.save.age);
      this.player.maxHp = this.maximumHealth;
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    }
    if (this.medicine.frost && this.time >= this.nextMedicinePulse) {
      this.nextMedicinePulse = this.time + 8;
      for (const enemy of this.enemies)
        if (!enemy.dead && distance(enemy, this.player) <= 180)
          enemy.slow = Math.max(enemy.slow, 2);
      this.effect(this.player.x, this.player.y, 0.6, 180, '#b8e5ef', 'pulse');
    }
    const progress = Math.min(1, this.time / (STAGES[this.stage].minutes * 60));
    this.noticeTime -= dt;
    this.slowed = Math.max(0, this.slowed - dt);
    const p = this.player,
      stats = this.stats;
    p.invincible = Math.max(0, p.invincible - dt);
    this.heal(stats.regen * dt);
    const length = Math.hypot(this.input.x, this.input.y);
    p.moving = length > 0.05;
    if (p.moving) {
      p.x += (this.input.x / Math.max(1, length)) * stats.speed * dt;
      p.y += (this.input.y / Math.max(1, length)) * stats.speed * dt;
      if (Math.abs(this.input.x) > 0.05) p.facing = this.input.x > 0 ? 1 : -1;
    }
    if (this.tribulation) {
      const radius = Math.hypot(p.x, p.y);
      if (radius > this.tribulationRadius - 15) {
        p.x *= (this.tribulationRadius - 15) / radius;
        p.y *= (this.tribulationRadius - 15) / radius;
      }
      if (this.boss) this.boss.flash = Math.max(0, this.boss.flash - dt);
      this.updateTribulation();
    } else {
      this.spawnBudget +=
        dt *
        (this.isFinalTrial
          ? 1 + 8 * progress ** 1.3
          : 0.85 +
            this.stage * 0.12 +
            (STAGES[this.stage].minutes * 60 * 0.017 + this.stage * 0.18 + 0.45) *
              progress ** 1.3) *
        DIFFICULTIES[this.difficulty].amount *
        (this.isFinalTrial ? (this.boss ? 0.7 : 1) : (this.bossSpawned ? 0.32 : 1) * 1.25);
      while (this.spawnBudget >= 1) {
        this.spawnBudget--;
        if (this.enemies.length < (this.isFinalTrial ? 210 : 240)) this.spawnEnemy();
      }
      if (!this.isFinalTrial && this.time >= this.nextElite && !this.bossSpawned) {
        const available = enemyRoster(this.stage, this.time);
        const elites = available.filter((type) =>
          ['tank', 'shield'].includes(ENEMIES[type].behavior),
        );
        this.spawnEnemy(elites.at(-1) ?? available.at(-1), true);
        if (progress >= 0.5) this.spawnEnemy(available.at(-1), true);
        this.nextElite += this.eliteInterval;
        this.announce('精英现身 · 击败可得炼器宝匣');
      }
      if (this.isFinalTrial) {
        while (
          this.trialBossesSpawned < TRIAL_BOSS_STAGES.length &&
          this.time >= this.nextTrialBossAt
        ) {
          const bossStage = TRIAL_BOSS_STAGES[this.trialBossesSpawned];
          this.bossSpawned = true;
          this.spawnEnemy(10, false, true, undefined, bossStage);
          this.trialBossesSpawned++;
          this.nextTrialBossAt =
            TRIAL_BOSS_TIMES[this.trialBossesSpawned] ?? STAGES[FINAL_TRIAL_STAGE].minutes * 60;
          this.announce(`第 ${this.trialBossesSpawned} / 7 劫 · ${STAGES[bossStage].boss}降临`);
          this.onEvent('boss');
        }
      } else if (!this.bossSpawned && this.remaining === 0) {
        this.bossSpawned = true;
        this.spawnEnemy(10, false, true);
        this.announce(`${STAGES[this.stage].boss}降临 · 小心红色预警`);
        this.onEvent('boss');
      }
    }
    for (const w of this.weapons) {
      w.timer -= dt;
      if (w.timer <= 0) {
        this.cast(w);
        w.timer = treasure(w.id).cooldown * stats.cooldown * (w.evolved ? 0.7 : 1);
      }
    }
    if (!this.tribulation) this.updateEnemies(dt);
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
    if (this.state === 'playing' && this.level < MAX_RUN_LEVEL && this.xp >= xpNeeded(this.level)) {
      this.xp -= xpNeeded(this.level);
      this.level++;
      if (this.level === MAX_RUN_LEVEL) this.xp = 0;
      this.recordRunAchievements();
      this.creditCultivation();
      this.state = 'upgrade';
      this.choices = this.makeChoices();
      if (this.choices.length === 1) this.choose(0);
      else {
        this.onEvent('upgrade');
        this.input = { x: 0, y: 0 };
      }
    }
  }
  private updateTribulation() {
    const boss = this.boss;
    if (!boss) return;
    if (distance(this.player, boss) < boss.radius + 13) this.hurtPlayer(boss.damage);
    if (this.time < this.tribulationNextAt) return;
    const power = this.tribulation - 1;
    const rules = tribulationRules(this.tribulation);
    const warning = rules.warning;
    const step = this.tribulationStep;
    const aim = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    const speed = 190 + Math.min(6, power) * 25;
    const shoot = (angle: number, velocity = speed) => {
      this.hostileShot(boss, Math.cos(angle), Math.sin(angle), velocity, boss.damage * 0.85);
      const shot = this.shots[this.shots.length - 1];
      shot.color = '#d2b5ff';
      shot.radius = 8;
      shot.life = 3.8;
    };
    const fan = (angle: number, count: number, spread: number) => {
      for (let i = 0; i < count; i++) shoot(angle + (i / (count - 1) - 0.5) * spread);
    };
    const strike = (x: number, y: number, radius: number, delay = warning) =>
      this.zone(x, y, radius, 0.5, boss.damage, '#d2b5ff', 'blast', delay, true);
    const ring = (radius: number, count: number, gap: number, size: number, delay = warning) => {
      for (let i = 0; i < count; i++) {
        if (gap >= 0 && (i - gap + count) % count < 3) continue;
        const angle = (i / count) * TAU;
        strike(Math.cos(angle) * radius, Math.sin(angle) * radius, size, delay);
      }
    };
    if (step === 0) {
      this.announce('天劫 · 追身三雷与雷弹 · 侧移离开标记');
      fan(aim, 3 + Math.min(4, power), 0.7);
      for (let i = 0; i < 3; i++)
        strike(
          this.player.x + this.input.x * 65 * i,
          this.player.y + this.input.y * 65 * i,
          50 + Math.min(15, power * 2),
          warning + i * 0.4,
        );
    } else if (step === 1) {
      this.announce('天劫 · 缺月雷环 · 寻找缺口');
      const count = Math.min(24, 14 + power);
      const gap = Math.floor(this.random() * count);
      for (let i = 0; i < count; i++) {
        if ((i - gap + count) % count >= 3) shoot((i / count) * TAU, speed * 0.85);
      }
      for (let wave = 0; wave < 3; wave++)
        ring(120 + wave * 120, count, gap, 38, warning + wave * 0.3);
      if (this.tribulation >= 3) strike(this.player.x, this.player.y, 55);
    } else if (step === 2) {
      this.announce('天劫 · 横贯雷柱与交叉弹幕 · 穿过空隙');
      for (let i = 0; i < 4; i++) fan((i * TAU) / 4 + this.time * 0.17, 3, 0.32);
      const vertical = Math.floor(this.time / 10) % 2 === 0;
      const gap = Math.floor(this.random() * 7) - 3;
      for (let i = -6; i <= 6; i++) {
        if (i === gap || i === gap + 1) continue;
        strike(vertical ? 0 : i * 70, vertical ? i * 70 : 0, 38);
        if (this.tribulation >= 5) strike(vertical ? i * 70 : 0, vertical ? 0 : i * 70, 38);
      }
    } else if (step === 3) {
      this.announce('天劫 · 雷界收束与散射 · 返回内圈');
      fan(aim, 5 + Math.min(6, power), Math.PI * 1.2);
      ring(365, 24, -1, 68);
      if (this.tribulation >= 4) strike(this.player.x, this.player.y, 55);
    } else {
      this.zones = this.zones.filter((zone) => !zone.hostile);
      this.shots = this.shots.filter((s) => s.kind !== 'hostile');
      this.tribulationOpeningDamage = 0;
      this.announce('天劫核心显露 · 御器反击');
      this.tribulationStep = 0;
      this.tribulationNextAt = this.time + rules.opening;
      return;
    }
    this.tribulationStep++;
    this.tribulationNextAt = this.time + rules.interval;
  }
  spawnEnemy(
    type?: number,
    elite = false,
    boss = false,
    at?: Point,
    bossStage = this.isFinalTrial ? TRIAL_BOSS_STAGES[this.trialBossesDefeated] : this.stage,
  ) {
    if (this.isFinalTrial && !boss) elite = true;
    const available = enemyRoster(this.stage, this.time);
    if (type === undefined) {
      const pool =
        available.length > 3
          ? this.random() < 0.65
            ? available.slice(-3)
            : available.slice(0, -3)
          : available;
      type = pool[Math.floor(this.random() * pool.length)];
    }
    const template = ENEMIES[type],
      angle = this.random() * TAU;
    const difficulty = DIFFICULTIES[this.difficulty];
    const scaling = STAGE_COMBAT_SCALING[this.stage];
    const eliteScaling = elite && !boss ? scaling.elite : undefined;
    const progress = Math.min(1, this.time / (STAGES[this.stage].minutes * 60));
    // 终关缩短至七分钟，仍按进度抵达原十分钟的气血峰值。
    const strengthTime = this.isFinalTrial ? progress * 600 : this.time;
    const strength = (1 + strengthTime / 260) * (1 + this.stage * 0.22);
    const hp = boss
      ? (this.isFinalTrial
          ? bossStage === FINAL_TRIAL_STAGE
            ? 560000
            : 120000 + bossStage * 35000
          : 16000 + this.stage * 11000) * difficulty.hp
      : template.hp * strength * difficulty.hp * (elite ? 7 : 1) * (eliteScaling?.hp ?? 1);
    const enemy: Enemy = {
      id: ++this.serial,
      type,
      x: at?.x ?? this.player.x + Math.cos(angle) * (this.viewport.width / 2 + 70),
      y: at?.y ?? this.player.y + Math.sin(angle) * (this.viewport.height / 2 + 70),
      hp: hp * scaling.hp,
      maxHp: hp * scaling.hp,
      radius: boss
        ? bossStage === FINAL_TRIAL_STAGE
          ? 62
          : 48
        : template.radius * (elite ? 1.55 : 1),
      speed: boss
        ? 70 + this.stage * 4
        : (this.isFinalTrial
            ? Math.max(95 + progress * 35, template.speed * (1.05 + progress * 0.3))
            : template.speed) *
          (1 + progress * 0.3) *
          (elite ? 1.1 : 1) *
          (eliteScaling?.speed ?? 1),
      damage:
        (boss
          ? this.isFinalTrial
            ? bossStage === FINAL_TRIAL_STAGE
              ? 220
              : 85 + bossStage * 10
            : 52 + this.stage * 16
          : template.damage * (1 + this.stage * 0.12)) *
        (boss ? 1 : this.isFinalTrial ? 1.1 + progress * 0.9 : 1 + progress * 0.35) *
        difficulty.damage *
        (boss || elite ? scaling.damage : 1 + (scaling.damage - 1) * 0.65) *
        (this.isFinalTrial || boss ? 1 : elite ? 2.2 : 1.3) *
        (eliteScaling?.damage ?? 1),
      elite,
      boss,
      bossStage: boss ? bossStage : undefined,
      pursuitCooldown: boss ? 2.5 : undefined,
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
    const progress = Math.min(1, this.time / (STAGES[this.stage].minutes * 60));
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.slow -= dt;
      e.flash -= dt;
      e.cooldown -= dt;
      let d = distance(e, p),
        nx = (p.x - e.x) / (d || 1),
        ny = (p.y - e.y) / (d || 1);
      const baseBehavior = ENEMIES[e.type].behavior;
      const behavior =
        this.isFinalTrial && enemyWave(this.stage, this.time) >= 1 && baseBehavior === 'chase'
          ? 'dash'
          : baseBehavior;
      if (e.boss) {
        e.pursuitCooldown = (e.pursuitCooldown ?? 2.5) - dt;
        if (d > 330 && e.charge <= 0 && e.pursuitCooldown <= 0) {
          this.startBossCharge(e, nx, ny);
          this.announce(`${STAGES[e.bossStage ?? this.stage].boss} · 裂空追袭`);
        }
      }
      const charging = e.charge > 0;
      const winding = !e.boss && this.stage < FINAL_TRIAL_STAGE && (e.windup ?? 0) > 0;
      if (winding) {
        e.windup = Math.max(0, e.windup! - dt);
        if (e.windup === 0 && e.pendingSkill) {
          this.fireEnemyVolley(e, e.pendingSkill);
          e.pendingSkill = undefined;
        }
      } else if (e.charge > 0) {
        const before = e.charge;
        e.charge = Math.max(0, e.charge - dt);
        if (e.boss) {
          const movement = (Math.min(0.7, before) - Math.min(0.7, e.charge)) * 820;
          e.x += e.dx * movement;
          e.y += e.dy * movement;
        } else if (this.stage < FINAL_TRIAL_STAGE) {
          const movement = (Math.min(0.55, before) - Math.min(0.55, e.charge)) * 380;
          e.x += e.dx * movement;
          e.y += e.dy * movement;
        } else if (e.charge < 0.55) {
          e.x += e.dx * 380 * dt;
          e.y += e.dy * 380 * dt;
        }
      } else {
        const move =
          ['ranged', 'volley', 'nova', 'summon'].includes(behavior) && d < 240 && !e.boss
            ? d < 160
              ? -0.4
              : 0
            : 1;
        const speed = e.speed * (e.slow > 0 ? 0.35 : 1) * move;
        if (
          !e.boss &&
          this.stage < FINAL_TRIAL_STAGE &&
          ENEMY_TACTICS[e.type].flank &&
          d > 100 &&
          d < 420
        ) {
          // 狼与剑卒分左右绕行，接近后收拢；不会额外提高移动速度。
          const side = e.id % 2 ? 0.65 : -0.65;
          const norm = Math.hypot(1, side);
          e.x += ((nx - ny * side) / norm) * speed * dt;
          e.y += ((ny + nx * side) / norm) * speed * dt;
        } else {
          e.x += nx * speed * dt;
          e.y += ny * speed * dt;
        }
      }
      if (e.boss && !charging && e.cooldown <= 0) {
        this.castBossSkill(e, nx, ny);
      } else if (!e.boss && this.stage < FINAL_TRIAL_STAGE) {
        if (!charging && !winding && e.cooldown <= 0 && this.time >= this.nextEnemySkillAt)
          this.castEnemySkill(e, d, nx, ny);
      } else if (!e.boss && e.cooldown <= 0) {
        e.cooldown = this.isFinalTrial
          ? 4.2 - progress * 2.1 + this.random() * 1.2
          : 4 - progress * 1.3 + this.random() * 2;
        if (behavior === 'ranged' && d < 600)
          this.hostileShot(
            e,
            nx,
            ny,
            this.isFinalTrial ? 150 + progress * 55 : 145 + progress * 30,
            e.damage,
          );
        if (behavior === 'volley' && d < 600) {
          const angle = Math.atan2(ny, nx);
          for (const offset of [-0.24, 0, 0.24])
            this.hostileShot(
              e,
              Math.cos(angle + offset),
              Math.sin(angle + offset),
              140 + progress * (this.isFinalTrial ? 45 : 30),
              e.damage * 0.8,
            );
        }
        if (behavior === 'nova' && d < 550) {
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * TAU + this.time * 0.15;
            this.hostileShot(
              e,
              Math.cos(angle),
              Math.sin(angle),
              105 + progress * (this.isFinalTrial ? 45 : 25),
              e.damage * 0.7,
            );
          }
        }
        if (behavior === 'dash' && d < (this.isFinalTrial ? 460 : 330)) {
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
        if (behavior === 'summon' && this.enemies.length < (this.isFinalTrial ? 208 : 230)) {
          this.spawnEnemy(STAGE_ENEMIES[this.stage][0], false, false, {
            x: e.x + 35,
            y: e.y,
          });
          this.spawnEnemy(STAGE_ENEMIES[this.stage][0], false, false, {
            x: e.x - 35,
            y: e.y,
          });
        }
        if (this.isFinalTrial && behavior === 'tank' && d < 500)
          this.zone(p.x, p.y, 70, 0.5, e.damage, '#ef8a7a', 'blast', 1.1, true);
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
  private bossChargeWarning(e: Enemy) {
    this.effect(
      e.x,
      e.y,
      e.charge - 0.7,
      e.radius + 13,
      '#f2a174',
      'line',
      undefined,
      e.x + e.dx * 574,
      e.y + e.dy * 574,
    );
  }
  private castEnemySkill(e: Enemy, distance: number, nx: number, ny: number) {
    const tactics = ENEMY_TACTICS[e.type];
    const skill = e.elite ? tactics.eliteSkill : tactics.skill;
    if (
      !skill ||
      distance > 540 ||
      (skill === 'stomp' && distance > 180) ||
      (skill === 'dash' && distance > 360)
    )
      return;
    const projectile = ['ranged', 'volley', 'nova', 'soul'].includes(skill);
    const circles = ['roots', 'firepath', 'frost', 'miasma', 'storm', 'stomp'].includes(skill);
    // 前六境技能共享弹幕与地面区域预算；妖王独立施法，避免小怪挤满画面。
    if (projectile && this.shots.filter((b) => b.kind === 'hostile').length >= 60) return;
    if (circles && this.zones.filter((z) => z.hostile).length > 9) return;
    if (
      skill === 'summon' &&
      this.enemies.filter((v) => !v.dead && v.summonedBy !== undefined).length >= 12
    )
      return;
    e.cooldown = (e.elite ? 5.5 : 4.5) + this.random() * 2;
    this.nextEnemySkillAt = this.time + 0.18;
    e.dx = nx;
    e.dy = ny;
    if (skill === 'dash') {
      e.charge = 1.25;
      return;
    }
    if (projectile) {
      e.windup = 0.65;
      e.pendingSkill = skill;
      return;
    }
    if (skill === 'summon') {
      const count = Math.min(
        e.elite ? 3 : 2,
        240 - this.enemies.length,
        12 - this.enemies.filter((v) => !v.dead && v.summonedBy !== undefined).length,
      );
      const pool = enemyRoster(this.stage, this.time).slice(0, 2);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        const summoned = this.spawnEnemy(pool[i % pool.length], false, false, {
          x: e.x + Math.cos(a) * 40,
          y: e.y + Math.sin(a) * 40,
        });
        summoned.summonedBy = e.id;
      }
      this.effect(e.x, e.y, 0.7, 60, '#c8b9df', 'pulse');
      e.windup = 0.7;
      return;
    }
    e.windup = 0.9;
    const p = { x: this.player.x, y: this.player.y };
    const circle = (
      x: number,
      y: number,
      radius: number,
      life: number,
      color: string,
      delay = 0.9,
    ) => this.zone(x, y, radius, life, e.damage * 0.8, color, `enemy-${skill}`, delay, true);
    if (skill === 'stomp') {
      circle(e.x, e.y, 92, 0.25, '#e9bf85');
      if (e.elite) circle(e.x + nx * 115, e.y + ny * 115, 92, 0.25, '#e9bf85', 1.4);
    } else if (skill === 'firepath') {
      const count = e.elite ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const along = (i - (count - 1) / 2) * 75;
        circle(p.x + nx * along, p.y + ny * along, 42, 2.5, '#ef9c6c');
      }
    } else if (skill === 'storm') {
      circle(p.x, p.y, 52, 0.25, '#e9d391');
      if (e.elite)
        for (const side of [-1, 1])
          circle(
            p.x - ny * side * 95,
            p.y + nx * side * 95,
            48,
            0.25,
            '#e9d391',
            side < 0 ? 1.2 : 1.5,
          );
    } else {
      const color = skill === 'frost' ? '#a8e1f4' : skill === 'roots' ? '#a2dba4' : '#bdcc79';
      for (const side of e.elite ? [-45, 45] : [0])
        circle(
          p.x - ny * side,
          p.y + nx * side,
          skill === 'miasma' ? 54 : 48,
          skill === 'miasma' ? 3.2 : 1.6,
          color,
        );
    }
  }
  private fireEnemyVolley(e: Enemy, skill: EnemySkill) {
    const count =
      skill === 'nova'
        ? e.elite
          ? 10
          : 8
        : skill === 'volley'
          ? e.elite
            ? 5
            : 3
          : skill === 'soul'
            ? e.elite
              ? 4
              : 2
            : 1;
    const available = 64 - this.shots.filter((b) => b.kind === 'hostile').length;
    const angle = Math.atan2(e.dy, e.dx);
    for (let i = 0; i < Math.min(count, available); i++) {
      if (skill === 'soul') {
        const side = (i - (count - 1) / 2) * 65;
        const from = { x: e.x - e.dy * side, y: e.y + e.dx * side };
        const dx = e.dx * 300 + e.dy * side,
          dy = e.dy * 300 - e.dx * side;
        const length = Math.hypot(dx, dy);
        this.hostileShot(from, dx / length, dy / length, 165, e.damage * 0.8);
      } else {
        const a =
          skill === 'nova' ? angle + (i / count) * TAU : angle + (i - (count - 1) / 2) * 0.24;
        this.hostileShot(e, Math.cos(a), Math.sin(a), skill === 'nova' ? 120 : 165, e.damage * 0.8);
      }
    }
  }
  private startBossCharge(e: Enemy, nx: number, ny: number, warning = 0.85) {
    e.charge = warning + 0.7;
    e.dx = nx;
    e.dy = ny;
    e.pursuitCooldown = e.hp < e.maxHp / 2 ? 6.5 : 9;
    e.cooldown = Math.max(e.cooldown, e.charge + 0.5);
    this.bossChargeWarning(e);
  }
  private castBossSkill(e: Enemy, nx: number, ny: number) {
    const stage = e.bossStage ?? this.stage;
    const phase = e.skillStep ?? 0;
    e.skillStep = (phase + 1) % STAGES[stage].skills.length;
    const enraged = e.hp < e.maxHp / 2;
    e.cooldown =
      stage === FINAL_TRIAL_STAGE
        ? enraged
          ? 1.25
          : 2.1
        : this.isFinalTrial
          ? enraged
            ? 1.8
            : 2.6
          : enraged
            ? 2.3
            : 3.8;
    const p = { x: this.player.x, y: this.player.y };
    const angle = Math.atan2(ny, nx);
    const fan = (count: number, spread: number, speed: number, center = angle) => {
      for (let i = 0; i < count; i++) {
        const a = center + (i / Math.max(1, count - 1) - 0.5) * spread;
        this.hostileShot(e, Math.cos(a), Math.sin(a), speed, e.damage * 0.75);
      }
    };
    const ring = (count: number, speed: number) =>
      fan(count, (TAU * (count - 1)) / count, speed, this.time * 0.25);
    const blast = (x: number, y: number, radius: number, life = 0.5) =>
      this.zone(x, y, radius, life, e.damage, STAGES[stage].color, 'blast', 1.2, true);
    const ringZones = (count: number, radius: number, size: number, life = 0.5) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        blast(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, size, life);
      }
    };
    const summons = (count: number) => {
      const pool = stage === FINAL_TRIAL_STAGE ? [24, 25] : enemyRoster(this.stage, this.time);
      for (let i = 0; i < count && this.enemies.length < (this.isFinalTrial ? 210 : 240); i++)
        this.spawnEnemy(pool[Math.floor(this.random() * pool.length)], false, false, {
          x: e.x + Math.cos((i / count) * TAU) * 90,
          y: e.y + Math.sin((i / count) * TAU) * 90,
        });
    };
    this.announce(`${STAGES[stage].boss} · ${STAGES[stage].skills[phase]}`);
    switch (stage) {
      case 0:
        if (phase === 0) ringZones(6, 130, 42, 2);
        else if (phase === 1) fan(7, 1.15, 165);
        else summons(3);
        break;
      case 1:
        if (phase === 0) fan(9, 1.5, 180);
        else if (phase === 1) for (let i = -2; i <= 2; i++) blast(p.x + i * 85, p.y, 50, 3);
        else ring(16, 150);
        break;
      case 2:
        if (phase === 0) {
          this.startBossCharge(e, nx, ny);
        } else if (phase === 1) fan(7, 0.95, 205);
        else ringZones(8, 145, 46, 2);
        break;
      case 3:
        if (phase === 0) ringZones(5, 110, 62, 5);
        else if (phase === 1) fan(5, 0.75, 160);
        else summons(4);
        break;
      case 4:
        if (phase === 0) summons(4);
        else if (phase === 1) ring(20, 165);
        else {
          ringZones(6, 165, 52, 2);
          blast(p.x, p.y, 60);
        }
        break;
      case 5:
        if (phase === 0) {
          for (let i = -2; i <= 2; i++) {
            blast(p.x + i * 105, p.y, 48);
            if (i !== 0) blast(p.x, p.y + i * 105, 48);
          }
        } else if (phase === 1) ring(22, 175);
        else ringZones(5, 95, 70);
        break;
      case FINAL_TRIAL_STAGE:
        if (phase === 0) ring(enraged ? 32 : 24, 185);
        else if (phase === 1)
          for (let i = -2; i <= 2; i++) blast(p.x + i * 105, p.y + (i % 2) * 65, 88);
        else if (phase === 2) {
          ringZones(8, 180, 60);
          blast(p.x, p.y, 80);
        } else if (phase === 3) {
          fan(enraged ? 15 : 11, Math.PI * 1.2, 230);
        } else if (phase === 4) {
          summons(6);
        } else {
          this.startBossCharge(e, nx, ny, 1);
          blast(e.x, e.y, 85);
        }
        break;
    }
  }
  private nearest(at: Point, excluded = new Set<number>(), range = 950) {
    let result: Enemy | undefined,
      nearest = range * range;
    for (const e of this.enemies) {
      const d = distanceSquared(e, at);
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
      (1 + forgeDamageBonus(this.save.forge[w.id] || 0)) *
      (w.evolved ? 1.8 : 1) *
      (1 + weaponRootBonus(this.spiritRoot, this.rootElements, t));
    const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : this.time;
    const radius = (95 + w.level * 7) * s.area;
    const launch = (angle: number, from: Point = p, options: Partial<Shot> = {}) => {
      const crit = this.random() < s.crit;
      this.shots.push({
        x: from.x,
        y: from.y,
        vx: Math.cos(angle) * 360,
        vy: Math.sin(angle) * 360,
        life: 2.2 * s.duration,
        radius: 9 * s.area,
        damage: dmg * (crit ? s.criticalDamage : 1),
        color: t.color,
        kind: w.id,
        pierce: 1,
        hit: new Set(),
        origin: { x: from.x, y: from.y },
        age: 0,
        bounce: 0,
        crit,
        ...options,
      });
    };
    if (w.id === 'umbrella') {
      let blocked = 0;
      for (const b of this.shots) {
        if (b.kind === 'hostile' && b.life > 0 && distance(b, p) < radius * 1.6) {
          b.life = 0;
          blocked++;
        }
      }
      this.areaDamage(p, radius * 1.6, dmg, 'pulse', w.id);
      this.effect(p.x, p.y, 0.7, radius * 1.6, t.color, 'umbrella');
      for (let i = 0; i < Math.min(blocked, 8); i++)
        launch(a + (i - (Math.min(blocked, 8) - 1) / 2) * 0.2, p, { pierce: 3 });
      return;
    }
    if (w.id === 'cauldron') {
      this.zone(p.x, p.y, radius * (w.evolved ? 1.5 : 1.15), 3 * s.duration, dmg, t.color, w.id);
      return;
    }
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
    if (w.id === 'qin') {
      for (let i = 0; i < count + 2; i++)
        launch(a + (i - (count + 1) / 2) * 0.23, p, {
          vx: Math.cos(a + (i - (count + 1) / 2) * 0.23) * 230,
          vy: Math.sin(a + (i - (count + 1) / 2) * 0.23) * 230,
          radius: 17 * s.area,
          pierce: 3 + w.level,
        });
      return;
    }
    if (w.id === 'brush') {
      for (let i = 1; i <= 3 + (w.evolved ? 2 : 0); i++)
        this.zone(
          p.x + Math.cos(a) * i * 85,
          p.y + Math.sin(a) * i * 85,
          68 * s.area,
          0.3,
          dmg,
          t.color,
          w.id,
          i * 0.18,
        );
      return;
    }
    if (w.id === 'pagoda') {
      this.zone(
        p.x + Math.cos(a) * 65,
        p.y + Math.sin(a) * 65,
        (210 + w.level * 15) * s.area,
        4.5 * s.duration,
        dmg,
        t.color,
        w.id,
      );
      return;
    }
    if (w.id === 'banner') {
      for (let i = 0; i < 3 + (w.evolved ? 2 : 0); i++) {
        const angle = a + (i * TAU) / (w.evolved ? 5 : 3);
        this.zone(
          p.x + Math.cos(angle) * radius,
          p.y + Math.sin(angle) * radius,
          75 * s.area,
          2.5 * s.duration,
          dmg,
          t.color,
          w.id,
          i * 0.18,
        );
      }
      return;
    }
    if (w.id === 'flute' || w.id === 'nail') {
      for (let i = 0; i < count + (w.id === 'nail' ? 1 : 0); i++) {
        const angle = a + (i - (count - 1) / 2) * 0.2;
        const speed = w.id === 'nail' ? 530 : 260;
        launch(angle, p, {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: (w.id === 'nail' ? 1.3 : 3.5) * s.duration,
          radius: (w.id === 'nail' ? 5 : 12) * s.area,
        });
      }
      return;
    }
    if (w.id === 'beads' || w.id === 'skull') {
      for (let i = 0; i < count + 1; i++) {
        const angle = this.time + (i * TAU) / (count + 1);
        const from = { x: p.x + Math.cos(angle) * 65, y: p.y + Math.sin(angle) * 65 };
        const aim = Math.atan2(target.y - from.y, target.x - from.x);
        launch(aim, from, {
          vx: Math.cos(aim) * 210,
          vy: Math.sin(aim) * 210,
          bounce: w.id === 'beads' ? 2 + w.level : 0,
          pierce: w.id === 'skull' ? 3 : 1,
          radius: (w.id === 'skull' ? 15 : 8) * s.area,
          life: 4 * s.duration,
        });
      }
      return;
    }
    if (w.id === 'compass') {
      const rays = w.evolved ? 8 : 4;
      for (let i = 0; i < rays; i++) {
        const angle = a + (i * TAU) / rays;
        this.beam(
          p,
          { x: p.x + Math.cos(angle) * 420 * s.area, y: p.y + Math.sin(angle) * 420 * s.area },
          18 * s.area,
          dmg,
          t.color,
          w.id,
        );
      }
      return;
    }
    if (w.id === 'spear') {
      launch(a, p, {
        vx: Math.cos(a) * 720,
        vy: Math.sin(a) * 720,
        pierce: 8 + w.level,
        radius: 12 * s.area,
      });
      return;
    }
    if (w.id === 'scythe') {
      const reach = radius * 1.8;
      this.effect(
        p.x,
        p.y,
        0.55,
        reach,
        t.color,
        'cleave',
        undefined,
        p.x + Math.cos(a),
        p.y + Math.sin(a),
      );
      for (const e of this.enemies) {
        const d = distance(e, p);
        const dot = ((e.x - p.x) * Math.cos(a) + (e.y - p.y) * Math.sin(a)) / (d || 1);
        if (d < reach + e.radius && (w.evolved || dot > -0.15))
          this.hitEnemy(e, dmg * (e.hp / e.maxHp < 0.3 ? 2 : 1), false, w.id);
      }
      return;
    }
    if (w.id === 'coffin') {
      const r = (w.evolved ? 115 : 85) * s.area;
      this.zone(target.x, target.y, r, 0.3, dmg, t.color, w.id, 0.85);
      this.zone(target.x, target.y, r, 3 * s.duration, dmg * 0.15, t.color, 'grave', 1.1);
      return;
    }
    if (w.id === 'whip') {
      this.beam(
        p,
        { x: p.x + Math.cos(a) * 330 * s.area, y: p.y + Math.sin(a) * 330 * s.area },
        (w.evolved ? 42 : 27) * s.area,
        dmg,
        t.color,
        w.id,
        true,
      );
      return;
    }
    if (w.id === 'bloodpool') {
      this.zone(
        target.x,
        target.y,
        (w.evolved ? 140 : 100) * s.area,
        3.5 * s.duration,
        dmg,
        t.color,
        w.id,
      );
      return;
    }
    if (w.id === 'nest' || w.id === 'sand') {
      for (let i = 0; i < count + 2; i++) {
        const angle = i * 2.4 + this.time;
        const spread = i === 0 ? 0 : 45 + i * 16;
        this.zone(
          target.x + Math.cos(angle) * spread,
          target.y + Math.sin(angle) * spread,
          (w.id === 'nest' ? 58 : 68) * s.area,
          0.3,
          dmg,
          t.color,
          w.id,
          (w.id === 'nest' ? 0.7 : 0.3) + i * 0.14,
        );
      }
      return;
    }
    if (w.id === 'shard') {
      for (let i = 0; i < count; i++) launch(a + (i - (count - 1) / 2) * 0.14, p, { bounce: -1 });
      return;
    }
    if (w.id === 'axe') {
      this.zone(
        p.x + Math.cos(a) * 110,
        p.y + Math.sin(a) * 110,
        radius * (w.evolved ? 1.8 : 1.35),
        0.3,
        dmg,
        t.color,
        w.id,
        0.35,
      );
      return;
    }
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
        this.hitEnemy(current, dmg, false, w.id);
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
        damage: dmg * (crit ? s.criticalDamage : 1),
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
      if (['flute', 'nail', 'skull'].includes(b.kind)) {
        const target = this.nearest(b, b.hit, 600);
        if (target) {
          const d = distance(b, target) || 1;
          const speed = Math.hypot(b.vx, b.vy);
          const turn = Math.min(1, dt * (b.kind === 'nail' ? 7 : 3));
          const x = b.vx * (1 - turn) + ((target.x - b.x) / d) * speed * turn;
          const y = b.vy * (1 - turn) + ((target.y - b.y) / d) * speed * turn;
          const norm = Math.hypot(x, y) || 1;
          b.vx = (x / norm) * speed;
          b.vy = (y / norm) * speed;
        }
      }
      if (b.kind === 'qin') b.radius += dt * 8;
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
      if (b.life <= 0) continue;
      if (b.kind === 'hostile') {
        if (distance(b, this.player) < b.radius + 12) {
          this.hurtPlayer(b.damage);
          b.life = 0;
        }
        continue;
      }
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (e.dead || b.hit.has(e.id) || distanceSquared(b, e) > (b.radius + e.radius) ** 2)
          continue;
        b.hit.add(e.id);
        this.hitEnemy(e, b.damage, b.crit, b.kind);
        b.pierce--;
        if (b.kind === 'shard' && b.bounce === -1) {
          b.bounce = 0;
          for (const offset of [-0.65, 0.65]) {
            const angle = Math.atan2(b.vy, b.vx) + offset;
            this.shots.push({
              ...b,
              vx: Math.cos(angle) * 380,
              vy: Math.sin(angle) * 380,
              life: 1.4 * this.stats.duration,
              pierce: 3,
              hit: new Set(b.hit),
              damage: b.damage * 0.6,
              radius: b.radius * 0.75,
              origin: { x: b.x, y: b.y },
            });
          }
        }
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
      if (
        this.stage < FINAL_TRIAL_STAGE &&
        z.hostile &&
        z.life > 0 &&
        ['enemy-roots', 'enemy-frost'].includes(z.kind) &&
        this.player.invincible <= 0 &&
        distance(z, this.player) < z.radius + 8
      )
        this.slowed = 0.65;
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
          if (distance(z, this.player) < z.radius + 8)
            this.hurtPlayer(
              z.damage *
                (z.kind === 'poison' || z.kind === 'enemy-miasma' ? this.medicine.poison : 1),
            );
        } else if (z.kind === 'pagoda') {
          const target = this.nearest(z, new Set(), z.radius);
          if (target) {
            this.effect(z.x, z.y, 0.3, 4, z.color, 'line', undefined, target.x, target.y);
            this.hitEnemy(target, z.damage, false, z.kind);
          }
        } else {
          const hits = this.enemies.some((e) => !e.dead && distance(e, z) < z.radius + e.radius);
          this.areaDamage(z, z.radius, z.damage, z.kind);
          if (hits && (z.kind === 'cauldron' || z.kind === 'bloodpool'))
            this.heal(z.kind === 'cauldron' ? 1 : 0.7);
        }
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
        if (item.kind === 'xp' && this.level < MAX_RUN_LEVEL) this.xp += item.value * s.xp;
        if (item.kind === 'heal' && !this.isFinalTrial) {
          this.heal(p.maxHp * 0.3);
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
          if (!this.isFinalTrial) this.heal(20);
          const candidates = this.weapons.filter((w) => w.level < MAX_WEAPON_LEVEL);
          if (candidates.length) {
            const w = candidates[Math.floor(this.random() * candidates.length)];
            w.level++;
            this.announce(`炼器宝匣 · ${treasure(w.id).name}升至${w.level}重 · 玄铁 +2`);
          } else {
            this.iron += 2;
            this.announce(`炼器宝匣 · 玄铁 +4${this.isFinalTrial ? '' : ' · 气血回复'}`);
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
      origin: { x: from.x, y: from.y },
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
  private areaDamage(
    at: Point,
    radius: number,
    damage: number,
    kind: string,
    source = kind === 'grave' ? 'coffin' : kind,
  ) {
    for (const e of this.enemies) {
      if (e.dead || distanceSquared(at, e) > (radius + e.radius) ** 2) continue;
      this.hitEnemy(e, damage, false, source);
      if (['ice', 'banner', 'nest'].includes(kind)) e.slow = 2.5 * this.stats.duration;
      if ((kind === 'pulse' || kind === 'axe') && !e.boss) {
        const d = distance(e, at) || 1;
        e.x += ((e.x - at.x) / d) * 70;
        e.y += ((e.y - at.y) / d) * 70;
      }
    }
  }
  private beam(
    from: Point,
    to: Point,
    width: number,
    damage: number,
    color: string,
    source: WeaponKind,
    pull = false,
  ) {
    this.effect(from.x, from.y, 0.45, width, color, 'line', undefined, to.x, to.y);
    const dx = to.x - from.x,
      dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    for (const e of this.enemies) {
      const t = Math.max(
        0,
        Math.min(1, ((e.x - from.x) * dx + (e.y - from.y) * dy) / lengthSquared),
      );
      if (distance(e, { x: from.x + dx * t, y: from.y + dy * t }) > width + e.radius) continue;
      this.hitEnemy(e, damage, false, source);
      if (pull && !e.boss) {
        const d = distance(e, from) || 1;
        e.x += ((from.x - e.x) / d) * 40;
        e.y += ((from.y - e.y) / d) * 40;
        e.slow = 1.5;
      }
    }
  }
  hitEnemy(e: Enemy, damage: number, crit = false, source = 'other') {
    if (e.dead) return;
    if (e.elite || e.boss) damage *= this.medicine.eliteDamage;
    if (this.tribulation) {
      if (!this.tribulationVulnerable) return;
      damage = Math.min(
        damage,
        Math.max(
          0,
          e.maxHp * tribulationRules(this.tribulation).openingDamage -
            this.tribulationOpeningDamage,
        ),
      );
      if (!damage) return;
      this.tribulationOpeningDamage += damage;
    }
    if (this.passives.abyss) e.slow = Math.max(e.slow, this.passivePower('abyss') * 0.15);
    if (!e.boss && ENEMIES[e.type].behavior === 'shield' && e.cooldown > 1.5) damage *= 0.45;
    const actual = Math.min(e.hp, damage);
    e.hp -= damage;
    e.flash = 0.12;
    this.damageDealt += actual;
    this.damageBySource[source] = (this.damageBySource[source] || 0) + actual;
    if (this.effects.length < 100)
      this.float(e, `${Math.ceil(damage)}${crit ? '!' : ''}`, crit ? '#f8db88' : '#e5edce');
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      if (this.tribulation) {
        this.state = this.player.hp > 0 ? 'won' : 'lost';
        this.onEvent(this.state === 'won' ? 'win' : 'lose');
        return;
      }
      const xp = e.boss
        ? Math.max(
            1200 + this.stage * 600,
            ...STAGE_ENEMIES[this.stage].map(
              (type) => Math.round(ENEMIES[type].xp * (1 + this.stage * 0.16) * 8) * 30,
            ),
          )
        : Math.round(ENEMIES[e.type].xp * (1 + this.stage * 0.16) * (e.elite ? 8 : 1));
      // 基础击杀收益保留，额外修为按地域与怪物强度结算；旧快照不追溯虚构击杀。
      const cultivationScale = cultivationFactor(this.realm);
      const bossReward = e.boss
        ? bossCultivationReward(this.stage, e.bossStage ?? this.stage) *
          this.medicine.bossCultivation
        : 0;
      this.bossCultivation +=
        bossReward * DIFFICULTIES[this.difficulty].reward * spiritRootInfo(this.spiritRoot).rate;
      this.combatCultivation += e.boss
        ? bossReward
        : Math.max(
            0,
            ((ENEMIES[e.type].xp / 3) * 0.7 * (1 + this.stage * 0.6) * (e.elite ? 4 : 1)) /
              cultivationScale -
              0.7,
          );
      if (!e.boss)
        this.combatCultivation +=
          Math.max(
            0.7,
            ((ENEMIES[e.type].xp / 3) * 0.7 * (1 + this.stage * 0.6) * (e.elite ? 4 : 1)) /
              cultivationScale,
          ) *
          (this.medicine.cultivation - 1);
      const lastBoss =
        !this.isFinalTrial || this.trialBossesDefeated === TRIAL_BOSS_STAGES.length - 1;
      const loot = e.boss
        ? medicineLoot(
            this.save.medicine,
            this.stage,
            lastBoss && this.player.hp > 0 && !this.save.completed.includes(this.stage),
            this.isFinalTrial && e.bossStage === FINAL_TRIAL_STAGE,
            this.random,
          )
        : [];
      if (loot.length && e.boss) recordChronicle(this.save, '妖王丹缘', loot.join('、'));
      this.creditCultivation();
      this.heal(this.stats.killHeal);
      let collected: string[] = [];
      if (e.boss) {
        // 最后一击随即结算，妖王灵气直接吸收，避免奖励留在已结束的战场。
        if (this.level < MAX_RUN_LEVEL) this.xp += xp * this.stats.xp;
        while (
          (!this.isFinalTrial || this.trialBossesDefeated === TRIAL_BOSS_STAGES.length - 1) &&
          this.level < MAX_RUN_LEVEL &&
          this.xp >= xpNeeded(this.level)
        ) {
          this.xp -= xpNeeded(this.level);
          this.level++;
        }
        if (this.level === MAX_RUN_LEVEL) this.xp = 0;
        this.recordRunAchievements();
        this.creditCultivation();
        collected = dropArtifacts(this.save, this.random);
      } else if (this.level < MAX_RUN_LEVEL)
        this.pickups.push({
          x: e.x,
          y: e.y,
          kind: 'xp',
          value: xp,
          pull:
            !!this.passives.soul &&
            distance(e, this.player) <=
              (110 + this.passives.soul * 50) * (1 + masteryBonus(this.save, 'soul')),
        });
      if (
        (e.elite && (!this.isFinalTrial || this.random() < 0.06)) ||
        (e.boss && this.isFinalTrial)
      )
        this.pickups.push({ x: e.x + 14, y: e.y, kind: 'chest', value: 1, pull: false });
      else if (!e.boss) {
        const r = this.random();
        const kind = r < 0.005 ? 'heal' : r < 0.01 ? 'magnet' : r < 0.027 ? 'iron' : null;
        if (kind && !(this.isFinalTrial && kind === 'heal'))
          this.pickups.push({ x: e.x + 10, y: e.y, kind, value: 1, pull: false });
      }
      if (e.boss) {
        if (this.isFinalTrial) {
          this.trialBossesDefeated = Math.min(
            this.trialBossesDefeated + 1,
            TRIAL_BOSS_STAGES.length,
          );
          this.announce(
            this.trialBossesDefeated === TRIAL_BOSS_STAGES.length
              ? '七劫尽破 · 成仙瓶颈解除'
              : `已破 ${this.trialBossesDefeated} / 7 劫 · 妖王灵气入体 · 遗宝自动入库`,
          );
        }
        if (
          this.player.hp > 0 &&
          (!this.isFinalTrial || this.trialBossesDefeated === TRIAL_BOSS_STAGES.length)
        ) {
          this.state = 'won';
          this.onEvent('win');
        }
        this.onEvent('loot', collected);
      }
    }
  }
  revive() {
    if (this.state !== 'lost' || this.revivesUsed >= MAX_REVIVES || this.expired) return false;
    this.revivesUsed++;
    this.slowed = 0;
    this.player.hp = this.player.maxHp;
    this.player.invincible = 3;
    const cleared = this.isFinalTrial
      ? this.trialBossesDefeated === TRIAL_BOSS_STAGES.length
      : this.bossSpawned && !this.boss;
    this.state = cleared ? 'won' : 'playing';
    this.announce('重燃道心 · 满血复活 · 三息护体');
    return true;
  }
  hurtPlayer(damage: number) {
    if (this.player.invincible > 0 || this.state !== 'playing') return;
    this.player.hp -= damage * this.stats.armor;
    this.player.invincible = 0.8;
    if (this.passives.bone && this.player.hp > 0) {
      this.areaDamage(
        this.player,
        115 * this.stats.area,
        this.player.maxHp * this.passivePower('bone') * 0.12 * this.stats.damage,
        'bone',
      );
      this.effect(this.player.x, this.player.y, 0.4, 115 * this.stats.area, '#dbcfb9', 'bone');
    }
    this.effect(this.player.x, this.player.y, 0.35, 35, '#f3a69b', 'pulse');
    this.onEvent('hurt');
  }
  private heal(amount: number) {
    if (this.player.hp > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
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
        evolutionPassives(t, this.path).some((id) => (this.passives[id] || 0) >= 3)
      )
        pool.push({ type: 'evolve', id: t.id, level: 7 });
      else if (owned && owned.level < MAX_WEAPON_LEVEL)
        pool.push({ type: 'weapon', id: t.id, level: owned.level + 1 });
      else if (!owned && allowsSchool(this.path, t.school) && this.weapons.length < MAX_WEAPONS)
        pool.push({ type: 'weapon', id: t.id, level: 1 });
    }
    for (const p of PASSIVES) {
      if (!allowsSchool(this.path, p.school)) continue;
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
    const resonance = pool.filter(
      (c) =>
        c.type === 'passive' &&
        this.weapons.some(
          (w) =>
            !w.evolved &&
            w.level >= 3 &&
            evolutionPassives(treasure(w.id), this.path).includes(c.id),
        ),
    );
    if (resonance.length && this.random() < 0.6)
      pick(resonance[Math.floor(this.random() * resonance.length)]);
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
      this.recordRunAchievements();
    }
    if (c.type === 'passive') {
      this.passives[c.id] = c.level;
      if (c.id === 'guard' || c.id === 'bone' || c.id === 'frenzy') {
        const oldMax = this.player.maxHp;
        const increase = this.maximumHealth - this.player.maxHp;
        this.player.maxHp = this.maximumHealth;
        if (increase >= 0) this.heal(increase);
        else this.player.hp *= this.player.maxHp / oldMax;
      }
    }
    if (c.type === 'heal') {
      this.player.hp = Math.min(
        this.player.maxHp,
        this.player.hp + this.player.maxHp * (this.isFinalTrial ? 0.15 : 0.4),
      );
      this.iron++;
    }
    this.state = 'playing';
    this.choices = [];
    this.onEvent('select');
    return true;
  }
}
