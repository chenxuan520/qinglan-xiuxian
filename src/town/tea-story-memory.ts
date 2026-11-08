const LU_CHI_HEARD_KEY = 'qinglan-tea-luchi-heard-v1';

// 独立于角色存档，轮回不重置；浏览器拒绝储存时仍记住本页已展示的故事。
export class TeaStoryMemory {
  private heard = false;

  hasHeard() {
    if (this.heard) return true;
    try {
      return localStorage.getItem(LU_CHI_HEARD_KEY) === '1';
    } catch {
      return false;
    }
  }

  markHeard() {
    this.heard = true;
    try {
      localStorage.setItem(LU_CHI_HEARD_KEY, '1');
    } catch {
      // 读书不因偏好保存失败而中断，也不改写游戏存档。
    }
  }
}

export const teaStoryMemory = new TeaStoryMemory();
