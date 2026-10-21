import {
  MARKET_DIALOGUE_CLUES,
  MARKET_DIALOGUE_EVENTS,
  marketDialogueLocalReply,
  marketReplyRevealsRealm,
  npcDefaultLine,
  type MarketDialogueContext,
  type NpcDialogueRequest,
  type NpcMessage,
} from './npc-dialogue.ts';
import { type TownResident } from './town-population.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { NPC_AI_SETTINGS, TEA_STORY_IMAGE_SETTINGS, TEA_STORY_SETTINGS } from './setting.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import { smithStoryLine } from './town-story.ts';
import { humanStoryGreeting } from './human-stories.ts';
import { StorySpeech } from './story-speech.ts';
import { hometownParents } from './hometown.ts';
import { isMarketCultivatorId, isMarketTraderId, marketIdentity } from './sect-market-data.ts';
import { marketContact } from './market-relations.ts';
import { marketOpportunity } from './market-social.ts';
import { marketTradeMotive } from './market-trade-motives.ts';
import { marketFriendLead } from './market-world.ts';
import { removeNumberGrouping } from './number-format.ts';

export const NPC_AI_BASE = (import.meta.env?.VITE_NPC_AI_URL || NPC_AI_SETTINGS.baseUrl).replace(
  /\/$/,
  '',
);

export function marketDialogueContext(
  save: SaveData,
  id: NpcDialogueRequest['npcId'],
): MarketDialogueContext {
  const market = save.mortal.sectMarket;
  if (!market || !isMarketCultivatorId(id)) return { contact: null, events: [], risk: null };
  if (isMarketTraderId(id) && market.absent?.includes(id))
    return { contact: null, events: [], risk: null };
  const record = marketContact(save, id);
  const contact =
    record && !record.dead
      ? {
          birthVisit: record.birthVisit,
          slot: record.slot,
          metAt: record.metAt,
          seenAt: record.seenAt,
          lastVisit: record.lastVisit,
          tradeVisit: record.tradeVisit,
          ...(record.aidAt === undefined ? {} : { aidAt: record.aidAt }),
          goodwill: record.goodwill,
          grudge: record.grudge,
        }
      : null;
  const social =
    save.mortal.marketSocial?.visit === market.visit ? save.mortal.marketSocial : undefined;
  const events: MarketDialogueContext['events'] = [];
  if (market.exchanged.includes(id)) events.push('exchange');
  for (const entry of social?.logs ?? [])
    if (
      entry.visit === market.visit &&
      entry.npcId === id &&
      (MARKET_DIALOGUE_EVENTS as readonly string[]).includes(entry.kind) &&
      !events.includes(entry.kind)
    )
      events.push(entry.kind);
  if (!isMarketTraderId(id)) return { contact, events, risk: null };
  const motive = marketTradeMotive(save, id);
  const lead = marketFriendLead(save, id);
  const trade = motive
    ? {
        trade: {
          motive: motive.kind,
          friend: motive.friend,
          wantedMedicineIds: [...motive.preferredMedicineIds],
          wantedWeaponIds: [...motive.preferredWeaponIds],
          lead: lead
            ? {
                npcId: lead.npcId,
                kind: lead.kind,
                id: lead.id,
                quantity: lead.quantity,
                forgeLevel: lead.forgeLevel,
                minimumLevel: lead.minimumLevel,
                price: lead.price,
              }
            : null,
        },
      }
    : {};
  const offer = marketOpportunity(save, id);
  if (!offer) return { contact, events, risk: null, ...trade };
  const inspection = !social?.inspected.includes(id)
    ? 'unexamined'
    : offer.kind === 'haggle'
      ? 'overpriced'
      : offer.honest
        ? 'no-flaw-found'
        : 'fraud-exposed';
  // 只在玩家真正核验后才公开相应结果；offer.honest、库存与随机种子均不发送。
  const risk = offer.risk;
  const clues: NonNullable<MarketDialogueContext['risk']>['clues'] = [];
  if (risk)
    for (const code of risk.clueCodes)
      if (
        (MARKET_DIALOGUE_CLUES as readonly string[]).includes(code) &&
        (offer.kind === 'invitation' ||
          !['secluded-road', 'bloodstain', 'pressed-departure'].includes(code))
      )
        clues.push(code);
  if (offer.kind === 'goods') clues.push('suspicious-seal');
  else if (offer.kind === 'deposit') clues.push('upfront-fee');
  else if (offer.kind === 'haggle') clues.push('marked-up-price');
  const player = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index;
  return {
    contact,
    events,
    ...trade,
    risk: {
      kind: offer.kind,
      inspection,
      resolved: !!social?.used.includes(id),
      realmDelta: risk?.realmDelta ?? offer.n.realmIndex - player,
      sectProtection: risk?.sectProtection ?? !!save.mortal.member,
      level: risk?.level ?? (offer.kind === 'invitation' ? '危险' : '谨慎'),
      clues: [...new Set(clues)],
    },
  };
}

