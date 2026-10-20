import { isExtremeLife, rewardDisabled } from './life-mode.ts';
import { FINAL_TRIAL_STAGE, MAX_REVIVES, elementInfo, spiritRootInfo, treasure } from './data.ts';
import { lifespanInfo, realmInfo, type SaveData } from './progress.ts';
import type { Game } from './game.ts';
import {
  birthInheritanceNotice,
  inheritanceContent,
  isImmortalSuccessor,
} from './inheritance-ui.ts';
import { ROOT_IMPRESSIONS, spiritRootDiagram, spiritRootEffects } from './common-ui.ts';
import { icon, smallIcon } from './icons.ts';
import { SUPPORT_CODE_IMAGE } from './setting.ts';
import { assetUrl } from './asset-url.ts';
import { AD_SECONDS } from './ads.ts';
import type { PanelParts } from './panel-host.ts';

export const PROLOGUE_IMAGE = '/assets/qinglan-prologue-dark.webp';

export function currentRealm(save: SaveData, offset = 0) {
  return realmInfo(save.cultivation - offset, save.completed.includes(FINAL_TRIAL_STAGE));
}

export function epilogueModal(save: SaveData): string {
  return `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene epilogue-scene" role="dialog" aria-modal="true" aria-labelledby="epilogue-title" tabindex="-1"><div class="prologue-controls"><button class="prologue-sound" data-action="epilogue-sound" aria-pressed="${save.sound}">${smallIcon(save.sound ? 'sound' : 'mute')}<span>${save.sound ? '关闭声音' : '开启声音'}</span></button><button class="prologue-skip" data-action="journey-card">留存此世</button></div><div class="prologue-heading"><span class="eyebrow">叩仙门：青岚纪 · 终章</span><h1 id="epilogue-title">云开<span>见长生</span></h1><p>此去长生，亦记人间。</p><span class="prologue-seal">此世圆满</span></div><div class="prologue-story" tabindex="0" aria-label="终章正文"><p>青岚山下，又是一年春水。炊烟漫过新修的青瓦，渡口有人挑起归灯。茶馆里醒木一响，说书人讲起一位从小镇走出的少年——讲到后来，连他的姓名，也渐渐成了传说。</p><p>你立在云海尽头，身后七境归于寂静。曾经惊心的雷声，已远得像一场旧雨。眼前仙门缓缓开启，没有谁问你斩过多少妖、炼成多少法，只见门上浮光如水，映出十五岁那年的衣衫。</p><p>那时行囊很轻，前路很远。你听闻天地间有长生，便以为走得足够远，就能将离别留在身后。直到春秋从指间流过，旧桥几度重修，熟悉的声音一个个散入晚风，才懂得：有些相逢虽只一瞬，也足以陪人走完漫长的一生。</p><p>仙门外的风吹动衣襟，你下意识拢了拢。恍惚间，青岚渡口的旧风，又从岁月深处吹来。</p><p>叩门之前，你曾最后回了一趟青岚。渡口坐着一个十五岁的少年，望着远山，问你外面的天地究竟有多大。你便在他身旁坐下，说起竹海之外的山川、云海尽头的星辰，也说起求道路上的风雪与险恶。末了，你告诉他：山河之外，还有求长生、问大道的路。</p><p>少年听得出神，眼里有一簇你熟悉的光。你忽然想起，许多年前，也有一位过路修士，在这里向你说过同样的话。临别时你替他拢好被风吹开的衣襟，只道：路远，记得添衣。</p><p>你望了一眼他的行囊。前路的风雪，终须他自己走过。只是随身之物中，或有一样还能留在人间，让渡口这点暖意，替你多陪他一程。</p><p>一步踏出，仙门在身后合拢。凡间不再有你的归舟，山河却仍循着自己的时序，迎春，送雪。而那个少年，终于背起轻轻的行囊，朝青岚山深处走去。</p><p class="prologue-last">山河未老，故人先秋。<br>幸而此心未改，来路仍明。<br><br>这一程山水，至此落笔。<br>长生已觅，大道无涯。</p></div><footer class="prologue-footer"><span>此界圆满 · 真仙<br>叩门于 ${save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁</span><button class="primary-button" data-action="epilogue-reincarnate">离界传缘 ${smallIcon('arrow')}</button></footer></section></div>`;
}

