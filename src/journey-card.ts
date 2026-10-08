import { encode } from 'uqr';
import { assetUrl } from './asset-url.ts';
import { chronicleAchievements } from './chronicle.ts';
import {
  ELEMENTS,
  elementInfo,
  FINAL_TRIAL_STAGE,
  pathInfo,
  REALMS,
  REALM_VERSES,
  spiritRootInfo,
  STAGES,
  treasure,
  type SpiritRootId,
} from './data.ts';
import { HUMAN_STORY_IDS, humanStoryView } from './human-stories.ts';
import { itemArt } from './item-art.ts';
import {
  journeyAppraisalFacts,
  localJourneyAppraisal,
  type JourneyCardEnding,
} from './journey-appraisal.ts';
import { resolveJourneyAppraisal } from './journey-appraisal-ai.ts';
import { SECTS } from './mortal-data.ts';
import { sectRole } from './mortal.ts';
import { drawPlayerFormation } from './player-formation.ts';
import { lifespanInfo, realmInfo, type SaveData } from './progress.ts';
import { GAME_SITE_URL } from './setting.ts';
import { spriteFrame } from './sprites.ts';

export const JOURNEY_CARD_QR = encode(GAME_SITE_URL, { ecc: 'M', border: 4 });
export const JOURNEY_CARD_QR_COLORS = { light: '#e1d3a4', dark: '#102b28' } as const;
export type { JourneyCardEnding } from './journey-appraisal.ts';
const ROOT_SEALS: Record<SpiritRootId, string> = {
  heaven: '天',
  variant: '异',
  dual: '凡',
  triple: '凡',
  quad: '伪',
  five: '伪',
  none: '废',
};
const REALM_COLORS = [
  '#a6dac7',
  '#b7d8ec',
  '#f3d288',
  '#a6efd6',
  '#dfc1f4',
  '#a9c5f3',
  '#e9d6a5',
  '#f6dd97',
  '#d9e8ff',
];
const ACHIEVEMENT_PRIORITY = [
  'hard-immortal',
  'rootless-immortal',
  'three-paths',
  'training-master',
  'mastery',
  'collection',
  'level-100',
  'permanent-medicine',
  'forge',
  'story',
];

function loadImage(path: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const fail = () => {
      clearTimeout(timeout);
      image.onload = image.onerror = null;
      reject(new Error('留影素材加载失败，请稍后重试'));
    };
    const timeout = setTimeout(fail, 15000);
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = fail;
    image.src = assetUrl(path);
  });
}

export function journeyAppraisalLines(
  value: string,
  measure: (value: string) => number,
  width: number,
  maxLines: number,
  size: number,
) {
  const closing = /^[，。！？；：、）》」』】”’]$/;
  const split = (target: number) => {
    const lines: string[] = [];
    let row = '';
    for (const char of value) {
      if (row && measure(row + char) > target) {
        if (closing.test(char)) {
          if (measure(row + char) <= width) {
            row += char;
            continue;
          }
          const previous = Array.from(row);
          let carried = previous.pop()!;
          while (previous.length && closing.test(carried[0])) carried = previous.pop()! + carried;
          if (previous.length) lines.push(previous.join(''));
          row = carried;
        } else {
          lines.push(row);
          row = '';
        }
      }
      row += char;
    }
    if (row) lines.push(row);
    return lines;
  };
  const count = Math.min(maxLines, Math.max(1, Math.ceil(measure(value) / width)));
  const balanced = split(Math.min(width, measure(value) / count + size / 2));
  return balanced.length <= maxLines ? balanced : split(width);
}

