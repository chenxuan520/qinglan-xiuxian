import { recordChronicle } from '../content/chronicle.ts';
import { ownsCurio } from '../items/curio-data.ts';
import type { SaveData } from '../core/progress.ts';

export type ParentId = 'father' | 'mother';
export interface HometownState {
  stage: 'root' | 'farewell' | 'walk' | 'reveal' | 'departed';
  parents: Record<ParentId, { ageAtStart: number; diesAt: number }>;
  lastVisitAge: number | null;
  letterFoundAt: number | null;
  letterRead: boolean;
  spring?: Partial<Record<ParentId, true>>;
  soulMet?: true;
}
export function parentDiesAt(home: HometownState, id: ParentId) {
  return home.parents[id].diesAt + (home.spring?.[id] ? 10 : 0);
}

export function freshHometown(random = Math.random): HometownState {
  return {
    stage: 'farewell',
    parents: {
      mother: { ageAtStart: 34 + Math.floor(random() * 6), diesAt: 75 + Math.floor(random() * 16) },
      father: { ageAtStart: 37 + Math.floor(random() * 7), diesAt: 75 + Math.floor(random() * 16) },
    },
    lastVisitAge: null,
    letterFoundAt: null,
    letterRead: false,
  };
}

export function validHometown(value: unknown, age: number): value is HometownState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const home = value as HometownState;
  const validAge = (n: unknown) =>
    n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 15 && n <= age);
  if (
    !Number.isFinite(age) ||
    age < 15 ||
    !['root', 'farewell', 'walk', 'reveal', 'departed'].includes(home.stage) ||
    !home.parents ||
    typeof home.parents !== 'object' ||
    Array.isArray(home.parents) ||
    Object.keys(home.parents).length !== 2 ||
    !(['father', 'mother'] as const).every((id) => {
      const p = home.parents[id];
      return (
        p &&
        typeof p === 'object' &&
        !Array.isArray(p) &&
        Number.isInteger(p.ageAtStart) &&
        p.ageAtStart >= (id === 'father' ? 37 : 34) &&
        p.ageAtStart <= (id === 'father' ? 43 : 39) &&
        Number.isInteger(p.diesAt) &&
        p.diesAt >= 75 &&
        p.diesAt <= 90
      );
    }) ||
    !validAge(home.lastVisitAge) ||
    !validAge(home.letterFoundAt) ||
    typeof home.letterRead !== 'boolean' ||
    (home.soulMet !== undefined && home.soulMet !== true) ||
    (home.spring !== undefined &&
      (!home.spring ||
        typeof home.spring !== 'object' ||
        Array.isArray(home.spring) ||
        !Object.entries(home.spring).every(
          ([id, value]) => (id === 'father' || id === 'mother') && value === true,
        )))
  )
    return false;
  const lastDeath = Math.max(
    ...(['father', 'mother'] as const).map(
      (id) => 15 + parentDiesAt(home, id) - home.parents[id].ageAtStart,
    ),
  );
  return (
    (home.stage === 'departed' ||
      (home.lastVisitAge === null && home.letterFoundAt === null && !home.letterRead)) &&
    (home.letterFoundAt === null ||
      (home.lastVisitAge !== null &&
        home.letterFoundAt <= home.lastVisitAge &&
        home.letterFoundAt >= lastDeath)) &&
    (!home.letterRead || home.letterFoundAt !== null)
  );
}

export function hometownParents(home: HometownState, age: number) {
  return (['father', 'mother'] as const).map((id) => {
    const parent = home.parents[id];
    const currentAge = parent.ageAtStart + age - 15;
    const diesAt = parentDiesAt(home, id);
    const old = currentAge >= 60;
    return {
      id,
      name: `${old ? '年迈的' : ''}${id === 'father' ? '父亲' : '母亲'}`,
      alive: currentAge < diesAt,
      old,
      age: Math.min(currentAge, diesAt),
    };
  });
}

