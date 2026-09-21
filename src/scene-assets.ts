import { ENEMIES, STAGES, STAGE_ENEMIES, FINAL_TRIAL_STAGE } from './data.ts';
import { SPRITE_ATLASES, spriteFrame } from './sprites.ts';

export function sceneAssets(stage: number, tribulation = false, extraSprites: number[] = []) {
  const sprites = tribulation
    ? [0, 81]
    : [
        0,
        ...STAGE_ENEMIES[stage].map((type) => ENEMIES[type].sprite),
        ...(stage === FINAL_TRIAL_STAGE ? STAGES.map((s) => s.sprite) : [STAGES[stage].sprite]),
        ...extraSprites,
      ];
  return [
    ...new Set([
      STAGES[tribulation ? FINAL_TRIAL_STAGE : stage].terrain,
      ...sprites.map((index) => SPRITE_ATLASES[spriteFrame(index).atlas].url),
      '/assets/treasures-1.webp',
      '/assets/treasures-2.webp',
      '/assets/treasures-3.webp',
      '/assets/cultivation-manuals.webp',
      '/assets/medicines.webp',
    ]),
  ];
}
