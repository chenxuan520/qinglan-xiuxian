import { validMedicine } from './medicine-data.ts';
import {
  ELEMENTS,
  SPIRIT_ROOTS,
  TREASURES,
  FINAL_TRIAL_STAGE,
  isCultivationPath,
  spiritRootInfo,
} from './data.ts';
import { Game } from './game.ts';
import { parseSave, type SaveData } from './progress.ts';
import { validMortal } from './mortal-data.ts';
import { validChronicle } from './chronicle.ts';

export const MAX_SAVE_FILE_BYTES = 10 * 1024 * 1024;

// 本机读档与文件导入共用迁移：通关后解除旧天劫，恢复被其暂停的原历练。
export function restoreSavedRun(save: SaveData, snapshot: unknown) {
  if (save.journeyEnded || save.pendingReincarnation) {
    save.tribulationReturn = null;
    return null;
  }
  if (
    save.completed.includes(FINAL_TRIAL_STAGE) &&
    snapshot &&
    typeof snapshot === 'object' &&
    Number.isSafeInteger((snapshot as { tribulation?: number }).tribulation) &&
    Number((snapshot as { tribulation?: number }).tribulation) > 0
  ) {
    snapshot = save.tribulationReturn;
    save.tribulationReturn = null;
  }
  const run = snapshot == null ? null : Game.restore(save, snapshot);
  if (snapshot != null && !run) throw new Error('未完成的历练数据已损坏，当前进度未更改');
  if (save.tribulationReturn != null) {
    const original = Game.restore(save, save.tribulationReturn);
    if (!original || original.tribulation || !run?.tribulation)
      throw new Error('天劫保存的原历练已损坏，当前进度未更改');
  }
  return run;
}

export function exportSave(save: SaveData, run: Game | null) {
  return JSON.stringify(
    {
      format: 'qinglan-save',
      version: 1,
      exportedAt: new Date().toISOString(),
      save: {
        ...save,
        activeRun:
          save.journeyEnded || save.pendingReincarnation ? null : (run?.snapshot() ?? null),
      },
    },
    null,
    2,
  );
}

export function importSave(text: string) {
  if (
    text.length > MAX_SAVE_FILE_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_SAVE_FILE_BYTES
  )
    throw new Error('存档文件过大，请选择 10 MB 以内的文件');
  let file;
  try {
    file = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('文件不是有效的 JSON 存档');
  }
  if (file?.format !== undefined && (file.format !== 'qinglan-save' || file.version !== 1))
    throw new Error('不支持此存档格式或版本');
  const data = file?.format === 'qinglan-save' ? file.save : file;
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
  const artifactIds = (value: unknown) =>
    Array.isArray(value) && value.every((id) => TREASURES.some((t) => t.id === id));
  if (
    !record(data) ||
    data.version !== 1 ||
    (data.medicine !== undefined && !validMedicine(data.medicine)) ||
    (data.chronicle !== undefined && !validChronicle(data.chronicle, Number(data.age ?? 15))) ||
    (data.mortal !== undefined && !validMortal(data.mortal, Number(data.age ?? 15))) ||
    (data.lifespanBonus !== undefined && !integer(data.lifespanBonus)) ||
    (data.tribulations !== undefined && !integer(data.tribulations)) ||
    (data.nextTribulationAge !== undefined &&
      (typeof data.nextTribulationAge !== 'number' ||
        !Number.isFinite(data.nextTribulationAge) ||
        data.nextTribulationAge < 0)) ||
    (data.age !== undefined &&
      (typeof data.age !== 'number' || !Number.isFinite(data.age) || data.age < 0)) ||
    !['stones', 'iron', 'cultivation', 'unlocked', 'bestKills', 'runs'].every((key) =>
      integer(data[key]),
    ) ||
    !Array.isArray(data.completed) ||
    !data.completed.every(integer) ||
    !record(data.training) ||
    !['vitality', 'power', 'speed'].every((key) =>
      integer((data.training as Record<string, unknown>)[key]),
    ) ||
    (data.retreatBonus !== undefined &&
      (!record(data.retreatBonus) ||
        !['vitality', 'power', 'speed'].every((key) =>
          integer((data.retreatBonus as Record<string, unknown>)[key]),
        ))) ||
    !record(data.forge) ||
    !Object.values(data.forge).every(integer) ||
    !TREASURES.some((t) => t.id === data.starter) ||
    (data.path !== undefined && !isCultivationPath(data.path)) ||
    (data.spiritRoot !== undefined && !SPIRIT_ROOTS.some((r) => r.id === data.spiritRoot)) ||
    (data.artifacts !== undefined && !artifactIds(data.artifacts)) ||
    (data.artifactDrops !== undefined && !artifactIds(data.artifactDrops)) ||
    ['sound', 'autoplay', 'prologueSeen', 'hometownSeen', 'journeyEnded'].some(
      (key) => data[key] !== undefined && typeof data[key] !== 'boolean',
    ) ||
    (data.pendingReincarnation !== undefined &&
      data.pendingReincarnation !== null &&
      data.pendingReincarnation !== 'lifespan' &&
      data.pendingReincarnation !== 'tribulation') ||
    (data.volume !== undefined &&
      (typeof data.volume !== 'number' || !Number.isFinite(data.volume)))
  )
    throw new Error('存档内容不完整或已损坏，当前进度未更改');
  if (
    data.rootElements !== undefined &&
    (!Array.isArray(data.rootElements) ||
      data.rootElements.length !==
        spiritRootInfo((data.spiritRoot as SaveData['spiritRoot']) ?? 'heaven').count ||
      new Set(data.rootElements).size !== data.rootElements.length ||
      !data.rootElements.every((id) => ELEMENTS.some((e) => e.id === id)))
  )
    throw new Error('存档中的灵根属性无效，当前进度未更改');
  // 使用独立对象校验和迁移，确认覆盖之前不修改当前进度。
  const save = parseSave(JSON.stringify(data));
  if (
    data.pendingReincarnation !== undefined &&
    data.pendingReincarnation !== save.pendingReincarnation
  )
    throw new Error('存档中的本世落幕状态无效，当前进度未更改');
  const run = restoreSavedRun(save, data.activeRun);
  return { save, run };
}