function drawRealmFigure(c: CanvasRenderingContext2D, image: HTMLImageElement, realmIndex: number) {
  const color = REALM_COLORS[realmIndex];
  c.save();
  const glow = c.createRadialGradient(540, 490, 20, 540, 490, 290);
  glow.addColorStop(0, `${color}38`);
  glow.addColorStop(0.65, `${color}12`);
  glow.addColorStop(1, `${color}00`);
  c.fillStyle = glow;
  c.fillRect(200, 260, 680, 480);
  c.translate(540, 645);
  c.scale(6.5, 2.6);
  drawPlayerFormation(c, 0, 0, realmIndex, 0);
  c.restore();

  const frame = spriteFrame(0);
  c.save();
  c.shadowColor = `${color}70`;
  c.shadowBlur = 24;
  c.drawImage(
    image,
    (frame.x / 1536) * image.naturalWidth,
    (frame.y / 1024) * image.naturalHeight,
    image.naturalWidth / frame.columns,
    image.naturalHeight / frame.rows,
    382,
    304,
    316,
    421,
  );
  c.restore();
}

function drawRootDisc(
  c: CanvasRenderingContext2D,
  root: ReturnType<typeof journeyCardData>['root'],
) {
  const x = 270;
  const y = 958;
  const radius = 82;
  const vertices = root.elements.map((element, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return { ...element, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  c.save();
  c.translate(x, y);
  const glow = c.createRadialGradient(0, 0, 15, 0, 0, 125);
  glow.addColorStop(0, '#d4cd9b18');
  glow.addColorStop(1, '#d4cd9b00');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(0, 0, 125, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#c2ce9d50';
  c.lineWidth = 1.5;
  c.setLineDash([3, 8]);
  c.beginPath();
  c.arc(0, 0, radius, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.beginPath();
  vertices.forEach((point, i) => (i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)));
  c.closePath();
  c.stroke();
  for (const point of vertices) {
    c.strokeStyle = '#c2ce9d50';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(point.x, point.y);
    c.stroke();
    c.shadowBlur = point.active ? 18 : 0;
    c.shadowColor = point.color;
    c.fillStyle = point.active ? point.color : '#203e36';
    c.strokeStyle = point.active ? point.color : '#6f8379';
    c.beginPath();
    c.arc(point.x, point.y, 13, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = point.active ? point.color : '#879c91';
    c.font = '600 18px "Noto Serif SC", "Songti SC", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(point.name, point.x * 1.34, point.y * 1.34);
  }
  c.fillStyle = '#102b28e8';
  c.beginPath();
  c.arc(0, 0, 46, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#b2c0a9';
  c.font = '400 13px "Noto Serif SC", "Songti SC", serif';
  c.fillText('此世灵根', 0, -21);
  c.fillStyle = '#e1d3a4';
  c.font = '600 38px "Noto Serif SC", "Songti SC", serif';
  c.fillText(root.seal, 0, 7);
  c.fillStyle = '#bcc7af';
  c.font = '400 15px "Noto Serif SC", "Songti SC", serif';
  c.fillText(root.name, 0, 33);
  c.restore();
}

export function journeyCardData(save: SaveData, ending?: JourneyCardEnding) {
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const life = lifespanInfo(save);
  const sect = SECTS.find((s) => s.id === save.mortal.member?.id);
  const root = spiritRootInfo(save.spiritRoot);
  const weapon = treasure(save.starter);
  const state =
    ending ??
    (save.journeyEnded && realm.max
      ? 'immortal'
      : (save.pendingReincarnation ??
        (life.remaining === 0 && Number.isFinite(life.limit) ? 'lifespan' : 'ongoing')));
  const memories: Array<{ title: string; detail: string }> = [];
  const home = save.mortal.hometown;
  if (home?.letterRead)
    memories.push({ title: '家书犹存', detail: '归乡展读家书，仍记门前的叮嘱' });
  else if (home && Object.hasOwn(save.chronicle.milestones, 'home-reunion'))
    memories.push({ title: '曾归故里', detail: '修行途中，曾回青岚与亲人相见' });
  const companion = save.mortal.humanStories?.companion;
  if (companion?.choice === 'bond') {
    const view = humanStoryView(save, 'companion')!;
    memories.push({ title: '人间有归灯', detail: `曾与${view.name}结为凡人道侣` });
  } else {
    const id = HUMAN_STORY_IDS.find((id) => {
      const story = save.mortal.humanStories?.[id];
      return story && save.age >= story.endsAt;
    });
    if (id) {
      const view = humanStoryView(save, id)!;
      memories.push({
        title: '旧信犹温',
        detail: `${view.name}留下的旧信${save.mortal.humanStories![id]!.read ? '，已珍藏于此世' : '，尚未展读'}`,
      });
    }
  }
  for (const feat of chronicleAchievements(save).sort(
    (a, b) => ACHIEVEMENT_PRIORITY.indexOf(a.id) - ACHIEVEMENT_PRIORITY.indexOf(b.id),
  ))
    if (feat.achieved && feat.id !== 'six-immortals' && feat.id !== 'five-tribulations')
      memories.push({ title: feat.title, detail: feat.detail });
  if (Object.hasOwn(save.chronicle.milestones, 'six-immortals'))
    memories.push({ title: '六仙同御', detail: '曾在一场历练中同时觉醒六件仙器' });
  if (save.tribulations > 0)
    memories.push({
      title: `历劫 ${save.tribulations.toLocaleString('zh-CN', { useGrouping: false })} 次`,
      detail: '渡过的天劫，已化作此世劫印',
    });
  if (save.completed.length)
    memories.push({ title: `踏破 ${save.completed.length} 境`, detail: '山河走过，皆为此世来路' });
  memories.push({
    title: `本命 · ${treasure(save.starter).name}`,
    detail: save.forge[save.starter]
      ? `炼器 ${save.forge[save.starter]} 阶`
      : '伴此行山海，问一程长生',
  });
  if (save.chronicle.milestones.departure === 15)
    memories.push({ title: '十五岁启程', detail: '从青岚镇出发，向山海外求道' });
  const deepest = Math.max(-1, ...save.completed);
  return {
    realm: realm.name,
    realmIndex: realm.index,
    realmVerse: REALM_VERSES[realm.ascending ? '渡劫' : REALMS[realm.index]],
    age: save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false }),
    lifespan: Number.isFinite(life.limit)
      ? `寿限 ${life.limit.toLocaleString('zh-CN', { useGrouping: false })} 年`
      : '寿元无尽',
    root: {
      name: root.name,
      seal: ROOT_SEALS[save.spiritRoot],
      elements: ELEMENTS.map((element) => ({
        ...element,
        active: save.rootElements.includes(element.id),
      })),
    },
    weapon: {
      id: weapon.id,
      name: weapon.name,
      element: elementInfo(weapon.element).name,
      forge: save.forge[weapon.id] ?? 0,
    },
    identity: `${pathInfo(save.path).name} · ${sect ? `${sect.name} · ${sectRole(save)}` : '散修'}`,
    ending: state,
    ended: save.journeyEnded && realm.max,
    progress: { count: save.completed.length, deepest: deepest < 0 ? null : STAGES[deepest].name },
    appraisal: localJourneyAppraisal(journeyAppraisalFacts(save, state)),
    memories: memories.slice(0, 4),
  };
}

export async function createJourneyCard(
  save: SaveData,
  ending?: JourneyCardEnding,
  signal: AbortSignal = new AbortController().signal,
) {
  signal.throwIfAborted();
  const card = journeyCardData(save, ending);
  const playerFrame = spriteFrame(0);
  const weaponArt = itemArt(card.weapon.id)!;
  let fontTimeout: ReturnType<typeof setTimeout> | undefined;
  const fontReady = Promise.race([
    Promise.all(
      [400, 600].map((weight) => document.fonts.load(`${weight} 30px "Noto Serif SC"`, '此世留影')),
    ),
    new Promise<never>((_, reject) => {
      fontTimeout = setTimeout(() => reject(new Error('留影字体加载超时')), 15000);
    }),
  ]).finally(() => clearTimeout(fontTimeout));
  const [image, playerImage, weaponImage, , appraisal] = await Promise.all([
    loadImage(
      card.ending === 'immortal'
        ? '/assets/qinglan-prologue.webp'
        : '/assets/qinglan-prologue-dark.webp',
    ),
    loadImage(playerFrame.url),
    loadImage(weaponArt.src),
    fontReady,
    resolveJourneyAppraisal(journeyAppraisalFacts(save, card.ending), signal),
  ]);
  signal.throwIfAborted();
  card.appraisal = appraisal;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1740;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('此浏览器无法生成留影');
  c.fillStyle = '#102b28';
  c.fillRect(0, 0, canvas.width, canvas.height);
  // 山水居于人物身后；按比例居中裁切，不拉伸已有画作。
  const sourceWidth = (image.naturalHeight * 984) / 790;
  c.drawImage(
    image,
    (image.naturalWidth - sourceWidth) / 2,
    0,
    sourceWidth,
    image.naturalHeight,
    48,
    48,
    984,
    790,
  );
  const shade = c.createLinearGradient(0, 48, 0, 838);
  shade.addColorStop(0, '#102b28b0');
  shade.addColorStop(0.3, '#102b2890');
  shade.addColorStop(0.65, '#102b2840');
  shade.addColorStop(1, '#102b28');
  c.fillStyle = shade;
  c.fillRect(48, 48, 984, 790);
  c.strokeStyle = '#c2b78680';
  c.lineWidth = 2;
  c.strokeRect(38, 38, 1004, 1664);
  c.strokeStyle = '#c2b78630';
  c.lineWidth = 1;
  c.strokeRect(48, 48, 984, 1644);

  const setFont = (size: number) => {
    c.font = `${size >= 34 ? 600 : 400} ${size}px "Noto Serif SC", "Songti SC", "STSong", serif`;
  };
  // 手动字距兼容较旧的手机浏览器，仅用于评语，不改动其他区域字体。
  let tracking = 0;
  const measure = (value: string) =>
    tracking
      ? Array.from(value).reduce((width, char) => width + c.measureText(char).width, 0) +
        Math.max(0, Array.from(value).length - 1) * tracking
      : c.measureText(value).width;
  const fit = (value: string, width: number) => {
    if (measure(value) <= width) return value;
    const chars = Array.from(value);
    while (chars.length && measure(chars.join('') + '…') > width) chars.pop();
    return chars.join('') + '…';
  };
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = '#eee8cf',
    width = 920,
  ) => {
    setFont(size);
    c.fillStyle = color;
    const fitted = fit(value, width);
    if (!tracking) c.fillText(fitted, x, y);
    else {
      let offset = x;
      for (const char of fitted) {
        c.fillText(char, offset, y);
        offset += c.measureText(char).width + tracking;
      }
    }
  };
  const wrap = (
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    maxLines: number,
    lineHeight = size + 12,
  ) => {
    setFont(size);
    const lines = journeyAppraisalLines(value, measure, width, maxLines, size);
    lines.slice(0, maxLines).forEach((line, i) => {
      const clipped =
        i === maxLines - 1 && lines.length > maxLines
          ? fit(line + lines.slice(maxLines).join(''), width)
          : line;
      text(clipped, x, y + i * lineHeight, size, '#c7cfb8', width);
    });
  };
  const line = (y: number) => {
    c.strokeStyle = '#c2b78650';
    c.beginPath();
    c.moveTo(80, y);
    c.lineTo(1000, y);
    c.stroke();
  };
  const state = {
    immortal: ['圆满', '已叩入仙门'],
    lifespan: ['寿终', '此世寿终'],
    tribulation: ['劫殒', '止于天劫'],
    ongoing: ['未竟', '仙途未尽'],
  }[card.ending];
  text('叩仙门 · 青岚纪', 80, 106, 27, '#d8c998');
  text('此 世 留 影', 80, 171, 48);
  c.fillStyle = '#794b37dd';
  c.fillRect(896, 86, 84, 132);
  c.strokeStyle = '#d2b790';
  c.strokeRect(904, 94, 68, 116);
  text('此世', 913, 138, 24, '#efdfbd', 58);
  text(state[0], 913, 182, 24, '#efdfbd', 58);
  c.save();
  c.textAlign = 'center';
  text(card.realm, 540, 248, 50, '#eee8cf', 720);
  text(
    `${card.ending === 'lifespan' || card.ending === 'tribulation' ? '此世行年' : '行年'} ${card.age} 载 · ${card.lifespan}`,
    540,
    290,
    28,
    '#e1d3a4',
    850,
  );
  c.restore();
  drawRealmFigure(c, playerImage, card.realmIndex);
  c.save();
  c.textAlign = 'center';
  text(card.realmVerse, 540, 748, 27, REALM_COLORS[card.realmIndex], 820);
  text(card.identity, 540, 809, 30, '#e2dfc9', 880);
  c.restore();
  line(834);
  drawRootDisc(c, card.root);
  text('本 命 法 宝', 570, 873, 26, '#b2c0a9');
  const weaponWidth = weaponImage.naturalWidth / 4;
  const weaponHeight = weaponImage.naturalHeight / weaponArt.rows;
  c.fillStyle = '#0b332d';
  c.fillRect(566, 891, 136, 136);
  c.drawImage(
    weaponImage,
    weaponArt.column * weaponWidth,
    weaponArt.row * weaponHeight,
    weaponWidth,
    weaponHeight,
    570,
    895,
    128,
    128,
  );
  c.strokeStyle = '#c2b78670';
  c.strokeRect(566, 891, 136, 136);
  text(card.weapon.name, 728, 950, 34, '#ece7d1', 270);
  text(`${card.weapon.element}系 · 炼器 ${card.weapon.forge} 阶`, 728, 996, 28, '#bcc7af', 270);
  c.save();
  c.textAlign = 'center';
  text(
    `踏破 ${card.progress.count} / 7 境${card.progress.deepest ? ` · 最深 ${card.progress.deepest}` : ' · 尚未踏破秘境'}`,
    540,
    1092,
    30,
    '#d8c998',
    880,
  );
  c.restore();
  line(1100);
  text('此 世 留 痕', 80, 1142, 28, '#d8c998');
  card.memories.forEach((memory, i) => {
    const x = 84 + (i % 2) * 450;
    const y = 1204 + Math.floor(i / 2) * 82;
    c.fillStyle = '#cfbc87';
    c.fillRect(x, y - 18, 5, 48);
    text(memory.title, x + 30, y, 25, '#e5d7ad', 380);
    text(memory.detail, x + 30, y + 28, 18, '#b9c7b1', 380);
  });
  line(1340);
  text('此 世 评 语', 80, 1378, 26, '#b2c0a9');
  tracking = 2;
  text(card.appraisal.title, 80, 1432, 36, '#e1d3a4', 610);
  tracking = 1.5;
  wrap(card.appraisal.detail, 80, 1490, 26, 610, 4, 44);
  tracking = 0;
  text(state[1], 80, 1658, 22, '#d8c998', 610);
  text(new URL(GAME_SITE_URL).host, 80, 1683, 18, '#aabda8', 610);

  // 整数像素绘制并保留四格浅色静区，二维码只编码官网，不携带存档。
  const moduleSize = 7;
  const qrSize = JOURNEY_CARD_QR.size * moduleSize;
  const qrX = 1000 - qrSize;
  const qrY = 1688 - qrSize;
  c.fillStyle = JOURNEY_CARD_QR_COLORS.light;
  c.fillRect(qrX, qrY, qrSize, qrSize);
  c.fillStyle = JOURNEY_CARD_QR_COLORS.dark;
  JOURNEY_CARD_QR.data.forEach((row, y) =>
    row.forEach((black, x) => {
      if (black) c.fillRect(qrX + x * moduleSize, qrY + y * moduleSize, moduleSize, moduleSize);
    }),
  );
  return canvas.toDataURL('image/png');
}
