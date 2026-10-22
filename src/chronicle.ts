import { REALMS, MAX_FORGE_LEVEL, TREASURES } from './data.ts';
import { MAX_MASTERY } from './mortal-data.ts';
import type { SaveData } from './progress.ts';

export interface Chronicle {
  entries: Array<{ age: number | null; title: string; detail: string }>;
  milestones: Record<string, number | null>;
}
export const CHRONICLE_LIMIT = 200;
export function freshChronicle(): Chronicle {
  return {
    entries: [{ age: 15, title: '青岚启程', detail: '十五岁离乡，踏上觅长生、追寻大道的路。' }],
    milestones: { departure: 15 },
  };
}
export function validChronicle(value: unknown, age: number): value is Chronicle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Chronicle;
  const validAge = (n: unknown) =>
    n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= age + 1e-6);
  return (
    Array.isArray(c.entries) &&
    c.entries.length <= CHRONICLE_LIMIT &&
    c.entries.every(
      (e) =>
        e &&
        validAge(e.age) &&
        typeof e.title === 'string' &&
        e.title.length <= 80 &&
        typeof e.detail === 'string' &&
        e.detail.length <= 400,
    ) &&
    !!c.milestones &&
    typeof c.milestones === 'object' &&
    !Array.isArray(c.milestones) &&
    Object.keys(c.milestones).length <= 100 &&
    Object.entries(c.milestones).every(
      ([key, at]) => /^[a-z][a-z0-9-]{0,39}$/.test(key) && validAge(at),
    )
  );
}

export const ACHIEVEMENT_IDS = [
  'story',
  'permanent-medicine',
  'curio-three',
  'mastery',
  'three-paths',
  'level-100',
  'collection',
  'six-immortals',
  'forge',
  'training-master',
  'five-tribulations',
  'hard-immortal',
  'one-life-clear',
  'rootless-immortal',
] as const;
export const completedAchievements = (save: SaveData) =>
  !save.birthInheritance &&
  !('birth-inheritance' in save.chronicle.milestones) &&
  ACHIEVEMENT_IDS.every((id) => Object.hasOwn(save.chronicle.milestones, id));
function recordCompletion(save: SaveData, restore = false) {
  const log = save.chronicle;
  if (!completedAchievements(save)) {
    delete log.milestones.peerless;
    log.entries = log.entries.filter((entry) => entry.title !== '万古独尊');
    return;
  }
  if (Object.hasOwn(log.milestones, 'peerless')) return;
  const ages = ACHIEVEMENT_IDS.map((id) => log.milestones[id]);
  const age = restore
    ? ages.every((at) => typeof at === 'number')
      ? Math.max(...(ages as number[]))
      : null
    : save.age;
  log.milestones.peerless = age;
  log.entries.unshift({
    age,
    title: '万古独尊',
    detail: '未受传承遗物，本世十四项仙途成就尽数达成。',
  });
  log.entries.splice(CHRONICLE_LIMIT);
}

export function recordChronicle(save: SaveData, title: string, detail: string, milestone?: string) {
  const log = save.chronicle;
  if (milestone && Object.hasOwn(log.milestones, milestone)) return;
  if (milestone) log.milestones[milestone] = save.age;
  log.entries.unshift({ age: save.age, title, detail });
  log.entries.splice(CHRONICLE_LIMIT);
  if (milestone) recordCompletion(save);
}
export function realmTitle(step: number) {
  return step === 24
    ? REALMS[8]
    : `${REALMS[Math.floor(step / 3)]}${['初期', '中期', '后期'][step % 3]}`;
}
export function recordCurioAchievement(save: SaveData) {
  if (new Set(save.curios.acquired).size >= 3)
    recordChronicle(save, '奇珍有缘', '本世先后获得三件不同奇物。', 'curio-three');
}
function restorePersistentAchievements(save: SaveData, milestones: Chronicle['milestones']) {
  if (Object.values(save.mortal.mastery).some((level) => level >= MAX_MASTERY))
    milestones.mastery ??= null;
  if (save.tribulations >= 5) milestones['five-tribulations'] ??= null;
  if (Object.values(save.training).every((level) => level >= 20))
    milestones['training-master'] ??= null;
  if (
    Object.entries(save.medicine.used).some(
      ([id, count]) =>
        count > 0 && (id === 'huiyang' || id === 'peiying' || id.startsWith('jiuqu-')),
    ) ||
    save.chronicle.entries.some(
      (entry) => entry.title === '丹药入体' && entry.detail.includes('补天有成'),
    )
  )
    milestones['permanent-medicine'] ??= null;
  // 已得记录可证明本世成果，不能证明第三件的获得时间。
  if (new Set(save.curios.acquired).size >= 3) milestones['curio-three'] ??= null;
  delete milestones['auction-treasure'];
  delete milestones['mixed-exchange'];
}
export function restoreChronicle(save: SaveData, value: unknown, step: number, ascending: boolean) {
  if (validChronicle(value, save.age)) {
    save.chronicle = value;
    restorePersistentAchievements(save, save.chronicle.milestones);
    recordCompletion(save, true);
    return;
  }
  // 旧档只能证明已有成果，不能还原过去的突破时间。
  const milestones: Chronicle['milestones'] = { departure: null };
  for (let i = 1; i <= step; i++) milestones[`realm-${i}`] = null;
  if (ascending) milestones.ascension = null;
  for (const stage of save.completed) milestones[`stage-${stage}`] = null;
  if (save.mortal.member) milestones.sect = null;
  if (save.tribulations) milestones.tribulation = null;
  if (Object.values(save.forge).some((v) => v >= MAX_FORGE_LEVEL)) milestones.forge = null;
  if (save.artifacts.length >= TREASURES.length) milestones.collection = null;
  if (save.mortal.smithStory?.completed) milestones.story = null;
  restorePersistentAchievements(save, milestones);
  save.chronicle = {
    milestones,
    entries: [
      {
        age: null,
        title: '往事补录',
        detail: `现为${ascending ? '渡劫' : realmTitle(step)}，已通关 ${save.completed.length} 处秘境。`,
      },
    ],
  };
  recordCompletion(save, true);
}
