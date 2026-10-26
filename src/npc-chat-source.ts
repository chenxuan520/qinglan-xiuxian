import { STANDALONE } from './build-mode.ts';
import { resourceFailureContent } from './resource-panel.ts';
import { ModuleSource, retryModule } from './module-source.ts';
import type { SaveData } from './progress.ts';
import type * as Chat from './npc-chat.ts';
import { NPC_AI_SETTINGS } from './setting.ts';

export const NPC_AI_BASE = STANDALONE
  ? ''
  : (import.meta.env?.VITE_NPC_AI_URL || NPC_AI_SETTINGS.baseUrl).replace(/\/$/, '');
type ChatModule = Pick<typeof Chat, 'closeNpcChat' | 'mountNpcChat' | 'mountTeaStory'>;

async function fetchChat(attempt: number): Promise<ChatModule> {
  if (!attempt) return import('./npc-chat.ts');
  return retryModule<ChatModule>('npc-chat', 'chat', attempt);
}

// 闲谈按需载入；同一次载入期间换人、关窗或离开场景均使旧挂载失效。
export class NpcChatSource extends ModuleSource<ChatModule> {
  private epoch = 0;
  constructor(load = fetchChat) {
    super(load);
  }
  close() {
    this.epoch++;
    this.current?.closeNpcChat();
  }
  async show(
    host: Pick<HTMLElement, 'isConnected'>,
    mount: (chat: ChatModule) => void | Promise<void>,
    failure: () => void,
  ) {
    this.close();
    const epoch = this.epoch;
    let chat: ChatModule;
    try {
      chat = await this.load();
    } catch {
      if (epoch === this.epoch && host.isConnected) failure();
      return;
    }
    if (epoch === this.epoch && host.isConnected) {
      try {
        await mount(chat);
      } catch {
        if (epoch === this.epoch && host.isConnected) {
          chat.closeNpcChat();
          failure();
        }
      }
    }
  }
}
const source = new NpcChatSource();
export function closeNpcChat() {
  source.close();
}
function retry(host: HTMLElement, again: () => void) {
  const original = host.innerHTML;
  host.innerHTML = resourceFailureContent(
    '',
    '闲谈暂时无法载入，交易与其他互动仍可正常使用。',
    '重试闲谈',
  );
  const button = host.querySelector<HTMLButtonElement>('[data-resource-retry]')!;
  button.onclick = () => {
    host.innerHTML = original;
    again();
  };
}
export function mountNpcChat(...args: Parameters<typeof Chat.mountNpcChat>) {
  const [host] = args;
  void source.show(
    host,
    (chat) => chat.mountNpcChat(...args),
    () => retry(host, () => mountNpcChat(...args)),
  );
}
export async function mountTeaStory(host: HTMLElement, save: SaveData, enableSound: () => void) {
  await source.show(
    host,
    (chat) => chat.mountTeaStory(host, save, enableSound),
    () =>
      retry(host, () => {
        void mountTeaStory(host, save, enableSound);
      }),
  );
}
