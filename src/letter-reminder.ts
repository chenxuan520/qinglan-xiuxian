import type { SaveData } from './progress.ts';
import { unreadHumanLetterKeys } from './human-stories.ts';
import { hometownParents } from './hometown.ts';
import { smithAt } from './town-story.ts';
import { marketFellowLetterWaiting } from './market-fellow-life.ts';

export const LETTER_REMINDER_KEY = 'qinglan-letter-reminders-v1';
const REMINDER_LIMIT = 128;

export const LETTER_REMINDER_TEXT = '镇里托人捎话：得空，回来看看。';

function smithLetterKey(save: SaveData) {
  const { population, smithStory: story } = save.mortal;
  return population &&
    story &&
    !story.legacy &&
    !story.completed &&
    smithAt(population, save.age).generation > story.generation
    ? `${population.seed}:smith:${story.metAt}:${story.generation}`
    : null;
}

export function waitingLetterKeys(save: SaveData) {
  // 家书发现前后是同一封信；不能以发现年岁或后来生成的人口种子区分。
  const homePrefix = `${save.mortal.population?.seed}:home:`;
  const keys = unreadHumanLetterKeys(save).filter((key) => !key.startsWith(homePrefix));
  const home = save.mortal.hometown;
  if (
    home?.stage === 'departed' &&
    !home.letterRead &&
    hometownParents(home, save.age).every((parent) => !parent.alive)
  )
    keys.push(
      `home:${save.medicine.recipeSeed}:${home.parents.father.ageAtStart}:${home.parents.father.diesAt}:${home.parents.mother.ageAtStart}:${home.parents.mother.diesAt}`,
    );
  const smith = smithLetterKey(save);
  if (smith) keys.push(smith);
  const fellow = save.mortal.marketFellow;
  if (
    save.mortal.population &&
    save.mortal.sectMarket &&
    save.cultivation > 0 &&
    fellow &&
    marketFellowLetterWaiting(fellow, save.age)
  )
    keys.push(`${save.mortal.population.seed}:market-fellow:${fellow.metAt}:${fellow.chosenAt}`);
  return keys;
}

export interface LetterReminderContext {
  atHome: boolean;
  gamePresent: boolean;
  panel: string;
  foreground: boolean;
  toastVisible: boolean;
  // 锁档、资源加载、导览、强制弹窗等均优先于这一条轻提醒。
  blocked: boolean;
}

export class LetterReminder {
  private pending = false;
  private shown = new Set<string>();

  private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>;

  constructor(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage) {
    this.storage = storage;
    this.restoreShown();
  }

  private restoreShown() {
    try {
      const raw = this.storage().getItem(LETTER_REMINDER_KEY);
      if (!raw || raw.length > 32768) return;
      const keys: unknown = JSON.parse(raw);
      if (
        !Array.isArray(keys) ||
        keys.length > REMINDER_LIMIT ||
        !keys.every((key) => typeof key === 'string' && key.length > 0 && key.length <= 256)
      )
        return;
      this.shown = new Set([...this.shown, ...keys].slice(-REMINDER_LIMIT));
    } catch {
      // 本机存储不可用时仍可正常游戏，本次打开期间继续内存去重。
    }
  }

  private remember(keys: string[]) {
    this.restoreShown();
    keys.forEach((key) => this.shown.add(key));
    this.shown = new Set([...this.shown].slice(-REMINDER_LIMIT));
    try {
      this.storage().setItem(LETTER_REMINDER_KEY, JSON.stringify([...this.shown]));
    } catch {
      // 提示不影响人物写档，也不将信件标成已读。
    }
  }

  queue() {
    this.pending = true;
  }

  // 仅在旧账来信正文已经实际展示后调用，不改故事选择或人物存档。
  markSmithViewed(save: SaveData) {
    const key = smithLetterKey(save);
    if (key) this.remember([key]);
  }

  clear() {
    this.pending = false;
    // 换世只取消待发提示；旧信去重记录保留，新信由稳定键区分。
  }

  flush(save: SaveData, context: LetterReminderContext, notify: (text: string) => void) {
    if (
      !this.pending ||
      !context.atHome ||
      context.gamePresent ||
      context.panel !== '' ||
      !context.foreground ||
      context.toastVisible ||
      context.blocked ||
      save.journeyEnded ||
      save.pendingReincarnation ||
      save.mortal.marketSocial?.ambush
    )
      return false;
    this.restoreShown();
    const keys = waitingLetterKeys(save).filter((key) => !this.shown.has(key));
    if (!keys.length) {
      this.pending = false;
      return false;
    }
    notify(LETTER_REMINDER_TEXT);
    this.remember(keys);
    this.pending = false;
    return true;
  }
}
