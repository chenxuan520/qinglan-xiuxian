import { LetterReminder } from '../../src/letter-reminder.ts';

// 既有动作 VM 执行真实路由与写档，只隔离本次新增的可选联网通知。
// 排行榜的实际开关、异步去重和迟到保护分别由主集成与 offer 测试覆盖。
export function notificationLeaves() {
  return {
    letterReminder: new LetterReminder(),
    queueRanking() {},
    clearRanking() {},
  };
}