export function prologueModal(save: SaveData, replay = false): string {
  const successor = isImmortalSuccessor(save);
  return `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene" role="dialog" aria-modal="true" aria-labelledby="prologue-title" tabindex="-1"><div class="prologue-controls"><button class="prologue-sound" data-action="prologue-sound" aria-pressed="${save.sound}">${smallIcon(save.sound ? 'sound' : 'mute')}<span>${save.sound ? '关闭声音' : '开启声音'}</span></button><button class="prologue-skip" data-action="${replay ? 'prologue-enter' : 'prologue-skip'}">${replay ? '返回仙途' : '跳过开场'} ${smallIcon('arrow')}</button></div><div class="prologue-heading"><span class="eyebrow">叩仙门：青岚纪 · 序</span><h1 id="prologue-title">${successor ? '少年<span>承缘</span>' : '山河<span>一梦</span>'}</h1><p>${successor ? '前人离界，山河又一程。' : '山河未老，故人先秋。'}</p><span class="prologue-seal" aria-hidden="true">问长生</span></div><div class="prologue-story" tabindex="0" aria-label="序章正文"><p>青岚山下，有一座临水的小镇。清晨炊烟漫过青瓦，暮色里渔火一盏盏亮起。人们在此迎春、送雪，把一生过成几声钟响。</p><p>你便生在这座小镇。儿时听过茶馆的醒木，也曾在渡口等过一盏归灯。镇上的人总说，稻熟一季，人又老了一岁。你渐渐明白，有些告别，来年春天也等不回。</p><p>${successor ? '十五岁那年，渡口的修士临行前告诉你：他已证得长生，将离开此界，而山河之外，还有求长生、问大道的路。' : '十五岁那年，一位过路修士告诉你：山河之外，还有求长生、问大道的路。'}于是你收拾行囊，向青岚山深处走去。你想看看凡人的一生之外，天地究竟还有多远；也想在漫长岁月里，寻得一个不负此生的答案。</p><p>山外却有另一种岁月。传说云海尽头藏着仙门，一炉香可燃尽百年，一柄剑曾照彻长夜。有人得道归来，故园已成荒丘；有人问遍诸天，仍寻不回旧时的一场雨。</p><p>如今灵潮再起，沉寂的秘境次第苏醒。正道山门重开，魔宗旧灯复燃。风从竹海吹来，带着妖雾，也带着无人认领的仙缘。</p><p>你从青岚的烟火中来，以觅长生为愿，以追寻大道为志。此后每一次修行，都是向天地多问一句；而故乡的万家灯火，会在身后一代代明灭，提醒你为何出发。</p><p class="prologue-last">此去青岚，愿你历尽千劫，<br>仍记得为何出发。</p></div><footer class="prologue-footer"><span>一程山水，自此启行。</span><button class="primary-button" data-action="prologue-enter">${replay ? '返回仙途' : '入此山河'} ${smallIcon('arrow')}</button></footer></section></div>`;
}

export function hometownFarewellModal(): string {
  return '<section class="hometown-farewell" role="dialog" aria-modal="true" aria-label="家门告别"><p><small>母亲</small>路远，记得添衣。</p><p><small>父亲</small>既选了这条路，便好好走。</p><p><small>母亲</small>有空便回来。</p><button class="primary-button" data-action="hometown-continue">记下叮嘱 · 前往渡口</button></section>';
}

export function hometownChoicePanel(save: SaveData): PanelParts {
  const successor = isImmortalSuccessor(save);
  return [
    successor ? '少年将行' : '再别青岚',
    successor ? '承缘启程 · 十五岁' : '新一世 · 十五岁',
    `${successor ? '<p>渡口的修士已经离界，问道的路留给了你。启程前，可以先向家中亲人告别，也可以径直上路。</p>' : '<p>故居门前，仍有这一世的亲人。你可以再走一程，也可以径直启程。</p>'}<div class="save-actions hometown-choice-actions"><button class="primary-button" data-action="hometown-skip">径直启程</button><button class="secondary-button" data-action="hometown-walk">走一程故乡</button></div>`,
  ];
}

export function rootRevealBody(save: SaveData): string {
  const starter = treasure(save.starter);
  return `<div class="root-reveal-disc">${spiritRootDiagram(save, true)}</div><div class="root-reveal-effects"><h3>${spiritRootInfo(save.spiritRoot).name}</h3><p>${spiritRootEffects(save)}</p></div><div class="root-reveal-aside"><div class="root-reveal-starter">${icon(starter.id, starter.color)}<div><small>本命法宝 · ${elementInfo(starter.element).name}系</small><strong>${starter.name}</strong></div></div><blockquote class="root-verdict"><span>命批</span><p>${ROOT_IMPRESSIONS[save.spiritRoot].verse}</p></blockquote></div>`;
}

