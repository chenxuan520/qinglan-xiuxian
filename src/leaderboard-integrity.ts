import { projectLeaderboardFactsV1 } from './leaderboard-facts-v1.ts';
import { projectLeaderboardFactsV2 } from './leaderboard-facts-v2.ts';
import type { SaveData } from './progress.ts';
import { sha256 } from './sha256.ts';

export interface FactsSeal {
  v: number;
  h: string;
}
export const FACTS_VERSION = 2;
export const INTEGRITY_SAVE_SCHEMA = 37;
export const TAMPERED_LEADERBOARD_MESSAGE = '此世存档曾被改动，不可留名万魂幡。';
export class InvalidFactsError extends Error {}

export interface FactsVersions {
  current: number;
  projectors: Readonly<Record<number, (save: unknown) => unknown>>;
}
// 事实/计分规则改动时增加版本并保留旧投影；普通存档字段不增加事实版本。
export const FACTS_VERSIONS: FactsVersions = {
  current: FACTS_VERSION,
  projectors: {
    1: (save) => projectLeaderboardFactsV1(save as SaveData),
    2: (save) => projectLeaderboardFactsV2(save as SaveData),
  },
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function validFactsSeal(value: unknown): value is FactsSeal {
  return (
    record(value) &&
    Object.keys(value).length === 2 &&
    Number.isSafeInteger(value.v) &&
    Number(value.v) > 0 &&
    typeof value.h === 'string' &&
    /^[a-f0-9]{64}$/.test(value.h)
  );
}

// 集合类排序；灵根首位有含义，rootElements仍保留原顺序。0阶空键不改变计分事实。
export function normalizeSealFacts(value: unknown): unknown {
  if (!record(value)) return value;
  const result = { ...value };
  for (const key of ['completed', 'artifacts', 'curios', 'acquiredCurios', 'achievements']) {
    const array = result[key];
    if (Array.isArray(array))
      result[key] = [...array].sort(key === 'completed' ? (a, b) => a - b : undefined);
  }
  for (const key of ['forge', 'mastery'])
    if (record(result[key]))
      result[key] = Object.fromEntries(Object.entries(result[key]).filter(([, n]) => n !== 0));
  return result;
}
export function canonicalFacts(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalFacts).join(',') + ']';
  if (record(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonicalFacts(value[key]))
        .join(',') +
      '}'
    );
  throw new InvalidFactsError('Unsupported facts value');
}
export function factsSealInput(facts: unknown, version = FACTS_VERSION, tampered = false) {
  // 两个公开域常量不是秘密，也不是认证。把改动标记纳入摘要域，避免只翻转布尔值洗白。
  const salt = tampered ? 'qinglan:leaderboard:changed:' : 'qinglan:leaderboard:clean:';
  return salt + version + ':' + canonicalFacts(normalizeSealFacts(facts));
}
export function createFactsSeal(
  facts: unknown,
  version = FACTS_VERSION,
  tampered = false,
): FactsSeal {
  return { v: version, h: sha256(factsSealInput(facts, version, tampered)) };
}
export function verifyFactsSeal(facts: unknown, seal: unknown, tampered = false) {
  // 保留的旧投影用于本地迁移，不等于服务端永远接受旧计分协议。
  if (!validFactsSeal(seal) || seal.v !== FACTS_VERSION) return false;
  try {
    return createFactsSeal(facts, seal.v, tampered).h === seal.h;
  } catch (error) {
    if (error instanceof InvalidFactsError) return false;
    throw error;
  }
}

export function inspectSaveIntegrity(
  raw: unknown,
  source: 'local' | 'import',
  versions: FactsVersions = FACTS_VERSIONS,
): boolean {
  if (raw === null && source === 'local') return false;
  if (!record(raw)) return true;
  // 仅上线前本地旧格式首次补签；文件导入没有这个例外。新格式删字段永远不补作清白。
  if (
    source === 'local' &&
    typeof raw.schema === 'number' &&
    raw.schema < INTEGRITY_SAVE_SCHEMA &&
    !Object.hasOwn(raw, 'factsSeal') &&
    !Object.hasOwn(raw, 'factsTampered')
  )
    return false;
  if (typeof raw.factsTampered !== 'boolean' || !validFactsSeal(raw.factsSeal)) return true;
  const project = versions.projectors[raw.factsSeal.v];
  if (!project) return true;
  let facts: unknown;
  try {
    facts = project(raw);
    factsSealInput(facts, raw.factsSeal.v, raw.factsTampered);
  } catch {
    return true;
  }
  const expected = createFactsSeal(facts, raw.factsSeal.v, raw.factsTampered);
  return raw.factsTampered || expected.h !== raw.factsSeal.h;
}

// 顺序不能调换：必须先按旧事实版本核验原档，再迁移，最后按当前事实版本重封。
// 允许传入下一版投影表，是以后迁移的正式扩展点，不从请求或存档读取投影规则。
export function migrateSealedSave(
  raw: unknown,
  migrate: () => SaveData,
  source: 'local' | 'import',
  versions: FactsVersions = FACTS_VERSIONS,
): SaveData {
  const tampered = inspectSaveIntegrity(raw, source, versions);
  const save = migrate();
  save.factsTampered = save.factsTampered === true || tampered;
  save.factsSeal = createFactsSeal(
    versions.projectors[versions.current](save),
    versions.current,
    save.factsTampered,
  );
  return save;
}

// 写入调用者先构造完整快照，成功setItem后才把这两个元数据应用回内存，保留同步回滚。
export function sealSaveSnapshot(save: SaveData) {
  const factsTampered = save.factsTampered === true;
  return {
    ...save,
    factsTampered,
    factsSeal: createFactsSeal(
      FACTS_VERSIONS.projectors[FACTS_VERSION](save),
      FACTS_VERSION,
      factsTampered,
    ),
  };
}
