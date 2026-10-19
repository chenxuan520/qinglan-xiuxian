import { REALMS, MAX_FORGE_LEVEL, TREASURES } from './data.ts';
import { MAX_MASTERY } from './mortal-data.ts';
import { MEDICINES } from './medicine-data.ts';
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
export function recordCurioAchievement(save: SaveData) {
  if (new Set(save.curios.acquired).size >= 3)
    recordChronicle(save, '奇珍有缘', '本世先后获得三件不同奇物。', 'curio-three');
}
// 旧互换记录包含实际交出的物品；只认完整成交句，不从持有物品或交情推断。
function mixedExchangeEvidence(detail: string) {
  const trade = detail.match(/^宗门坊市：以(.+)换得(.+)，已收入丹囊。$/);
  if (!trade) return false;
  const medicine = (text: string, limit: number) => {
    const item = text.match(/^(.+) ×([1-9]\d*)$/);
    return !!item && Number(item[2]) <= limit && MEDICINES.some((m) => m.name === item[1]);
  };
  const items = trade[1].split(' ＋ ');
  const artifact = (text: string) => {
    const item = text.match(/^(.+)（炼器(0|[1-9]\d*)阶） ×1$/);
    return (
      !!item && Number(item[2]) <= MAX_FORGE_LEVEL && TREASURES.some((t) => t.name === item[1])
    );
  };
  return (
    medicine(trade[2], 6) && items.length === 2 && artifact(items[0]) && medicine(items[1], 12)
  );
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
  if (!Object.hasOwn(milestones, 'auction-treasure')) {
    const receipts = (save.mortal.auction?.history ?? []).filter(
      (r) =>
        r.outcome === 'won' && r.bidder === 'player' && r.kind === 'artifact' && r.forgeLevel >= 5,
    );
    if (receipts.length) milestones['auction-treasure'] = Math.min(...receipts.map((r) => r.age));
  }
  if (!Object.hasOwn(milestones, 'mixed-exchange')) {
    const entries = save.chronicle.entries.filter(
      (entry) => entry.title === '同道互通' && mixedExchangeEvidence(entry.detail),
    );
    if (entries.length)
      milestones['mixed-exchange'] = entries.some((entry) => entry.age === null)
        ? null
        : Math.min(...entries.map((entry) => entry.age!));
  }
}
export function restoreChronicle(save: SaveData, value: unknown, step: number, ascending: boolean) {
  if (validChronicle(value, save.age)) {
    save.chronicle = value;
    restorePersistentAchievements(save, save.chronicle.milestones);
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
}
export function chronicleAchievements(save: SaveData) {
  return [
    { id: 'forge', title: '炉火纯青', detail: '一件法宝炼器十阶' },
    { id: 'three-paths', title: '三道皆证', detail: '以正道、魔道和兼修分别通关' },
    { id: 'permanent-medicine', title: '丹成造化', detail: '首次服用本世珍品丹药' },
    {
      id: 'story',
      title: Object.hasOwn(save.chronicle.milestones, 'story') ? '炉火长明' : '未遇之缘',
      detail: '留下一段人间旧事',
    },
    { id: 'collection', title: '万宝归藏', detail: '收齐三十六件法宝' },
    { id: 'level-100', title: '百级归真', detail: '单局达到一百级' },
    { id: 'mastery', title: '仙门有道', detail: '一部宗门宝典精研十阶' },
    { id: 'training-master', title: '三元归一', detail: '淬体、悟道与身法皆修至二十阶' },
    { id: 'six-immortals', title: '六仙同御', detail: '单局同时觉醒六件仙器' },
    { id: 'five-tribulations', title: '五劫不灭', detail: '累计渡过五次天劫' },
    { id: 'hard-immortal', title: '逆境问道', detail: '以天劫降临难度成就真仙' },
    { id: 'rootless-immortal', title: '凡骨登仙', detail: '以无灵根成就真仙' },
    { id: 'curio-three', title: '奇珍有缘', detail: '本世先后获得三件不同奇物' },
    { id: 'auction-treasure', title: '慧眼识珍', detail: '在拍卖会竞得一件炼器五阶及以上的法宝' },
    { id: 'mixed-exchange', title: '以物结缘', detail: '完成一次同时交出法宝和丹药的组合换物' },
  ].map((a) => ({
    ...a,
    achieved: Object.hasOwn(save.chronicle.milestones, a.id),
    age: save.chronicle.milestones[a.id],
  }));
}