export function rootRevealPanel(
  save: SaveData,
  previousLife = '前尘已散，新一世从十五岁启程。',
  firstLife = false,
  body = rootRevealBody(save),
  lifeModeChoice = '',
): PanelParts {
  const successor = isImmortalSuccessor(save);
  return [
    successor ? '少年承缘，始问长生' : firstLife ? '命盘初现，始问长生' : '一念轮回，再问长生',
    successor ? '前人离界 · 后来者启程' : '命盘初现 · 此世资质',
    `<p class="root-reveal-context">${previousLife}</p><div class="root-reveal-layout">${body}</div>${birthInheritanceNotice(save.birthInheritance)}${lifeModeChoice}<div class="root-reveal-actions"><button class="primary-button" data-action="accept-root">道心已明 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="reroll-root">${successor ? '重看命盘' : '轮回转世'}</button></div>`,
    true,
  ];
}

export function tribulationPendingPanel(
  save: SaveData,
  assetsReady: boolean,
  pendingTribulation: boolean,
): PanelParts {
  return [
    '天劫将至',
    `第 ${save.tribulations + 1} 次天劫 · 两万年一劫`,
    `<p class="pause-description">当前历练已保存。渡劫场只有一位「天劫」，看清预警、侧移避雷，在核心显露时反击。</p><p class="panel-note">携带当前搭配；无未完成历练时，本命在渡劫场临时觉醒。渡劫期间不计龄、不掉经验或回血宝物。${isExtremeLife(save) ? '极限修行不可退离或复活，战败即此世落幕；未完战斗刷新或关闭后重开也将身陨。' : `战败可使用本次天劫的 ${MAX_REVIVES} 次广告复活；放弃后可先留存此世，再确认轮回。`}</p><p class="boss-reward">渡劫成功：永久气血 +3% · 法宝伤害 +2%<small>劫印按次数累加，轮回清空；胜利后返回原历练。</small></p><div class="save-actions"><button class="primary-button" data-action="tribulation-start" ${assetsReady ? '' : 'disabled'}>${pendingTribulation ? '继续迎劫' : '迎战天劫'}</button><button class="secondary-button" data-action="tribulation-forfeit" ${isExtremeLife(save) ? 'disabled title="极限模式不可弃劫"' : ''}>放弃渡劫 · 此世落幕</button></div>`,
  ];
}

export function tribulationForfeitPanel(game: Game | null): PanelParts {
  return [
    '放弃渡劫',
    '确认放弃这一世修行',
    `<p class="pause-description">确认轮回后，境界、物资、法宝收藏、炼器、根基、劫印和已保存的原历练都会清空，并重新随机灵根。</p><p class="panel-note">${game && isExtremeLife(game.save) ? '极限修行不可复活或退离；战败即此世落幕。' : game?.tribulation && game.revivesUsed >= MAX_REVIVES ? '本次天劫的广告复活次数已用尽。' : '可以继续迎劫；已阵亡时可看广告复活。'}确认放弃后可先留存此世，再决定轮回。</p><div class="save-actions"><button class="secondary-button" data-action="cancel-forfeit">继续迎劫</button><button class="primary-button" data-action="confirm-forfeit">确认弃劫 · 此世落幕</button></div>`,
  ];
}

export function tribulationWonPanel(
  save: SaveData,
  report: string,
  hasPendingRun: boolean,
): PanelParts {
  return [
    '天劫已破',
    `第 ${save.tribulations} 枚劫印 · 大道再进`,
    `<div class="result-seal">渡劫</div><p class="boss-reward">永久气血 +3% · 法宝伤害 +2%<small>累计气血 +${save.tribulations * 3}% · 伤害 +${save.tribulations * 2}% · 下一劫在 ${save.nextTribulationAge.toFixed(1)} 岁</small></p>${report}<button class="primary-button guide-close" data-action="${hasPendingRun ? 'restore' : 'home'}">${hasPendingRun ? '返回原历练' : '返回洞府'}</button>`,
  ];
}

export function journeyFarewellPanel(
  reason: NonNullable<SaveData['pendingReincarnation']>,
): PanelParts {
  const tribulation = reason === 'tribulation';
  const ambush = reason === 'ambush';
  const extreme = reason === 'extreme';
  return [
    extreme ? '大道无情，生死有命' : ambush ? '身陨坊外' : tribulation ? '止于天劫' : '此世寿终',
    extreme
      ? '极限修行 · 此世落幕'
      : ambush
        ? '刀光已寂 · 一生落笔'
        : tribulation
          ? '劫雷未息 · 一生落笔'
          : '寿数已尽 · 一生落笔',
    `<div class="lifespan-story"><p>${extreme ? '问道的脚步止于险境，山风仍穿过青岚。此世虽已落幕，来时的心意仍留在山河之间。' : ambush ? '坊外的风仍穿过荒草，刀光却已远去。这一世的问道路，止在了归途之前。' : tribulation ? '劫雷落尽，这一世的问道路止于仙关之前。' : '这一世已行至尽头。'}山河仍在，旧事、故人与求道路上的每一步，也都留在身后。</p><p>可将此世修行留作一幅纪念；无论是否留存，确认轮回后都将从十五岁重新启程。</p></div><div class="save-actions"><button class="secondary-button" data-action="journey-card">留存此世</button><button class="primary-button" data-action="confirm-journey-reincarnate">轮回转世 ${smallIcon('arrow')}</button></div>`,
  ];
}