export function marketConversationIdentity(save: SaveData, id: NpcDialogueRequest['npcId']) {
  const market = save.mortal.sectMarket;
  if (!market || !isMarketCultivatorId(id)) return '';
  const identity = isMarketTraderId(id)
    ? marketIdentity(market, id)
    : { birthVisit: market.visit, slot: id };
  return `${save.mortal.population!.seed}:${save.mortal.population!.since}:${identity.birthVisit}:${identity.slot}`;
}

type NpcDialogueResponse = { reply: string; imageToken?: string };
type NpcDialogueFailure = { error: string; retryable: boolean };
function dialogueErrorMessage(error: string) {
  return (
    (
      {
        'request-timeout': '这回故事等得久了',
        'inference-timeout': '这回故事等得久了',
        network: '网络连接失败',
        offline: '当前处于离线状态，请联网后再听新故事',
        busy: '茶馆正忙，请稍后再试',
        unavailable: '这回故事暂未备好',
        'inference-failed': '这回故事暂未备好',
        'limiter-unavailable': '茶馆正忙，请稍后再试',
        'empty-reply': '这回故事还未讲成',
        'invalid-response': '这回故事还未讲成',
        'invalid-dialogue': '请再试一次听书',
      } as Record<string, string>
    )[error] ?? '这回故事暂未备好'
  );
}
async function requestNpcDialogueResponse(
  input: NpcDialogueRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout: number = input.mode === 'tea-story'
    ? TEA_STORY_SETTINGS.requestTimeoutMs
    : NPC_AI_SETTINGS.requestTimeoutMs,
  onRetry?: (attempt: number, error: string) => void,
): Promise<NpcDialogueResponse | NpcDialogueFailure> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return { error: 'offline', retryable: false };
  const attempts = input.mode === 'tea-story' ? TEA_STORY_SETTINGS.maxAttempts : 1;
  let failure: NpcDialogueFailure = { error: 'network', retryable: true };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal.aborted) return { error: 'request-cancelled', retryable: false };
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timedOut = false;
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeout);
    try {
      const response = await fetcher(`${NPC_AI_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
        credentials: 'omit',
      });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) throw new Error('request-aborted');
      if (!response.ok) {
        failure = {
          error: typeof data?.error === 'string' ? data.error : 'unavailable',
          retryable:
            (response.status >= 500 || response.status === 408) && data?.retryable !== false,
        };
      } else {
        const reply =
          typeof data?.reply === 'string' &&
          data.reply.trim() &&
          data.reply.length <=
            (input.mode === 'tea-story' ? TEA_STORY_SETTINGS : NPC_AI_SETTINGS).maxReplyLength
            ? data.reply.trim()
            : null;
        if (reply) {
          const imageToken =
            input.mode === 'tea-story' &&
            typeof data.imageToken === 'string' &&
            /^\d{10}\.[a-f0-9]{64}$/.test(data.imageToken)
              ? data.imageToken
              : undefined;
          return {
            reply: marketReplyRevealsRealm(input, reply) ? marketDialogueLocalReply(input) : reply,
            imageToken,
          };
        }
        failure = { error: data ? 'empty-reply' : 'invalid-response', retryable: true };
      }
    } catch {
      failure = {
        error: signal.aborted ? 'request-cancelled' : timedOut ? 'request-timeout' : 'network',
        retryable: !signal.aborted,
      };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
    if (signal.aborted) return { error: 'request-cancelled', retryable: false };
    if (!failure.retryable || attempt === attempts) return failure;
    onRetry?.(attempt + 1, failure.error);
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(delay);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const delay = setTimeout(finish, TEA_STORY_SETTINGS.retryDelayMs);
      signal.addEventListener('abort', finish, { once: true });
      if (signal.aborted) finish();
    });
  }
  return failure;
}

export async function requestNpcDialogue(
  input: NpcDialogueRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout: number = input.mode === 'tea-story'
    ? TEA_STORY_SETTINGS.requestTimeoutMs
    : NPC_AI_SETTINGS.requestTimeoutMs,
): Promise<string | null> {
  const result = await requestNpcDialogueResponse(input, signal, fetcher, timeout);
  return 'reply' in result ? result.reply : null;
}

export async function requestTeaStoryImage(
  story: string,
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout = TEA_STORY_IMAGE_SETTINGS.requestTimeoutMs,
): Promise<Blob | null> {
  const text = story.trim();
  if (
    !text ||
    text.length > TEA_STORY_SETTINGS.maxReplyLength ||
    !/^\d{10}\.[a-f0-9]{64}$/.test(token) ||
    signal.aborted ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  )
    return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetcher(`${NPC_AI_BASE}/story-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story: text, token }),
      signal: controller.signal,
      credentials: 'omit',
    });
    const type = response.headers.get('Content-Type')?.split(';')[0] ?? '';
    const declared = Number(response.headers.get('Content-Length') || 0);
    if (
      !response.ok ||
      !type.startsWith('image/') ||
      declared > TEA_STORY_IMAGE_SETTINGS.maxImageBytes
    )
      return null;
    const image = await response.blob();
    return image.size > 0 && image.size <= TEA_STORY_IMAGE_SETTINGS.maxImageBytes ? image : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

