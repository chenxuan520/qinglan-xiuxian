// 只调整手机战斗画布的像素密度，保持CSS尺寸、视野及模拟时钟不变。
export class BattleResolution {
  private maximum = 0;
  private ratio = 1;
  private last: number | null = null;
  private elapsed = 0;
  private frames = 0;
  private fast = 0;

  sample(now: number, playing: boolean, mobileBattle: boolean, deviceRatio: number) {
    const maximum = Math.min(deviceRatio || 1, 2);
    if (maximum !== this.maximum) {
      this.maximum = maximum;
      this.ratio = maximum;
      this.clear();
    }
    if (!mobileBattle) {
      this.ratio = maximum;
      this.clear();
      return this.ratio;
    }
    if (!playing) {
      this.clear();
      return this.ratio;
    }
    const previous = this.last;
    this.last = now;
    if (previous === null) return this.ratio;
    const gap = now - previous;
    if (gap <= 0 || gap > 1000) {
      this.elapsed = this.frames = this.fast = 0;
      return this.ratio;
    }
    this.elapsed += gap;
    this.frames++;
    if (this.elapsed < 1600) return this.ratio;
    const fps = (this.frames * 1000) / this.elapsed;
    if (fps < 35) {
      this.ratio = Math.max(Math.min(1, maximum), this.ratio - 0.25);
      this.fast = 0;
    } else if (fps >= 55) {
      if (++this.fast >= 4) {
        this.ratio = Math.min(maximum, this.ratio + 0.25);
        this.fast = 0;
      }
    } else this.fast = 0;
    this.elapsed = this.frames = 0;
    return this.ratio;
  }

  private clear() {
    this.last = null;
    this.elapsed = this.frames = this.fast = 0;
  }
}