export function lifespanEndPanel(save: SaveData): PanelParts {
  const life = lifespanInfo(save);
  return [
    '一生将尽，山河仍远',
    '寿元已尽 · 此世未了',
    `<div class="lifespan-story"><p>灵力渐渐散去，你抬起手，才看清指间不知何时添了这样深的纹路。走过的山川一一浮现，最后停在十五岁那年的青岚渡口——那时行囊很轻，你以为前路还长。</p><p>远处似有钟声。山风拂过衣袖，你望着来时的路，久久没有言语。</p></div><p class="pause-description">此世行至${currentRealm(save).name} · 年岁 ${life.age.toFixed(1)} / ${life.limit} 年。修行已暂停。</p><p class="panel-note">${isExtremeLife(save) ? '极限模式不可借寿。此世行至寿尽，可留存此世后轮回。' : `完整观看 ${AD_SECONDS} 秒广告可增加 ${Math.round(life.base * 0.3)} 年寿元（当前境界基础寿命的 30%），保留全部修行进度。选择不再借寿后，可先留存此世，再确认轮回。`}</p><div class="save-actions"><button class="primary-button" data-action="watch-lifespan-ad" ${rewardDisabled(save)}>向天再借五百年</button><button class="secondary-button" data-action="end-lifetime">不再借寿 · 此世落幕</button></div>`,
  ];
}

export function epilogueReincarnatePanel(save: SaveData): PanelParts {
  return [
    '临行留缘',
    '真仙离界 · 少年接续',
    `<p class="pause-description">仙门已开，你将离开此界，继续追寻大道。青岚渡口的少年却才刚要启程，临行可赠他一物，也可只留一句指引。</p>${inheritanceContent(save)}<p class="panel-note">确认后将从这名十五岁青年开始新的修行。除所选赠物外，原修士的境界、物资、根基与履历不会带入，当前进度将替换为青年的旅程；确认前可返回终章留存此世。</p><div class="pause-actions"><button class="secondary-button" data-action="close">留在终章</button><button class="primary-button" data-action="confirm-reincarnate">留缘离界</button></div><figure class="reincarnate-support"><img src="${assetUrl(SUPPORT_CODE_IMAGE)}" alt="微信赞赏码" width="104" height="104" loading="lazy"><figcaption>若这一程让你有所触动，可请作者喝杯茶。<br>微信扫码，或截图后在「扫一扫」里从相册选取。</figcaption></figure>`,
  ];
}

export function immortalGatePanel(): PanelParts {
  return [
    '叩入仙门',
    '此界修行圆满 · 走向终章',
    '<p class="pause-description">你已证得长生，此界的修行即将圆满。确认后进入终章，历练、洞府和青岚镇均不可再返回，未完成的历练也会终止。</p><p class="panel-note">终章可留存此世，也可在离界时赠青岚少年一件法宝、一枚丹药或一件奇物，让他接续问道之路。你也可以暂留人间，待准备好再来。</p><div class="pause-actions"><button class="secondary-button" data-action="close">暂留人间</button><button class="primary-button" data-action="confirm-immortal-gate">叩门而入 · 走向终章</button></div>',
  ];
}

export function reincarnatePanel(): PanelParts {
  return [
    '轮回转世',
    '重启仙途',
    `<p class="pause-description">将清空此浏览器在当前网址的全部进度：累计年岁、境界修为、灵石玄铁、关卡、根基、法宝收藏与炼器，以及未完成的历练。</p><p class="panel-note">确认后无法撤销。从十五岁的凡人重新启程，收藏新本命五行对应的正魔入门法宝，重新随机灵根资质与五行，资质可能低于当前。</p><label class="reincarnate-opening"><input id="reincarnate-full-opening" type="checkbox"><span>重走十五岁那一程<small>重走序章、故居告别与离乡；不勾选则直接看新命盘。</small></span></label><div class="pause-actions"><button class="secondary-button" data-action="home">保留此世修行</button><button class="primary-button" data-action="confirm-reincarnate">确认轮回 · 清空进度</button></div>`,
  ];
}
