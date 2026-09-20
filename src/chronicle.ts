import { REALMS, STAGES, MAX_FORGE_LEVEL, TREASURES } from './data.ts';
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
export function recordChronicle(save: SaveData, title: string, detail: string, milestone?: string) {
  const log = save.chronicle;
  if (milestone && Object.hasOwn(log.milestones, milestone)) return;
  if (milestone) log.milestones[milestone] = save.age;
  log.entries.unshift({ age: save.age, title, detail });
  log.entries.splice(CHRONICLE_LIMIT);
}
export function realmTitle(step: number) {
  return step === 24
    ? REALMS[8]
    : `${REALMS[Math.floor(step / 3)]}${['初期', '中期', '后期'][step % 3]}`;
}
export function restoreChronicle(save: SaveData, value: unknown, step: number, ascending: boolean) {
  if (validChronicle(value, save.age)) {
    save.chronicle = value;
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
  save.chronicle = {
    milestones,
    entries: [
      {
        age: null,
        title: '往事补录',
        detail: `现为${ascending ? '渡劫' : realmTitle(step)}，已通关 ${save.completed.length} 处秘境。旧档未记录的达成年岁留白，此后经历按实际年岁记下。`,
      },
    ],
  };
}
export function chronicleAchievements(save: SaveData) {
  return [
    { id: 'departure', title: '青岚启程', detail: '踏上仙途' },
    ...REALMS.slice(1).map((name, index) => ({
      id: `realm-${(index + 1) * 3}`,
      title: name,
      detail: `突破至${name}`,
    })),
    ...STAGES.map((stage, index) => ({
      id: `stage-${index}`,
      title: stage.name,
      detail: '首次通关',
    })),
    { id: 'sect', title: '仙门有道', detail: '首次拜入宗门' },
    { id: 'forge', title: '炉火纯青', detail: '一件法宝炼器十阶' },
    { id: 'collection', title: '万宝归藏', detail: '收齐三十六件法宝' },
    { id: 'tribulation', title: '逆天留印', detail: '首次通过两万年天劫' },
    {
      id: 'story',
      title: Object.hasOwn(save.chronicle.milestones, 'story') ? '炉火长明' : '未遇之缘',
      detail: '留下一段人间旧事',
    },
  ].map((a) => ({
    ...a,
    achieved: Object.hasOwn(save.chronicle.milestones, a.id),
    age: save.chronicle.milestones[a.id],
  }));
}
