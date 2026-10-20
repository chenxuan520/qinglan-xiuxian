export const TOUR_STEPS = [
  {
    scene: 'home',
    chapter: '行前',
    target: '.root-pentagon',
    title: '先认清这一世的资质',
    copy: '五行命盘显示你的灵根。资质影响成长速度，永久修为决定大境界；每次历练的局内等级会重新开始。',
  },
  {
    scene: 'home',
    chapter: '出发',
    target: '.journey-depart',
    title: '从这里踏入秘境',
    copy: '先看本命法宝和难度，再点「踏入秘境」。击败本关妖王才能解锁下一境；已通关的地方仍可重游。',
  },
  {
    scene: 'home',
    chapter: '人间',
    target: '.home-town-copy',
    title: '山下还有一座青岚镇',
    copy: '从这里入镇，也能前往宗门与坊市。买卖、炼丹和宗门修习都在战斗之外，不会打断你的走位。',
  },
  {
    scene: 'home',
    chapter: '设置',
    target: '[data-action="settings"]',
    title: '不想手动走位？看这里',
    copy: '音量旁的齿轮打开设置。下一步带你看看自动历练、培养倾向和其他选项。',
  },
  {
    scene: 'settings',
    chapter: '设置',
    target: '#settings-autoplay-title',
    title: '自动历练，由你决定',
    copy: '开启后自动走位、拾取与选技。培养倾向只改变选技取舍，不改变出现概率；手动移动随时可以接管。',
  },
  {
    scene: 'settings',
    chapter: '设置',
    target: '#settings-sound-title',
    title: '声音与离线资源',
    copy: '这里调节音乐与音效。下方「离线资源」默认折叠，需要时可缓存整包资源，或清除资源缓存；不会删除存档。',
  },
  {
    scene: 'treasure',
    chapter: '法宝',
    target: '.evolution-recipe',
    title: '本命、炼器与仙器各是什么',
    copy: '本命是入场自带的法宝，炼器增幅跨局保留。详情列出配套功法：局内法宝六重、任一配套功法五重，再选择觉醒。',
  },
  {
    scene: 'cultivation',
    chapter: '根基',
    target: '.training-card:first-child h3',
    title: '卡关后，回洞府补足根基',
    copy: '淬体、悟道、身法分别改善气血、伤害与机动。先看每阶收益和费用，再按短板修习；这些成长跨局保留。',
  },
  {
    scene: 'medicine',
    chapter: '丹药',
    target: '.medicine-card header',
    title: '丹药要在出发前服用',
    copy: '药谱写明真实效果与持续年岁。身上最多三种限时药效，同名丹药累加时长；有未结束的历练时不能服药或炼丹。',
  },
  {
    scene: 'battle',
    chapter: '战斗',
    target: '.player-panel',
    title: '境界和局内等级，分开看',
    copy: '左上是气血、永久修为与年岁；LV 是本局等级。永久修为实时积累，局内等级用来选择法宝和功法。',
  },
  {
    scene: 'battle',
    chapter: '战斗',
    target: '.stage-timer',
    title: '撑过历练，还要击败妖王',
    copy: '上方显示当前秘境和时间。普通秘境历练达到指定时长后妖王登场；击败它才算通关，计时到点不等于已经获胜。',
  },
  {
    scene: 'battle',
    chapter: '战斗',
    target: '.combat-actions',
    title: '暂停、伤害统计与自动历练',
    copy: '右上可以暂停或查看伤害统计。自动历练能随时开关，手动走位会立即接管；不用反复点击攻击。',
  },
  {
    scene: 'battle',
    chapter: '走位',
    target: '.tour-practice-area',
    title: '走两步试试',
    copy: '演练中，电脑按 WASD 或方向键，手机拖动亮起的战场。实际历练也可左键点地前往，移动键随时接管；法宝自动攻击。',
  },
  {
    scene: 'battle',
    chapter: '搭配',
    target: '.equipped-slots',
    title: '下方查看这一局的法宝',
    copy: '最多携带六件法宝、四种功法。先把常用法宝和配套功法练起来，比不停选新法宝更容易成型。',
  },
  {
    scene: 'upgrade',
    chapter: '升级',
    target: '.choice-card',
    title: '升级时，点整张卡片选择',
    copy: '灵气攒满后出现机缘，选择期间暂停。看清升阶效果与配套功法；不合适时可用有限的「重悟机缘」刷新。',
  },
  {
    scene: 'result',
    chapter: '归来',
    target: '.result-actions',
    title: '通关向前，卡关也有所得',
    copy: '通关后可以前往下一秘境，也可回首页炼器、修习或备药。普通历练失败结算仍保留本次收益，再试时永久成长还在。',
  },
] as const;

type Size = { width: number; height: number };
type Rect = Size & { left: number; top: number };
export function tourPlacement(target: Rect, viewport: Size, card: Size) {
  const gap = 14,
    edge = 12;
  const x = Math.max(6, Math.min(target.left - 6, viewport.width - 6));
  const y = Math.max(6, Math.min(target.top - 6, viewport.height - 6));
  const width = Math.max(0, Math.min(target.left + target.width + 6, viewport.width - 6) - x);
  const height = Math.max(0, Math.min(target.top + target.height + 6, viewport.height - 6) - y);
  const candidates = [
    { x: x + width + gap, y },
    { x: x - card.width - gap, y },
    { x, y: y + height + gap },
    { x, y: y - card.height - gap },
  ];
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(edge, Math.min(p.x, viewport.width - card.width - edge)),
    y: Math.max(edge, Math.min(p.y, viewport.height - card.height - edge)),
  });
  const overlap = (p: { x: number; y: number }) =>
    Math.max(0, Math.min(x + width, p.x + card.width) - Math.max(x, p.x)) *
    Math.max(0, Math.min(y + height, p.y + card.height) - Math.max(y, p.y));
  const best = candidates.map(clamp).sort((a, b) => overlap(a) - overlap(b))[0];
  return { hole: { x, y, width, height }, card: best };
}
