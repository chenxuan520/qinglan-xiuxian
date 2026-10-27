import type { SaveData } from './progress.ts';
import { setAdSoundEnabled } from './ads.ts';

type SoundState = Pick<SaveData, 'sound' | 'volume'>;
type SoundOutput = { sync(): void; play(name: string): void };

/** 汇总明确的声音操作；不负责页面重绘、存档替换或自动开启声音。 */
export class SoundSettings {
  private readonly state: SoundState;
  private readonly output: SoundOutput;
  private readonly persist: () => boolean | void;

  constructor(state: SoundState, output: SoundOutput, persist: () => boolean | void) {
    this.state = state;
    this.output = output;
    this.persist = persist;
  }

  setEnabled(enabled: boolean, feedback = false) {
    return this.update({ sound: enabled }, feedback);
  }

  toggle() {
    return this.setEnabled(!this.state.sound);
  }

  setVolume(volume: number) {
    return this.update({ volume });
  }

  // 只有说书的明确朗读操作沿用零音量恢复默认值的规则。
  enableNarration() {
    return this.update({ sound: true, volume: this.state.volume === 0 ? 0.6 : this.state.volume });
  }

  private update(next: Partial<SoundState>, feedback = false) {
    const previous = { sound: this.state.sound, volume: this.state.volume };
    Object.assign(this.state, next);
    try {
      if (this.persist() === false) {
        Object.assign(this.state, previous);
        return false;
      }
    } catch {
      Object.assign(this.state, previous);
      return false;
    }
    setAdSoundEnabled(this.state.sound);
    this.output.sync();
    if (this.state.sound && feedback) this.output.play('select');
    return true;
  }
}
