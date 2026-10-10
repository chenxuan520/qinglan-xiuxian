/** 只采样前台战斗帧；暂停和后台保留最近一秒的读数，不计入等待时间。 */
export class FrameRate {
  value: number | undefined;
  private previous: number | undefined;
  private elapsed = 0;
  private frames = 0;

  reset() {
    this.value = undefined;
    this.sample(0, false);
  }

  sample(now: number, active: boolean) {
    if (!active) {
      this.previous = undefined;
      this.elapsed = this.frames = 0;
      return;
    }
    if (!Number.isFinite(now)) return;
    if (this.previous !== undefined && now > this.previous) {
      this.elapsed += now - this.previous;
      this.frames++;
      if (this.elapsed >= 1000) {
        this.value = Math.round((this.frames * 1000) / this.elapsed);
        this.elapsed = this.frames = 0;
      }
    }
    this.previous = now;
  }
}
