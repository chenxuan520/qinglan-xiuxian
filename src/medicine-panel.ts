import type { SaveData } from './progress.ts';
import { medicineInfo, refreshMedicineShop } from './medicine-data.ts';
import { useMedicine, buyMedicine, craftMedicine, buyMedicineRecipe } from './medicine.ts';
import { medicineContent, type MedicineView, type MedicineTierFilter } from './medicine-ui.ts';

interface MedicineContext {
  panel: string;
  hasGame: boolean;
  pendingRun: boolean;
  herbsShop: boolean;
}
interface MedicineActions {
  show(): void;
  render(): void;
  refresh(): void;
  commit(next: SaveData): boolean;
  starterChanged(): void;
  toast(message: string): void;
}

// 丹囊的筛选状态与交互共置；世界切换和存档写入仍由入口调度。
export class MedicinePanel {
  private view: MedicineView = 'bag';
  private tier: MedicineTierFilter = 'all';
  private readonly save: SaveData;
  private readonly modal: HTMLDivElement;
  private readonly actions: MedicineActions;
  constructor(save: SaveData, modal: HTMLDivElement, actions: MedicineActions) {
    this.save = save;
    this.modal = modal;
    this.actions = actions;
  }
  private commit(next: SaveData) {
    try {
      if (!this.actions.commit(next)) return false;
    } catch {
      this.actions.toast('暂时无法保存，本次操作未生效，请重试');
      return false;
    }
    Object.assign(this.save, next);
    return true;
  }
  private refreshShop() {
    const next = structuredClone(this.save);
    return !refreshMedicineShop(next.medicine, next.age) || this.commit(next);
  }
  content(stage: number, blocked: boolean, herbsShop: boolean) {
    if (this.view === 'shop') this.refreshShop();
    return medicineContent(this.save, stage, this.view, blocked, herbsShop, this.tier);
  }
  handle(action: string, id: string | undefined, context: MedicineContext) {
    const { modal, actions } = this;
    if (action === 'medicine' && !context.hasGame) {
      this.view = 'bag';
      this.tier = 'all';
      actions.show();
      return true;
    }
    if (action === 'medicine-shop' && !context.hasGame && context.herbsShop) {
      if (!this.refreshShop()) return true;
      this.view = 'shop';
      this.tier = 'all';
      actions.show();
      return true;
    }
    if (action === 'medicine-view' && context.panel === 'medicine') {
      if (
        id === 'bag' ||
        id === 'craft' ||
        id === 'recipes' ||
        (id === 'shop' && context.herbsShop)
      ) {
        this.view = id;
        this.tier = 'all';
        actions.render();
      }
      return true;
    }
    if (action === 'medicine-tier' && context.panel === 'medicine') {
      if (id === 'all' || id === '凡品' || id === '灵品' || id === '珍品') {
        this.tier = id;
        actions.render();
      }
      return true;
    }
    if (
      !action.startsWith('medicine-') ||
      context.hasGame ||
      context.panel !== 'medicine' ||
      !id ||
      !medicineInfo(id)
    )
      return false;
    const save = structuredClone(this.save);
    let message = '';
    let starterChanged = false;
    if (action === 'medicine-use') {
      const input = modal.querySelector<HTMLInputElement>(`#medicine-quantity-${id}`);
      const result = useMedicine(save, id, context.pendingRun, input ? Number(input.value) : 1);
      message = result.message;
      starterChanged = result.ok && id === 'butian';
    } else if (action === 'medicine-discard' && !context.pendingRun) {
      delete save.medicine.active[id];
      message = '药效已散去，丹药不返还';
    } else if (action === 'medicine-craft')
      message = craftMedicine(save, id, context.pendingRun).message;
    else if (action === 'medicine-buy' && this.view === 'shop' && context.herbsShop)
      message = buyMedicine(save, id)
        ? `${medicineInfo(id)!.name}已收入丹囊`
        : '未能购买，请检查本批货物与灵石';
    else if (action === 'medicine-recipe')
      message = buyMedicineRecipe(save, id) ? '药方已习得，本世保留' : '未能购方，请检查灵石与药方';
    else return true;
    if (!this.commit(save)) return true;
    if (starterChanged) actions.starterChanged();
    actions.refresh();
    actions.toast(message);
    return true;
  }
}
