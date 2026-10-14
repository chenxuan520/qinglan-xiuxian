import type { Game } from './game.ts';
import type { SaveData } from './progress.ts';
import { cultivationReward, tribulationDue } from './progress.ts';
import {
  DIFFICULTIES,
  ELEMENTS,
  ENEMIES,
  FINAL_TRIAL_STAGE,
  MAX_PASSIVES,
  MAX_WEAPONS,
  PASSIVES,
  SPIRIT_ROOTS,
  STAGES,
  TREASURES,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  allowsSchool,
  isCultivationPath,
  passive,
  spiritRootInfo,
} from './data.ts';
import { BOSS_FOLLOWUP } from './boss-followup.ts';
import { medicineInfo } from './medicine-data.ts';

// 校验原始对局结构；恢复气血、升级选项与修为入账仍由 Game.restore 完成。
export function validateRunSnapshot(
  save: SaveData,
  raw: unknown,
): ReturnType<Game['snapshot']> | null {
  const numbers = (value: unknown, fields: string[]) =>
    !!value &&
    typeof value === 'object' &&
    fields.every((key) => Number.isFinite((value as Record<string, unknown>)[key]));
  try {
    const s = raw as ReturnType<Game['snapshot']>;
    if (!s || s.version !== 2 || !['playing', 'paused', 'upgrade', 'lost'].includes(s.state))
      return null;
    if (s.realmScaling !== 3) return null;
    if (
      s.stageDuration !== undefined &&
      (!Number.isFinite(s.stageDuration) || s.stageDuration <= 0)
    )
      return null;
    if (s.path !== undefined && !isCultivationPath(s.path)) return null;
    if (s.tribulation !== undefined && (!Number.isSafeInteger(s.tribulation) || s.tribulation < 0))
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
    if (typeof s.trialBossBlocked !== 'boolean') return null;
    if (
      s.nextEnemySlowAt !== undefined &&
      (!Number.isFinite(s.nextEnemySlowAt) || s.nextEnemySlowAt < 0)
    )
      return null;
    if (s.cacheChallenge != null) {
      const c = s.cacheChallenge;
      if (
        s.stage >= FINAL_TRIAL_STAGE ||
        s.tribulation ||
        !numbers(c, ['x', 'y', 'deadline']) ||
        c.deadline < 0 ||
        !['offered', 'active', 'cleared', 'expired'].includes(c.phase) ||
        !Array.isArray(c.guardians) ||
        c.guardians.length > 2 ||
        new Set(c.guardians).size !== c.guardians.length ||
        !c.guardians.every((id) => Number.isSafeInteger(id) && id > 0) ||
        (c.phase === 'offered' && c.guardians.length !== 0) ||
        (['active', 'cleared'].includes(c.phase) && c.guardians.length !== 2)
      )
        return null;
    }
    if (typeof s.lateEliteWaves !== 'boolean') return null;
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
      (s.slowed !== undefined && (!Number.isFinite(s.slowed) || s.slowed < 0 || s.slowed > 0.65)) ||
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
          (e.chargeFollowup === undefined ||
            (typeof e.chargeFollowup === 'boolean' &&
              e.boss &&
              (e.bossStage ?? s.stage) === 2 &&
              s.stage < 6)) &&
          (e.illusionOf === undefined ||
            (Number.isSafeInteger(e.illusionOf) &&
              e.illusionOf > 0 &&
              !e.boss &&
              s.stage === 4 &&
              e.damage === 0 &&
              e.speed === 0)) &&
          (e.windup === undefined ||
            (Number.isFinite(e.windup) && e.windup >= 0 && e.windup <= 1.2)) &&
          (e.pendingSkill === undefined ||
            ['ranged', 'volley', 'nova', 'soul', 'firebolt', 'frostbolt', 'gapring'].includes(
              e.pendingSkill,
            )) &&
          (e.cacheGuardian === undefined || typeof e.cacheGuardian === 'boolean') &&
          (e.summonedBy === undefined ||
            (Number.isSafeInteger(e.summonedBy) && e.summonedBy > 0)) &&
          (e.pursuitCooldown === undefined || Number.isFinite(e.pursuitCooldown)) &&
          (e.bossStage === undefined ||
            (Number.isInteger(e.bossStage) &&
              e.bossStage >= 0 &&
              e.bossStage <= FINAL_TRIAL_STAGE)) &&
          (e.skillStep === undefined ||
            (e.boss &&
              Number.isInteger(e.skillStep) &&
              e.skillStep >= 0 &&
              e.skillStep < STAGES[e.bossStage ?? s.stage].skills.length)) &&
          (e.bossSkillQueue === undefined ||
            (e.boss &&
              !s.tribulation &&
              e.skillStep !== undefined &&
              Array.isArray(e.bossSkillQueue) &&
              e.bossSkillQueue.length < STAGES[e.bossStage ?? s.stage].skills.length &&
              new Set(e.bossSkillQueue).size === e.bossSkillQueue.length &&
              e.bossSkillQueue.every(
                (skill) =>
                  Number.isInteger(skill) &&
                  skill >= 0 &&
                  skill < STAGES[e.bossStage ?? s.stage].skills.length &&
                  skill !== e.skillStep,
              ))),
      )
    )
      return null;
    const cache = s.cacheChallenge;
    if (
      s.enemies.some(
        (e) =>
          e.cacheGuardian &&
          (!cache ||
            cache.phase === 'offered' ||
            (!cache.guardians.includes(e.id) && !cache.guardians.includes(e.summonedBy ?? -1)) ||
            (['cleared', 'expired'].includes(cache.phase) && !e.dead)),
      )
    )
      return null;
    if (
      cache?.guardians.some((id) =>
        s.enemies.some((e) => e.id === id && (!e.cacheGuardian || !e.elite || e.boss)),
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
          (b.enemySkill === undefined || ['firebolt', 'frostbolt'].includes(b.enemySkill)) &&
          (b.bossStage === undefined ||
            (b.kind === 'hostile' &&
              Number.isInteger(b.bossStage) &&
              b.bossStage >= 0 &&
              b.bossStage < STAGES.length)) &&
          typeof b.color === 'string' &&
          Array.isArray(b.hit) &&
          (b.kind === 'hostile' || TREASURES.some((t) => t.id === b.kind)),
      )
    )
      return null;
    if (
      s.bossVolleys !== undefined &&
      (!Array.isArray(s.bossVolleys) ||
        s.bossVolleys.length > s.shots.length ||
        !s.bossVolleys.every(
          (v) =>
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            Object.hasOwn(BOSS_FOLLOWUP, v.weapon) &&
            Array.isArray(v.hitBosses) &&
            v.hitBosses.length <= 500 &&
            new Set(v.hitBosses).size === v.hitBosses.length &&
            v.hitBosses.every((id) => Number.isSafeInteger(id) && id > 0),
        ))
    )
      return null;
    for (const b of s.shots) {
      const attack = b.bossAttack;
      if (attack === undefined) continue;
      if (
        !attack ||
        typeof attack !== 'object' ||
        Array.isArray(attack) ||
        !Number.isSafeInteger(attack.volley) ||
        attack.volley < 0
      )
        return null;
      const volley = s.bossVolleys?.[attack.volley];
      if (
        !volley ||
        volley.weapon !== b.kind ||
        !attack.multipliers ||
        typeof attack.multipliers !== 'object' ||
        Array.isArray(attack.multipliers) ||
        !Object.entries(attack.multipliers).every(
          ([id, multiplier]) =>
            String(Number(id)) === id &&
            volley.hitBosses.includes(Number(id)) &&
            (multiplier === 1 || multiplier === BOSS_FOLLOWUP[volley.weapon]),
        )
      )
        return null;
    }
    if (
      !Array.isArray(s.zones) ||
      s.zones.length > 500 ||
      !s.zones.every(
        (z) =>
          numbers(z, ['x', 'y', 'radius', 'life', 'maxLife', 'damage', 'tick', 'delay']) &&
          typeof z.color === 'string' &&
          typeof z.kind === 'string' &&
          typeof z.hostile === 'boolean' &&
          z.radius > 0 &&
          ((z.endX === undefined && z.endY === undefined) ||
            (z.hostile === true &&
              s.stage < 6 &&
              Number.isFinite(z.endX) &&
              Number.isFinite(z.endY) &&
              Math.hypot(z.endX! - z.x, z.endY! - z.y) <= 600)) &&
          ((z.vx === undefined && z.vy === undefined) ||
            (z.hostile === true &&
              s.stage < 6 &&
              Number.isFinite(z.vx) &&
              Number.isFinite(z.vy) &&
              Math.hypot(z.vx!, z.vy!) <= 40)) &&
          (z.sourceId === undefined ||
            (z.hostile === true &&
              s.stage < 6 &&
              Number.isSafeInteger(z.sourceId) &&
              z.sourceId > 0)) &&
          (z.castDelay === undefined || (Number.isFinite(z.castDelay) && z.castDelay >= 0)) &&
          (z.castAngle === undefined ||
            (Number.isFinite(z.castAngle) && Math.abs(z.castAngle) <= Math.PI)) &&
          (z.castEvolved === undefined || typeof z.castEvolved === 'boolean'),
      )
    )
      return null;
    if (
      !Array.isArray(s.pickups) ||
      // 每次有效击杀最多两件掉落，守匣最多额外一件；旧上限会拒绝合法终关续局。
      s.pickups.length > Math.max(800, s.kills * 2 + 1) ||
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
          ((c.type === 'weapon' || c.type === 'evolve') && TREASURES.some((t) => t.id === c.id)) ||
          (c.type === 'passive' &&
            PASSIVES.some((p) => p.id === c.id && allowsSchool(s.path ?? 'dual', p.school))),
      )
    )
      return null;
    if (s.startedImmortal !== undefined && typeof s.startedImmortal !== 'boolean') return null;
    if (s.elapsedYears !== undefined && (!Number.isFinite(s.elapsedYears) || s.elapsedYears < 0))
      return null;
    if (
      s.loot !== undefined &&
      (!s.loot ||
        typeof s.loot !== 'object' ||
        Array.isArray(s.loot) ||
        typeof s.loot.complete !== 'boolean' ||
        !Array.isArray(s.loot.artifacts) ||
        s.loot.artifacts.length > TREASURES.length ||
        new Set(s.loot.artifacts).size !== s.loot.artifacts.length ||
        !s.loot.artifacts.every((id) => TREASURES.some((t) => t.id === id)) ||
        !s.loot.medicines ||
        typeof s.loot.medicines !== 'object' ||
        Array.isArray(s.loot.medicines) ||
        !Object.entries(s.loot.medicines).every(
          ([id, count]) => medicineInfo(id) && Number.isSafeInteger(count) && count > 0,
        ))
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