export function departHometown(save: SaveData): boolean {
  const home = save.mortal.hometown;
  if (!home || (home.stage !== 'farewell' && home.stage !== 'walk')) return false;
  home.stage = 'reveal';
  save.hometownSeen = true;
  if (!Object.hasOwn(save.chronicle.milestones, 'home-departure')) {
    const detail = `你在${save.age.toFixed(1)}岁这年辞别父母，走出故乡，踏上觅长生、追寻大道的路。`;
    const departure = save.chronicle.entries.find((entry) => entry.title === '青岚启程');
    if (departure) {
      departure.age = save.age;
      departure.detail = detail;
      save.chronicle.milestones['home-departure'] = save.age;
    } else recordChronicle(save, '青岚启程', detail, 'home-departure');
  }
  return true;
}

export function acceptHometownRoot(save: SaveData): boolean {
  const home = save.mortal.hometown;
  if (!home || home.stage !== 'reveal') return false;
  home.stage = 'departed';
  save.hometownSeen = true;
  return true;
}

export function visitHometown(save: SaveData, parent?: ParentId): boolean {
  const home = save.mortal.hometown;
  if (!home || home.stage !== 'departed') return false;
  let changed = home.lastVisitAge !== save.age;
  home.lastVisitAge = save.age;
  const parents = hometownParents(home, save.age);
  for (const person of parents) {
    const milestone = `home-${person.id}`;
    if (!person.alive && !Object.hasOwn(save.chronicle.milestones, milestone)) {
      const diesAt = parentDiesAt(home, person.id);
      recordChronicle(
        save,
        '归乡闻讯',
        `你${save.age.toFixed(1)}岁归乡，才知道${person.id === 'father' ? '父亲' : '母亲'}早在你${15 + diesAt - home.parents[person.id].ageAtStart}岁那年离世，享年${diesAt}岁。`,
        milestone,
      );
      changed = true;
    }
  }
  const person = parents.find((p) => p.id === parent);
  if (person?.alive && !Object.hasOwn(save.chronicle.milestones, 'home-reunion')) {
    recordChronicle(
      save,
      '故乡重逢',
      `你回到故乡，与${person.name}坐下说了些家常。`,
      'home-reunion',
    );
    changed = true;
  }
  if (!parent && parents.every((p) => !p.alive) && home.letterFoundAt === null) {
    home.letterFoundAt = save.age;
    recordChronicle(
      save,
      '故居家书',
      `故居里已不见父母。你找到一封${hometownLetter(home).name}留下的家书，尚未拆开。`,
      'home-letter-found',
    );
    changed = true;
  }
  if (
    !parent &&
    home.letterRead &&
    !home.soulMet &&
    parents.every((p) => !p.alive) &&
    ownsCurio(save, 'soul-wood')
  ) {
    home.soulMet = true;
    recordChronicle(
      save,
      '故园残魂',
      '院中老槐下，怀里的养魂木忽然温热起来。恍惚间，灶前坐着两个熟悉的影子，像从前一样问你吃过饭没有。你应了一声，影子便淡了，只余一缕炊烟似的微光，绕着木心转了一圈，散去了。',
      'home-soul-wood',
    );
    changed = true;
  }
  return changed;
}

export function readHometownLetter(save: SaveData): boolean {
  const home = save.mortal.hometown;
  if (
    !home ||
    home.stage !== 'departed' ||
    home.letterFoundAt === null ||
    home.letterRead ||
    hometownParents(home, save.age).some((p) => p.alive)
  )
    return false;
  home.letterRead = true;
  const letter = hometownLetter(home);
  recordChronicle(
    save,
    '展读家书',
    `${letter.name}留下的话：${letter.lines.join('')}`,
    'home-letter-read',
  );
  return true;
}

export function hometownLetter(home: HometownState): { name: string; lines: string[] } {
  const { mother, father } = home.parents;
  return parentDiesAt(home, 'mother') - mother.ageAtStart >=
    parentDiesAt(home, 'father') - father.ageAtStart
    ? { name: '母亲', lines: ['山里若冷，记得添衣。', '家中无事，莫要挂念。'] }
    : { name: '父亲', lines: ['出门在外，记得好好吃饭。', '家里的门还在，想回便回。'] };
}
