import type { WeaponKind, EnemySkill, ElementId } from './data.ts';

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
  bossSkillQueue?: number[];
  pursuitCooldown?: number;
  windup?: number;
  pendingSkill?: EnemySkill;
  summonedBy?: number;
  illusionOf?: number;
  chargeFollowup?: boolean;
  cacheGuardian?: boolean;
  cooldown: number;
  slow: number;
  flash: number;
  charge: number;
  dx: number;
  dy: number;
  dead: boolean;
}
export interface BossAttack {
  volley: { weapon: WeaponKind; hitBosses: number[] };
  multipliers: Record<number, number>;
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
  bossAttack?: BossAttack;
  enemySkill?: 'firebolt' | 'frostbolt';
  bossStage?: number;
}
export interface Zone extends Point {
  endX?: number;
  endY?: number;
  vx?: number;
  vy?: number;
  sourceId?: number;
  radius: number;
  life: number;
  maxLife: number;
  damage: number;
  tick: number;
  color: string;
  kind: string;
  delay: number;
  hostile: boolean;
  castDelay?: number;
  castAngle?: number;
  castEvolved?: boolean;
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
  element?: ElementId;
  bossStage?: number;
  realmIndex?: number;
}
export interface Pickup extends Point {
  kind: 'xp' | 'heal' | 'magnet' | 'iron' | 'chest';
  value: number;
  pull: boolean;
}
export interface CacheChallenge extends Point {
  phase: 'offered' | 'active' | 'cleared' | 'expired';
  deadline: number;
  guardians: number[];
}
export interface Choice {
  type: 'weapon' | 'passive' | 'evolve' | 'heal';
  id: string;
  level: number;
}
export type GameState = 'playing' | 'paused' | 'upgrade' | 'won' | 'lost';
