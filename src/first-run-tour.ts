import type { ActionShell } from './action-controller.ts';

type TourHost = Pick<
  ActionShell,
  | 'save'
  | 'saveLock'
  | 'game'
  | 'pendingRun'
  | 'panel'
  | 'inMortalWorld'
  | 'assetsReady'
  | 'sceneLoading'
  | 'ui'
  | 'modal'
  | 'document'
  | 'guideSource'
  | 'toast'
>;
export const FIRST_TOUR_KEY = 'qinglan-first-tour';
export function markFirstTourSeen(storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(FIRST_TOUR_KEY, 'seen');
    return true;
  } catch {
    return false;
  }
}

// 单独保存设备上的首次引导状态，不改变存档格式或轮回规则。
export function queueFirstRunTour(
  host: TourHost,
  fresh: boolean,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  schedule: (callback: () => void) => void = (callback) => {
    setTimeout(callback, 200);
  },
) {
  const seed = String(host.save.medicine.recipeSeed);
  let marker = '';
  try {
    marker = storage.getItem(FIRST_TOUR_KEY) ?? '';
    if (fresh && !marker) {
      marker = seed;
      storage.setItem(FIRST_TOUR_KEY, marker);
    }
  } catch {
    return;
  }
  if (marker !== seed) return;
  let finished = false;
  const finish = () => {
    finished = true;
    return markFirstTourSeen(storage);
  };
  const pending = () => {
    try {
      return storage.getItem(FIRST_TOUR_KEY) === seed;
    } catch {
      return false;
    }
  };
  const ready = () =>
    !host.document.hidden &&
    !host.saveLock &&
    !host.game &&
    !host.pendingRun &&
    !host.inMortalWorld &&
    !host.panel &&
    host.assetsReady &&
    !host.sceneLoading &&
    host.save.prologueSeen &&
    (!host.save.mortal.hometown || host.save.mortal.hometown.stage === 'departed');
  const check = () => {
    if (finished) return;
    if (!pending()) {
      finished = true;
      return;
    }
    // 导入其他一世、已开战或轮回后不再自动打断。
    if (
      String(host.save.medicine.recipeSeed) !== seed ||
      host.save.runs ||
      host.game ||
      host.pendingRun ||
      host.save.journeyEnded ||
      host.save.pendingReincarnation
    ) {
      finish();
      return;
    }
    if (!ready()) {
      schedule(check);
      return;
    }
    const home = host.ui.firstElementChild;
    const current = () =>
      !finished &&
      pending() &&
      ready() &&
      host.ui.firstElementChild === home &&
      String(host.save.medicine.recipeSeed) === seed;
    void host.guideSource
      .load()
      .then(async (guide) => {
        if (!current()) {
          schedule(check);
          return;
        }
        const started = await guide.startAutomaticInterfaceTour(
          host.ui,
          host.modal,
          current,
          finish,
          host.save,
        );
        if (!started && !finished) {
          if (!current()) schedule(check);
          else host.toast('引导暂时无法载入，可在「怎么玩」中重新开启。');
        }
      })
      .catch(() => {
        if (current()) host.toast('引导暂时无法载入，可在「怎么玩」中重新开启。');
        else schedule(check);
      });
  };
  check();
}
