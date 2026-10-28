export const FIRST_TOUR_KEY = 'qinglan-first-tour';

export function markFirstTourSeen(storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(FIRST_TOUR_KEY, 'seen');
    return true;
  } catch {
    return false;
  }
}

// 仅在命盘重抽成功写入后转交待导览标记，不恢复已看过或其他一世的标记。
export function retargetPendingFirstTour(
  previousSeed: number,
  nextSeed: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
) {
  try {
    if (storage.getItem(FIRST_TOUR_KEY) === String(previousSeed))
      storage.setItem(FIRST_TOUR_KEY, String(nextSeed));
  } catch {
    // 设备偏好不可用不影响已经保存的命盘，指南仍可手动进入。
  }
}
