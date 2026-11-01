import type { GuideSection } from './guide-corpus.ts';

const SYNONYMS = [
  ['丹药', '药', '丹'],
  ['灵石', '钱'],
  ['法宝', '武器', '装备'],
  ['功法', '技能'],
  ['宗门', '门派'],
  ['轮回', '重新开始', '重开'],
  ['存档', '换设备', '进度'],
  ['寿元', '寿命', '年岁'],
  ['境界', '突破', '升级'],
  ['万魂幡', '排行榜', '排名'],
  ['天劫', '渡劫'],
  ['坊市', '拍卖行', '拍卖'],
  ['奇物', '宝物'],
  ['服用', '服药', '吃'],
] as const;
const alias = new Map<string, string>();
for (const group of SYNONYMS) for (const term of group) alias.set(term, group[0]);
const aliasPattern = new RegExp(
  [...alias.keys()].sort((a, b) => b.length - a.length).join('|'),
  'g',
);
function normalize(text: string) {
  return text.toLowerCase().replace(aliasPattern, (term) => alias.get(term)!);
}
function tokens(text: string) {
  const words: string[] = [];
  for (const part of normalize(text).match(/[\u3400-\u9fff]+|[a-z0-9]+/g) ?? []) {
    if (/^[a-z0-9]+$/.test(part)) words.push(part);
    else if (part.length === 1) words.push(part);
    else for (let i = 0; i < part.length - 1; i++) words.push(part.slice(i, i + 2));
  }
  return words;
}
function counts(text: string) {
  const result = new Map<string, number>();
  for (const term of tokens(text)) result.set(term, (result.get(term) ?? 0) + 1);
  return result;
}

export function searchGuide(question: string, corpus: GuideSection[], k = 3): GuideSection[] {
  const query = new Set(
    tokens(question.replace(/什么时候|怎么样|有什么|怎么|如何|为什么|能不能|是否|请问/g, ' ')),
  );
  if (!query.size || !Number.isFinite(k) || k <= 0) return [];
  const ranked = corpus
    .map((section, index) => {
      const title = counts(section.heading);
      const body = counts(section.text);
      let score = 0;
      for (const word of query) score += 3 * (title.get(word) ?? 0) + (body.get(word) ?? 0);
      return { section, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const result: GuideSection[] = [];
  let remaining = 4000;
  for (const { section } of ranked.slice(0, Math.min(3, Math.floor(k)))) {
    if (!remaining) break;
    const text = section.text.slice(0, remaining);
    result.push({ ...section, text });
    remaining -= text.length;
  }
  return result;
}
