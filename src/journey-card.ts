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
  treasure,
  type SpiritRootId,
} from './data.ts';
import { HUMAN_STORY_IDS, humanStoryView } from './human-stories.ts';
import { itemArt } from './item-art.ts';
import { SECTS } from './mortal-data.ts';
import { sectRole } from './mortal.ts';
import { lifespanInfo, realmInfo, type SaveData } from './progress.ts';
import { GAME_SITE_URL } from './setting.ts';
import { spriteFrame } from './sprites.ts';

export const JOURNEY_CARD_QR = encode(GAME_SITE_URL, { ecc: 'M', border: 4 });
export const JOURNEY_CARD_QR_COLORS = { light: '#e1d3a4', dark: '#102b28' } as const;
export type JourneyCardEnding = 'ongoing' | 'lifespan' | 'tribulation' | 'immortal';
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
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('留影素材加载失败，请稍后重试'));
    image.src = assetUrl(path);
  });
}

function drawRealmFigure(c: CanvasRenderingContext2D, image: HTMLImageElement, realmIndex: number) {
  const color = REALM_COLORS[realmIndex];
  const x = 824;
  const y = 402;
  c.save();
  const glow = c.createRadialGradient(x, y, 25, x, y, 180);
  glow.addColorStop(0, `${color}45`);
  glow.addColorStop(0.55, `${color}16`);
  glow.addColorStop(1, `${color}00`);
  c.fillStyle = glow;
  c.beginPath();
  c.arc(x, y, 180, 0, Math.PI * 2);
  c.fill();
  c.translate(x, y + 12);
  c.strokeStyle = `${color}70`;
  c.lineWidth = 1.5;
  const rings = 1 + Math.floor(realmIndex / 3);
  for (let ring = 0; ring < rings; ring++) {
    c.save();
    c.rotate((realmIndex + ring) * 0.12);
    c.beginPath();
    c.ellipse(0, 0, 108 + ring * 24, 64 + ring * 13, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  const marks = Math.min(12, 3 + realmIndex);
  for (let i = 0; i < marks; i++) {
    const angle = (i / marks) * Math.PI * 2 - Math.PI / 2;
    const radius = 122 + rings * 12;
    c.save();
    c.translate(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.67);
    c.rotate(angle + Math.PI / 2);
    c.fillStyle = `${color}a0`;
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(4, 0);
    c.lineTo(0, 8);
    c.lineTo(-4, 0);
    c.closePath();
    c.fill();
    c.restore();
  }
  if (realmIndex >= 2) {
    c.shadowColor = color;
    c.shadowBlur = 18;
    c.fillStyle = color;
    c.globalAlpha = 0.7;
    c.beginPath();
    c.arc(0, -135, 8 + Math.min(10, realmIndex * 1.5), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  const frame = spriteFrame(0);
  c.save();
  c.shadowColor = `${color}80`;
  c.shadowBlur = 22;
  c.drawImage(
    image,
    (frame.x / 1536) * image.naturalWidth,
    (frame.y / 1024) * image.naturalHeight,
    image.naturalWidth / frame.columns,
    image.naturalHeight / frame.rows,
    704,
    244,
    240,
    320,
  );
  c.restore();
}

function drawRootDisc(
  c: CanvasRenderingContext2D,
  root: ReturnType<typeof journeyCardData>['root'],
) {
  const x = 286;
  const y = 674;
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
      title: `历劫 ${save.tribulations.toLocaleString('zh-CN')} 次`,
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
  return {
    realm: realm.name,
    realmIndex: realm.index,
    realmVerse: REALM_VERSES[realm.ascending ? '渡劫' : REALMS[realm.index]],
    age: save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1 }),
    lifespan: Number.isFinite(life.limit)
      ? `寿限 ${life.limit.toLocaleString('zh-CN')} 年`
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
    ending:
      ending ??
      (save.journeyEnded && realm.max
        ? ('immortal' as const)
        : life.remaining === 0 && Number.isFinite(life.limit)
          ? ('lifespan' as const)
          : ('ongoing' as const)),
    ended: save.journeyEnded && realm.max,
    memories: memories.slice(0, 4),
  };
}

export async function createJourneyCard(save: SaveData, ending?: JourneyCardEnding) {
  const card = journeyCardData(save, ending);
  const playerFrame = spriteFrame(0);
  const weaponArt = itemArt(card.weapon.id)!;
  const [image, playerImage, weaponImage] = await Promise.all([
    loadImage(
      card.ending === 'immortal'
        ? '/assets/qinglan-prologue.webp'
        : '/assets/qinglan-prologue-dark.webp',
    ),
    loadImage(playerFrame.url),
    loadImage(weaponArt.src),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#102b28';
  c.fillRect(0, 0, canvas.width, canvas.height);
  const imageHeight = 500;
  c.drawImage(
    image,
    0,
    0,
    image.naturalWidth,
    (image.naturalWidth * imageHeight) / 984,
    48,
    48,
    984,
    imageHeight,
  );
  const shade = c.createLinearGradient(0, 48, 0, 700);
  shade.addColorStop(0, '#102b2820');
  shade.addColorStop(0.3, '#102b2870');
  shade.addColorStop(0.75, '#102b28e8');
  shade.addColorStop(1, '#102b28');
  c.fillStyle = shade;
  c.fillRect(48, 48, 984, 652);
  c.strokeStyle = '#c2b78680';
  c.lineWidth = 2;
  c.strokeRect(38, 38, 1004, 1364);
  c.strokeStyle = '#c2b78630';
  c.lineWidth = 1;
  c.strokeRect(48, 48, 984, 1344);

  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = '#eee8cf',
    width = 900,
  ) => {
    c.font = `${size >= 34 ? 600 : 400} ${size}px "Noto Serif SC", "Songti SC", "STSong", serif`;
    c.fillStyle = color;
    c.fillText(value, x, y, width);
  };
  const line = (y: number) => {
    c.strokeStyle = '#c2b78650';
    c.beginPath();
    c.moveTo(80, y);
    c.lineTo(1000, y);
    c.stroke();
  };
  text('叩仙门', 80, 148, 80);
  text('青 岚 纪', 85, 198, 27, '#d8c998');
  text('此 世 留 影', 85, 246, 21, '#b4c2ad');
  c.fillStyle = '#794b37dd';
  c.fillRect(890, 90, 84, 136);
  c.strokeStyle = '#d2b790';
  c.strokeRect(898, 98, 68, 120);
  text('此世', 909, 143, 23, '#efdfbd', 58);
  text(
    card.ending === 'immortal'
      ? '圆满'
      : card.ending === 'lifespan'
        ? '寿终'
        : card.ending === 'tribulation'
          ? '劫殒'
          : '未竟',
    909,
    183,
    23,
    '#efdfbd',
    58,
  );

  text(card.realm, 80, 367, 74);
  text(`行年 ${card.age} 载`, 84, 438, 42, '#e1d3a4');
  text(card.lifespan, 86, 485, 24, '#bcc7af');
  text(card.realmVerse, 84, 523, 20, REALM_COLORS[card.realmIndex], 560);
  drawRealmFigure(c, playerImage, card.realmIndex);
  line(548);
  drawRootDisc(c, card.root);
  text('本 命 法 宝', 620, 580, 20, '#b2c0a9');
  const weaponSize = 166;
  const weaponWidth = weaponImage.naturalWidth / 4;
  const weaponHeight = weaponImage.naturalHeight / weaponArt.rows;
  c.fillStyle = '#0b332d';
  c.fillRect(616, 602, weaponSize + 8, weaponSize + 8);
  c.drawImage(
    weaponImage,
    weaponArt.column * weaponWidth,
    weaponArt.row * weaponHeight,
    weaponWidth,
    weaponHeight,
    620,
    606,
    weaponSize,
    weaponSize,
  );
  c.strokeStyle = '#c2b78670';
  c.strokeRect(616, 602, weaponSize + 8, weaponSize + 8);
  text(card.weapon.name, 814, 657, 32, '#ece7d1', 184);
  text(`${card.weapon.element}系 · 炼器 ${card.weapon.forge} 阶`, 814, 700, 20, '#bcc7af', 184);
  c.save();
  c.textAlign = 'center';
  text(card.identity, 286, 814, 26, '#ece7d1', 430);
  c.restore();
  line(840);
  text('此 世 留 痕', 80, 868, 25, '#d8c998');
  for (const [i, memory] of card.memories.entries()) {
    const x = 84 + (i % 2) * 450;
    const y = 920 + Math.floor(i / 2) * 82;
    c.fillStyle = '#cfbc87';
    c.fillRect(x, y - 18, 5, 48);
    text(memory.title, x + 30, y, 25, '#e5d7ad', 380);
    text(memory.detail, x + 30, y + 28, 18, '#b9c7b1', 380);
  }
  const moduleSize = 8;
  const qrSize = JOURNEY_CARD_QR.size * moduleSize;
  const qrX = 1000 - qrSize;
  const qrY = 1392 - qrSize;
  line(qrY);
  text(
    card.ending === 'immortal'
      ? '已叩入仙门'
      : card.ending === 'lifespan'
        ? '此世寿终'
        : card.ending === 'tribulation'
          ? '止于天劫'
          : '仙途未尽',
    80,
    1175,
    40,
    '#e1d3a4',
    620,
  );
  text('山河未老，故人先秋。', 82, 1224, 25, '#c1cbb6', 620);
  c.save();
  c.textAlign = 'center';
  text(new URL(GAME_SITE_URL).host, 540, 1368, 18, '#aabda8', 520);
  c.restore();

  // 整数像素绘制并保留四格浅色静区，二维码只编码官网，不携带存档。
  c.fillStyle = JOURNEY_CARD_QR_COLORS.light;
  c.fillRect(qrX, qrY, qrSize, qrSize);
  c.fillStyle = JOURNEY_CARD_QR_COLORS.dark;
  JOURNEY_CARD_QR.data.forEach((row, y) => {
    row.forEach((black, x) => {
      if (black) c.fillRect(qrX + x * moduleSize, qrY + y * moduleSize, moduleSize, moduleSize);
    });
  });
  return canvas.toDataURL('image/png');
}
