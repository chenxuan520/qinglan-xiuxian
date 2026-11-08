// 浏览器门面：共享指南正文保持无DOM，Worker语料与游戏使用同一渲染函数。
export { GUIDE_TABS, guideContent } from './guide-content.ts';
export { bestiaryPanel } from '../content/bestiary-ui.ts';
export {
  startInterfaceTour,
  startAutomaticInterfaceTour,
  stopInterfaceTour,
  tourActive,
} from '../ui/interface-tour-source.ts';
import './guide-film.ts';
import './guide-ask-entry.ts';