// 仅保留本次页面内每个位置当前人物的最近闲谈，不继承给下一任，也不上传完整存档。
const conversations = new Map<
  string,
  { identity: string; messages: NpcMessage[]; greeting?: NpcMessage }
>();
let activeRequest: AbortController | null = null;
let activeSpeech: StorySpeech | null = null;
let activeStoryImageUrl = '';
function clearStoryImage() {
  if (activeStoryImageUrl) URL.revokeObjectURL(activeStoryImageUrl);
  activeStoryImageUrl = '';
}
export function closeNpcChat() {
  activeRequest?.abort();
  activeRequest = null;
  activeSpeech?.stop();
  activeSpeech = null;
  clearStoryImage();
}

export async function mountTeaStory(host: HTMLElement, save: SaveData, enableSound: () => void) {
  closeNpcChat();
  const controller = new AbortController();
  activeRequest = controller;
  const text = host.querySelector<HTMLElement>('.tea-story-text')!;
  const status = host.querySelector<HTMLElement>('.tea-story-status')!;
  const play = host.querySelector<HTMLButtonElement>('.tea-story-play')!;
  const stop = host.querySelector<HTMLButtonElement>('.tea-story-stop')!;
  const retry = host.querySelector<HTMLButtonElement>('.tea-story-retry')!;
  const next = host.querySelector<HTMLButtonElement>('.tea-story-next')!;
  const imageStatus = host.querySelector<HTMLElement>('.tea-story-image-status')!;
  text.textContent = '';
  status.textContent = '说书人正待开讲…';
  status.setAttribute('role', 'status');
  imageStatus.textContent = '';
  host.classList.remove('has-story-image');
  host.style.removeProperty('--tea-story-image');
  play.hidden = stop.hidden = true;
  play.disabled = stop.disabled = next.disabled = retry.disabled = true;
  retry.hidden = true;
  retry.onclick = () => {
    if (host.isConnected && !retry.disabled) void mountTeaStory(host, save, enableSound);
  };
  host.setAttribute('aria-busy', 'true');
  const story = await requestNpcDialogueResponse(
    {
      mode: 'tea-story',
      population: save.mortal.population!,
      age: save.age,
      npcId: 'tea',
      realm: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name,
      message: TEA_STORY_SETTINGS.requestMessage,
      history: [],
    },
    controller.signal,
    undefined,
    undefined,
    () => {
      if (host.isConnected && activeRequest === controller && !controller.signal.aborted)
        status.textContent = '说书人稍作停顿，请稍候…';
    },
  );
  if (controller.signal.aborted || !host.isConnected || activeRequest !== controller) return;
  activeRequest = null;
  host.setAttribute('aria-busy', 'false');
  if ('error' in story) {
    status.setAttribute('role', 'alert');
    status.textContent = `${dialogueErrorMessage(story.error)}。可再试这一回，不另耗年岁。`;
    retry.hidden = retry.disabled = false;
    return;
  }
  const { reply, imageToken } = story;
  const displayedReply = removeNumberGrouping(reply);
  text.textContent = displayedReply;
  status.textContent = '茶馆传说 · 一回一故事';
  next.disabled = false;
  const reader = new StorySpeech((state) => {
    if (!host.isConnected) return;
    play.disabled = state === 'speaking';
    stop.disabled = state !== 'speaking';
    status.textContent =
      state === 'speaking'
        ? '正在说书 · 可随时停止'
        : state === 'unavailable'
          ? '此设备暂无法朗读中文，可继续阅读故事。'
          : '茶馆传说 · 一回一故事';
  });
  activeSpeech = reader;
  play.hidden = stop.hidden = !reader.supported;
  play.disabled = false;
  if (!reader.supported) status.textContent = '此设备暂不支持朗读，可阅读故事。';
  play.textContent = save.sound && save.volume > 0 ? '朗读故事' : '开启声音并朗读';
  play.onclick = () => {
    if (!save.sound || save.volume === 0) enableSound();
    play.textContent = '朗读故事';
    reader.play(displayedReply, save.volume);
  };
  stop.onclick = () => reader.stop();
  if (!imageToken) return;
  const imageController = new AbortController();
  activeRequest = imageController;
  imageStatus.textContent = '画卷正慢慢铺开…';
  void requestTeaStoryImage(reply, imageToken, imageController.signal).then((image) => {
    const current = activeRequest === imageController;
    if (current) activeRequest = null;
    if (!current || imageController.signal.aborted || !host.isConnected) return;
    if (!image) {
      imageStatus.textContent = '';
      return;
    }
    clearStoryImage();
    activeStoryImageUrl = URL.createObjectURL(image);
    host.style.setProperty('--tea-story-image', `url("${activeStoryImageUrl}")`);
    host.classList.add('has-story-image');
    imageStatus.textContent = '';
  });
}
export function mountNpcChat(
  host: HTMLElement,
  save: SaveData,
  npc: Pick<TownResident, 'name' | 'generation'> & { id: NpcDialogueRequest['npcId'] },
) {
  closeNpcChat();
  const population = save.mortal.population!;
  const market = isMarketCultivatorId(npc.id);
  if (npc.id === 'market-fellow') return;
  if (market && isMarketTraderId(npc.id) && save.mortal.sectMarket?.absent?.includes(npc.id))
    return;
  const townId = npc.id === 'father' || npc.id === 'mother' ? null : npc.id;
  const home = save.mortal.hometown;
  if (
    !townId &&
    (!home ||
      home.stage !== 'departed' ||
      !hometownParents(home, save.age).some((p) => p.id === npc.id && p.alive))
  )
    return;
  const makeRequest = (message: string, history: NpcMessage[]): NpcDialogueRequest => ({
    population,
    age: save.age,
    npcId: npc.id,
    realm: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name,
    message,
    history,
    ...(market
      ? {
          marketVisit: {
            visit: save.mortal.sectMarket!.visit,
            realmIndex: save.mortal.sectMarket!.realmIndex,
            ...(save.mortal.sectMarket!.absent
              ? { absent: [...save.mortal.sectMarket!.absent!] }
              : {}),
            ...(save.mortal.sectMarket!.returning
              ? {
                  returning: save.mortal.sectMarket!.returning!.map((entry) => ({
                    slot: entry.slot,
                    birthVisit: entry.birthVisit,
                    birthSlot: entry.birthSlot,
                    realmIndex: entry.realmIndex,
                  })),
                }
              : {}),
          },
          marketContext: marketDialogueContext(save, npc.id),
        }
      : townId
        ? { smithStory: save.mortal.smithStory }
        : { hometown: home }),
  });
  const memory = townId ? humanStoryGreeting(save, townId) : '';
  const identity = market
    ? marketConversationIdentity(save, npc.id)
    : `${population.seed}:${population.since}:${npc.id}:${npc.generation}:${JSON.stringify(townId ? (save.mortal.smithStory ?? null) : null)}:${memory}${
        !townId
          ? `:${JSON.stringify(home!.parents)}:${hometownParents(home!, save.age)
              .map((p) => p.alive)
              .join(':')}`
          : ''
      }`;
  const fallback =
    (market
      ? marketDialogueLocalReply(makeRequest('有位修士来到你跟前，请以自己的身份打个招呼。', []))
      : '') ||
    memory ||
    (townId ? smithStoryLine(population, save.age, save.mortal.smithStory, townId) : '') ||
    npcDefaultLine(npc.id);
  let conversation = conversations.get(npc.id);
  if (conversation?.identity !== identity) {
    conversation = { identity, messages: memory ? [{ role: 'assistant', content: memory }] : [] };
    conversations.set(npc.id, conversation);
  }
  const messages = conversation.messages;
  const log = host.querySelector<HTMLElement>('.npc-chat-log')!;
  const form = host.querySelector<HTMLFormElement>('form')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  const status = host.querySelector<HTMLElement>('.npc-chat-status')!;
  const storyGreeting = !townId ? host.dataset?.storyGreeting : undefined;
  const render = () => {
    log.replaceChildren();
    const visible = messages.length ? messages : [{ role: 'assistant', content: fallback }];
    for (const message of visible) {
      if (
        storyGreeting === message.content &&
        (!messages.length || message === conversation.greeting)
      )
        continue;
      const row = document.createElement('p');
      const name = document.createElement('strong');
      name.textContent = message.role === 'user' ? '你' : npc.name;
      row.className = `npc-chat-line ${message.role}`;
      row.append(name, document.createTextNode(removeNumberGrouping(message.content)));
      log.append(row);
    }
    log.hidden = !log.firstChild;
    log.scrollTop = log.scrollHeight;
  };
  const send = async (message: string, greeting = false) => {
    if (button.disabled || !host.isConnected) return;
    const history = messages.slice(-NPC_AI_SETTINGS.maxHistoryMessages);
    if (!greeting) messages.push({ role: 'user', content: message });
    render();
    const controller = new AbortController();
    activeRequest = controller;
    button.disabled = input.disabled = true;
    status.textContent = `${npc.name}正想说些什么…`;
    log.setAttribute('aria-busy', 'true');
    const request = makeRequest(message, history);
    const reply = await requestNpcDialogue(request, controller.signal);
    if (controller.signal.aborted || !host.isConnected || activeRequest !== controller) return;
    activeRequest = null;
    const localReply = market ? marketDialogueLocalReply(request) : fallback;
    const answer: NpcMessage = { role: 'assistant', content: reply ?? localReply };
    if (greeting) conversation.greeting = answer;
    messages.push(answer);
    messages.splice(0, Math.max(0, messages.length - NPC_AI_SETTINGS.maxHistoryMessages));
    render();
    button.disabled = input.disabled = false;
    log.setAttribute('aria-busy', 'false');
    status.textContent = market
      ? reply
        ? '坊间闲谈 · 同道往来'
        : '坊间闲谈 · 随口聊聊'
      : townId
        ? reply
          ? '街巷闲谈 · 随口聊聊'
          : '闲谈暂歇 · 仍可照常买卖、接取委托'
        : reply
          ? '家中叙话 · 随口聊聊'
          : '家常依旧 · 随口聊聊';
    if (!greeting) input.focus({ preventScroll: true });
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = input.value.trim().slice(0, NPC_AI_SETTINGS.maxMessageLength);
    if (!message || button.disabled) return;
    input.value = '';
    void send(message);
  });
  render();
  if (!messages.length)
    void send(
      townId
        ? '有位修士来到你跟前，请以自己的身份打个招呼。'
        : '你的孩子回到青岚故居，请以自己的身份和孩子打个招呼。',
      true,
    );
}
