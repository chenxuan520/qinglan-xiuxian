import { npcDefaultLine, type NpcDialogueRequest, type NpcMessage } from './npc-dialogue.ts';
import { type TownResident } from './town-population.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { NPC_AI_SETTINGS, TEA_STORY_IMAGE_SETTINGS, TEA_STORY_SETTINGS } from './setting.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import { smithStoryLine } from './town-story.ts';
import { humanStoryGreeting } from './human-stories.ts';
import { StorySpeech } from './story-speech.ts';
import { hometownParents } from './hometown.ts';

export const NPC_AI_BASE = (import.meta.env?.VITE_NPC_AI_URL || NPC_AI_SETTINGS.baseUrl).replace(
  /\/$/,
  '',
);

type NpcDialogueResponse = { reply: string; imageToken?: string };
async function requestNpcDialogueResponse(
  input: NpcDialogueRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout: number = input.mode === 'tea-story'
    ? TEA_STORY_SETTINGS.requestTimeoutMs
    : NPC_AI_SETTINGS.requestTimeoutMs,
): Promise<NpcDialogueResponse | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    if (signal.aborted) return null;
    const response = await fetcher(`${NPC_AI_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const data = await response.json();
    const reply =
      typeof data?.reply === 'string' &&
      data.reply.trim() &&
      data.reply.length <=
        (input.mode === 'tea-story' ? TEA_STORY_SETTINGS : NPC_AI_SETTINGS).maxReplyLength
        ? data.reply.trim()
        : null;
    if (!reply) return null;
    const imageToken =
      input.mode === 'tea-story' &&
      typeof data.imageToken === 'string' &&
      /^\d{10}\.[a-f0-9]{64}$/.test(data.imageToken)
        ? data.imageToken
        : undefined;
    return { reply, imageToken };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export async function requestNpcDialogue(
  input: NpcDialogueRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout: number = input.mode === 'tea-story'
    ? TEA_STORY_SETTINGS.requestTimeoutMs
    : NPC_AI_SETTINGS.requestTimeoutMs,
): Promise<string | null> {
  return (await requestNpcDialogueResponse(input, signal, fetcher, timeout))?.reply ?? null;
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
    signal.aborted
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
const conversations = new Map<string, { identity: string; messages: NpcMessage[] }>();
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
  host.setAttribute('aria-busy', 'true');
  const story = await requestNpcDialogueResponse(
    {
      mode: 'tea-story',
      population: save.mortal.population!,
      age: save.age,
      npcId: 'tea',
      realm: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name,
      message: '请讲一回关于问大道、求长生，仙途险恶艰难与人心无情的完整旧闻。',
      history: [],
    },
    controller.signal,
  );
  if (controller.signal.aborted || !host.isConnected || activeRequest !== controller) return;
  activeRequest = null;
  host.setAttribute('aria-busy', 'false');
  if (!story) {
    status.textContent = '说书暂歇，下回再来听吧。';
    return;
  }
  const { reply, imageToken } = story;
  text.textContent = reply;
  status.textContent = '茶馆传说 · 一回一故事';
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
  if (!reader.supported) status.textContent = '此设备暂不支持朗读，可阅读故事。';
  play.textContent = save.sound && save.volume > 0 ? '朗读故事' : '开启声音并朗读';
  play.addEventListener('click', () => {
    if (!save.sound || save.volume === 0) enableSound();
    play.textContent = '朗读故事';
    reader.play(reply, save.volume);
  });
  stop.addEventListener('click', () => reader.stop());
  if (!imageToken) return;
  const imageController = new AbortController();
  activeRequest = imageController;
  void requestTeaStoryImage(reply, imageToken, imageController.signal).then((image) => {
    const current = activeRequest === imageController;
    if (current) activeRequest = null;
    if (!current || imageController.signal.aborted || !host.isConnected || !image) return;
    clearStoryImage();
    activeStoryImageUrl = URL.createObjectURL(image);
    host.style.setProperty('--tea-story-image', `url("${activeStoryImageUrl}")`);
    host.classList.add('has-story-image');
  });
}
export function mountNpcChat(
  host: HTMLElement,
  save: SaveData,
  npc: Pick<TownResident, 'name' | 'generation'> & { id: NpcDialogueRequest['npcId'] },
) {
  closeNpcChat();
  const population = save.mortal.population!;
  const townId = npc.id === 'father' || npc.id === 'mother' ? null : npc.id;
  const home = save.mortal.hometown;
  if (
    !townId &&
    (!home ||
      home.stage !== 'departed' ||
      !hometownParents(home, save.age).some((p) => p.id === npc.id && p.alive))
  )
    return;
  const memory = townId ? humanStoryGreeting(save, townId) : '';
  const identity = `${population.seed}:${population.since}:${npc.id}:${npc.generation}:${JSON.stringify(townId ? (save.mortal.smithStory ?? null) : null)}:${memory}${
    !townId
      ? `:${JSON.stringify(home!.parents)}:${hometownParents(home!, save.age)
          .map((p) => p.alive)
          .join(':')}`
      : ''
  }`;
  const fallback =
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
  const render = () => {
    log.replaceChildren();
    const visible = messages.length ? messages : [{ role: 'assistant', content: fallback }];
    for (const message of visible) {
      const row = document.createElement('p');
      const name = document.createElement('strong');
      name.textContent = message.role === 'user' ? '你' : npc.name;
      row.className = `npc-chat-line ${message.role}`;
      row.append(name, document.createTextNode(message.content));
      log.append(row);
    }
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
    const reply = await requestNpcDialogue(
      {
        population,
        age: save.age,
        npcId: npc.id,
        realm: realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name,
        message,
        history,
        ...(townId ? { smithStory: save.mortal.smithStory } : { hometown: home }),
      },
      controller.signal,
    );
    if (controller.signal.aborted || !host.isConnected || activeRequest !== controller) return;
    activeRequest = null;
    messages.push({ role: 'assistant', content: reply ?? fallback });
    messages.splice(0, Math.max(0, messages.length - NPC_AI_SETTINGS.maxHistoryMessages));
    render();
    button.disabled = input.disabled = false;
    log.setAttribute('aria-busy', 'false');
    status.textContent = townId
      ? reply
        ? '街巷闲谈 · 随口聊聊'
        : '闲谈暂歇 · 仍可照常买卖、接取委托'
      : reply
        ? '家中叙话 · 随口聊聊'
        : '家常依旧 · 暂用本地对白';
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
