import { TREASURES, PASSIVES, DIFFICULTIES, treasure, passive } from './data.ts';
import { icon } from './icons.ts';

export const GUIDE_TABS = [
  { id: 'basics', title: '怎么玩' },
  { id: 'items', title: '道具说明' },
  { id: 'builds', title: '法宝与成长' },
  { id: 'save', title: '进度保存' },
];
export function guideContent(tab: string) {
  if (tab === 'items')
    return `<p class="panel-note">走近掉落物会自动拾取，无需点击。修炼「吞天纳灵」可扩大吸取范围，每重再增加 8% 灵气收益。</p><div class="item-guide-list">${[
      [
        '✦',
        '灵气结晶',
        '#aee5ca',
        '击败妖物掉落。拾取后增加本局经验，经验条满后暂停战斗并开启升级三选一；金色大结晶含有更多灵气。',
      ],
      [
        '丹',
        '回春丹',
        '#e5aaa0',
        '立即回复最大气血的 30%，不会超过气血上限。血量充足时可以先留在地面，需要时再靠近拾取。',
      ],
      [
        '灵',
        '聚灵石',
        '#a1d9e5',
        '一次吸取整个场景中已经掉落的经验灵气，不会吸走丹药、玄铁或宝匣。',
      ],
      [
        '铁',
        '玄铁',
        '#c9d4e0',
        '永久炼器材料，历练结算后收入藏器阁。与灵石一起消耗，可把任意法宝炼至五阶，每阶永久增加 8% 伤害。',
      ],
      [
        '宝',
        '精英宝匣',
        '#ead18b',
        '击败精英必定掉落。拾取时回复 20 点气血、获得 2 枚玄铁，并随机让一件未满六重的法宝升一重；若法宝全满，改为总共 4 枚玄铁。',
      ],
      [
        '◇',
        '灵石与修为',
        '#d6cd99',
        '斩妖与局内升级的修为实时入账，满额立即突破，气血与伤害加成立刻生效。通关额外修为和灵石在结束时结算；灵石用于洞府修炼和炼器，失败也有收益。',
      ],
    ]
      .map(
        ([mark, name, color, desc]) =>
          `<article class="item-guide-row"><span style="--item-color:${color}">${mark}</span><div><h3>${name}</h3><p>${desc}</p></div></article>`,
      )
      .join('')}</div>`;
  if (tab === 'builds')
    return `<div class="guide-steps"><div><b>01</b><h3>先构筑，再进化</h3><p>每局最多携带 <strong>6 件法宝、4 种功法</strong>。法宝最高六重，功法最高五重。法宝六重与对应功法三重齐备后，下次升级会优先提供仙器觉醒；觉醒带来更高伤害、更短冷却及强化招式。</p></div><div><b>02</b><h3>局内成长与永久成长</h3><p>局内等级、法宝重数和功法会在新一局重置。永久修为在斩妖、升级时实时增加，满额立即突破，永久气血 +3、法宝伤害 +2.5%，本局就生效。战斗左上角显示境界与突破进度；LV 只表示本局选技等级。境界、根基修炼和藏器阁炼器永久保留。</p></div></div><h3 class="guide-subheading">十六法宝 · 仙器配方</h3><div class="recipe-list">${TREASURES.map((t) => `<div>${icon(t.id, t.color)}<span>${t.name}<small>六重 + ${passive(t.passive).name}三重</small></span><i>→</i><strong>${t.evolution}</strong></div>`).join('')}</div><h3 class="guide-subheading">八种功法 · 每重效果</h3><div class="guide-passives">${PASSIVES.map((p) => `<p><strong>${p.name}</strong>${p.desc}</p>`).join('')}</div><h3 class="guide-subheading">入门搭配参考</h3><div class="build-tips"><p><strong>御剑雷法</strong>${treasure('sword').name} + 九霄雷符，配太玄剑经、周天星诀，持续清怪。</p><p><strong>青莲护体</strong>青莲灯 + 东皇钟，配乾坤道法、金刚不坏，处理近身妖潮。</p><p><strong>万毒困阵</strong>万毒葫 + 阴阳盘，配长生真经、吞天纳灵，聚怪持续消耗。</p></div>`;
  if (tab === 'save')
    return `<div class="guide-steps"><div><b>01</b><h3>永久进度保存在这个浏览器</h3><p>境界、修为、灵石、玄铁、关卡解锁、修炼等级、法宝炼器、本命法宝、AI 代打开关与音效设置都会自动保存在本机浏览器的 localStorage 中，无需登录。</p></div><div><b>02</b><h3>刷新后继续上次历练</h3><p>进行中的对局每 5 秒自动存一次，突破、暂停、升级选择和退出页面时也会保存。重新打开后点击「继续上次历练」，会恢复气血、时间、妖物、掉落和法宝搭配，先暂停等待你准备好；升级选择中的存档保留选项，若开启代打则自动选技。</p></div><div><b>03</b><h3>实时修为与结算收益</h3><p>实时修为和本局已入账数额一起保存，刷新续局不会重复领取。通关或失败只补发尚未入账的修为，并结算灵石、玄铁；旧版未结束对局读取时自动补发已有战绩的修为。主动放弃旧局新开时，已入账修为保留，旧局未结算的灵石、玄铁和通关奖励不保留。</p></div><div><b>04</b><h3>存档属于当前设备与网址</h3><p>换浏览器、换设备或换网址不会自动同步；清除网站数据会删除存档。隐私模式关闭后也可能清除进度。普通浏览器中打开并使用同一个网址即可继续。</p></div></div>`;
  return `<div class="guide-steps"><div><b>01</b><h3>只需走位，法宝自动施放</h3><p>电脑用 <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 或方向键移动；手机按住战斗画面拖动虚拟摇杆。无需点击攻击，法宝会自动寻找妖物施放。按 <kbd>Esc</kbd> / <kbd>P</kbd> 或右上角按钮暂停。<strong>开启「AI 代打」后自动走位、拾取与选技，优先配套功法和仙器进化。</strong>可随时关闭；按移动键或触屏拖动也能立即接管。暂停或切到后台会停止代打，通关或失败后停在结算页。</p></div><div><b>02</b><h3>收集灵气，升级三选一</h3><p>靠近青色灵气即可收集。升级可选新法宝、升阶已有法宝或修炼功法。每局有 3 次「重悟机缘」刷新选项的机会，也可按 <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> 快速选择。做选择时战斗暂停。</p></div><div><b>03</b><h3>观察预警，击败妖王</h3><p>每分钟出现携带宝匣的精英，倒计时结束后妖王现身。<strong>击败妖王才会通关</strong>，并解锁下一秘境。避开地面红圈和冲刺路线，侧向躲开远程灵弹。残血时寻找回春丹或精英宝匣。</p></div><div><b>04</b><h3>修炼根基，再赴下一境</h3><p>六处秘境的倒计时依次为 5、6、7、8、9、10 分钟，妖王战另计。每次历练所得可用于洞府修炼与法宝炼器，斩妖与升级的修为实时推动九大境界、初中后三期逐步突破，通关另有修为奖励。</p></div></div><div class="guide-difficulties">${DIFFICULTIES.map((d, i) => `<div><strong>${d.name}</strong><span>灵石 / 修为 ×${d.reward}</span><p>${['适合首次历练，熟悉走位与搭配。', '怪群更密集，适合已有搭配思路的修士。', '妖物气血与伤害显著提升，建议修炼根基后挑战。'][i]}</p></div>`).join('')}</div>`;
}
