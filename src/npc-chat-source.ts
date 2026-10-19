import { resourceFailureContent } from './resource-panel.ts';
import { resourceFailed } from './update-check.ts';
import type { SaveData } from './progress.ts';
import type * as Chat from './npc-chat.ts';
import { NPC_AI_SETTINGS } from './setting.ts';

export const NPC_AI_BASE = (import.meta.env?.VITE_NPC_AI_URL || NPC_AI_SETTINGS.baseUrl).replace(
  /\/$/,
  '',
);
type ChatModule = Pick<typeof Chat, 'closeNpcChat' | 'mountNpcChat' | 'mountTeaStory'>;

// 闲谈按需载入；同一次载入期间换人、关窗或离开场景均使旧挂载失效。
export class NpcChatSource {
  private pending: Promise<ChatModule> | undefined;
  private loaded: ChatModule | undefined;
  private epoch = 0;
  private load: () => Promise<ChatModule>;
  constructor(load: () => Promise<ChatModule>) {
    this.load = load;
  }
  close() {
    this.epoch++;
    this.loaded?.closeNpcChat();
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
      this.pending ??= this.load().catch((error) => {
        this.pending = undefined;
        throw error;
      });
      chat = await this.pending;
    } catch {
      resourceFailed(true);
      if (epoch === this.epoch && host.isConnected) failure();
      return;
    }
    this.loaded = chat;
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
const source = new NpcChatSource(() => import('./npc-chat.ts'));
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
