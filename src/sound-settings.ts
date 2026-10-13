import type { SaveData } from './progress.ts';

type SoundState = Pick<SaveData, 'sound' | 'volume'>;
type SoundOutput = { sync(): void; play(name: string): void };

/** 汇总明确的声音操作；不负责页面重绘、存档替换或自动开启声音。 */
export class SoundSettings {
  private readonly state: SoundState;
  private readonly output: SoundOutput;
  private readonly persist: () => void;

  constructor(state: SoundState, output: SoundOutput, persist: () => void) {
    this.state = state;
    this.output = output;
    this.persist = persist;
  }

  setEnabled(enabled: boolean, feedback = false) {
    this.state.sound = enabled;
    this.output.sync();
    if (enabled && feedback) this.output.play('select');
    this.persist();
  }

  toggle() {
    this.setEnabled(!this.state.sound);
  }

  setVolume(volume: number) {
    this.state.volume = volume;
    this.output.sync();
    this.persist();
  }

  // 只有说书的明确朗读操作沿用零音量恢复默认值的规则。
  enableNarration() {
    if (this.state.volume === 0) this.state.volume = 0.6;
    this.setEnabled(true);
  }
}
