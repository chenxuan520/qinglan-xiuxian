import { npcDefaultLine, type NpcDialogueRequest, type NpcMessage } from './npc-dialogue.ts';
import { type TownResident } from './town-population.ts';
import { realmInfo, type SaveData } from './progress.ts';
import { NPC_AI_SETTINGS } from './setting.ts';
import { FINAL_TRIAL_STAGE } from './data.ts';
import { smithStoryLine } from './town-story.ts';

export const NPC_AI_BASE = (import.meta.env?.VITE_NPC_AI_URL || NPC_AI_SETTINGS.baseUrl).replace(
  /\/$/,
  '',
);

export async function requestNpcDialogue(
  input: NpcDialogueRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout: number = NPC_AI_SETTINGS.requestTimeoutMs,
): Promise<string | null> {
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
    return typeof data?.reply === 'string' &&
      data.reply.trim() &&
      data.reply.length <= NPC_AI_SETTINGS.maxReplyLength
      ? data.reply.trim()
      : null;
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
export function closeNpcChat() {
  activeRequest?.abort();
  activeRequest = null;
}
export function mountNpcChat(host: HTMLElement, save: SaveData, npc: TownResident) {
  closeNpcChat();
  const population = save.mortal.population!;
  const identity = `${population.seed}:${population.since}:${npc.id}:${npc.generation}:${JSON.stringify(save.mortal.smithStory ?? null)}`;
  const fallback =
    smithStoryLine(population, save.age, save.mortal.smithStory, npc.id) || npcDefaultLine(npc.id);
  let conversation = conversations.get(npc.id);
  if (conversation?.identity !== identity) {
    conversation = { identity, messages: [] };
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
        townRevision: save.mortal.scenery?.revision ?? 0,
        smithStory: save.mortal.smithStory,
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
    status.textContent = reply ? '街巷闲谈 · 随口聊聊' : '闲谈暂歇 · 仍可照常买卖、接取委托';
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
  if (!messages.length) void send('有位修士来到你跟前，请以自己的身份打个招呼。', true);
}
