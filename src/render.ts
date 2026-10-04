import { CACHE_CHALLENGE, ENEMIES, ENEMY_TACTICS, STAGES, TAU } from './data.ts';
import type { ElementId } from './data.ts';
import type { Game, Point } from './game.ts';
import { spriteFrame, SPRITE_ATLASES } from './sprites.ts';
import { assetUrl } from './asset-url.ts';
import { sceneAssets } from './scene-assets.ts';
import { bossEntranceCue, BOSS_ENTRANCE_THEMES } from './boss-entrance.ts';
import { realmBreakthroughCue } from './realm-breakthrough.ts';
import {
  hasArtifactField,
  drawArtifactField,
  drawArtifactObject,
  drawArtifactBeam,
  drawArtifactBurst,
} from './artifact-effects.ts';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  private atlases: HTMLImageElement[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private formations = new Map<string, HTMLCanvasElement>();
  private glowSprites = new Map<string, HTMLCanvasElement>();
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  width = 0;
  height = 0;
  scale = 1;
  private imageRequests = new Map<string, Promise<void>>();
  private loadedImages = new Set<string>();
  private terrainImages: HTMLImageElement[] = [];
  private tiles: CanvasPattern[] = [];
  needsRedraw = true;
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    canvas.addEventListener('contextrestored', () => this.restore());
    this.resize();
  }
  hasScene(
    stage: number,
    tribulation = false,
    extraSprites: number[] = [],
    extraImages: string[] = [],
  ) {
    return [...sceneAssets(stage, tribulation, extraSprites), ...extraImages].every((url) =>
      this.loadedImages.has(url),
    );
  }
  async prepareScene(
    stage: number,
    tribulation: boolean,
    extraSprites: number[],
    progress: (done: number, total: number) => void,
    extraImages: string[] = [],
  ) {
    const urls = [...sceneAssets(stage, tribulation, extraSprites), ...extraImages];
    let done = 0;
    progress(0, urls.length);
    await Promise.all(
      urls.map(async (url) => {
        let request = this.imageRequests.get(url);
        if (!request) {
          request = new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              const atlas = SPRITE_ATLASES.findIndex((sheet) => sheet.url === url);
              if (atlas >= 0) this.atlases[atlas] = image;
              const terrain = STAGES.findIndex((s) => s.terrain === url);
              if (terrain >= 0) {
                this.terrainImages[terrain] = image;
                this.tiles[terrain] = this.terrainPattern(image);
              }
              this.loadedImages.add(url);
              resolve();
            };
            image.onerror = () => {
              this.imageRequests.delete(url);
              reject(new Error(url));
            };
            image.src = assetUrl(url);
          });
          this.imageRequests.set(url, request);
        }
        await request;
        progress(++done, urls.length);
      }),
    );
  }
  private terrainPattern(image: HTMLImageElement) {
    const texture = document.createElement('canvas');
    texture.width = texture.height = 850;
    texture.getContext('2d')!.drawImage(image, 0, 0, 850, 850);
    return this.ctx.createPattern(texture, 'repeat')!;
  }
  restore() {
    // 手机后台可能回收主画布和离屏缓存；保留原图，在下一次绘制时重建。
    this.needsRedraw = true;
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.scale = this.width < 700 ? 0.76 : Math.min(1.1, Math.max(0.8, this.height / 860));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  draw(game: Game | null, now: number, stage: number, previewRealm = 0) {
    if (this.ctx.isContextLost?.()) return;
    if (this.needsRedraw) {
      this.resize();
      this.sprites.clear();
      this.formations.clear();
      this.glowSprites.clear();
      this.tiles = this.terrainImages.map((image) => this.terrainPattern(image));
    }
    if (game?.tribulation) stage = 6;
    const c = this.ctx,
      w = this.width,
      h = this.height,
      s = this.scale;
    const time = game?.time ?? now * 0.001;
    const camera = game ? game.player : { x: now * 0.001 * 4, y: 0 };
    const cx = game ? w / 2 : w * (w < 700 ? 0.73 : 0.71),
      cy = game ? h / 2 : h * 0.44;
    if (game) game.viewport = { width: w / s, height: h / s };
    c.fillStyle = '#384d41';
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(cx, cy);
    c.scale(s, s);
    c.translate(-camera.x, -camera.y);
    if (this.tiles[stage]) {
      c.fillStyle = this.tiles[stage];
      c.fillRect(camera.x - w / s, camera.y - h / s, (w * 2) / s, (h * 2) / s);
    }
    c.fillStyle = '#04171920';
    c.fillRect(camera.x - w / s, camera.y - h / s, (w * 2) / s, (h * 2) / s);
    if (game) this.drawGame(game, time);
    else this.drawPreview(camera, time, previewRealm);
    c.restore();
    const shade = c.createRadialGradient(w * 0.52, h * 0.4, h * 0.15, w / 2, h / 2, w * 0.73);
    shade.addColorStop(0, '#06221f00');
    shade.addColorStop(0.65, '#061c2340');
    shade.addColorStop(1, '#041919c9');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);
    const danger = game?.lowHealth ?? 0;
    if (danger > 0) {
      const pulse = this.reducedMotion.matches ? 0.5 : 0.5 + Math.sin(time * 5) * 0.5;
      const edge = c.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.25,
        w / 2,
        h / 2,
        Math.hypot(w, h) * 0.55,
      );
      edge.addColorStop(0, 'rgba(190, 38, 30, 0)');
      edge.addColorStop(1, `rgba(190, 38, 30, ${(0.38 + 0.37 * danger) * (0.7 + 0.3 * pulse)})`);
      c.fillStyle = edge;
      c.fillRect(0, 0, w, h);
    }
    if (!game) {
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#0b252bea');
      g.addColorStop(0.45, '#102a29b5');
      g.addColorStop(1, '#0a242528');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 35; i++) {
      const x = (((i * 177.7 + Math.sin(now * 0.00013 + i) * 45) % w) + w) % w;
      const y = (((i * 137.3 - now * 0.005 * (1 + (i % 3))) % h) + h) % h;
      c.globalAlpha = 0.2 + Math.sin(now * 0.001 + i) * 0.15;
      c.fillStyle = '#d3edb1';
      c.beginPath();
      c.arc(x, y, i % 4 === 0 ? 2 : 1, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    if (game) {
      this.drawBossEntrance(game);
      this.drawRealmBreakthrough(game);
    }
    this.needsRedraw = false;
  }
  private drawRealmBreakthrough(game: Game) {
    const cue = realmBreakthroughCue(game);
    if (!cue) return;
    const c = this.ctx,
      w = this.width,
      h = this.height,
      still = this.reducedMotion.matches;
    const fade = Math.min(1, cue.progress / 0.14) * Math.min(1, (1 - cue.progress) / 0.45);
    c.save();
    if (still) {
      c.globalAlpha = fade * 0.015;
      c.fillStyle = cue.color;
    } else {
      const x = -w * 0.3 + cue.progress * w * 1.6;
      const sweep = c.createLinearGradient(x - w * 0.25, 0, x + w * 0.25, 0);
      sweep.addColorStop(0, cue.color + '00');
      sweep.addColorStop(0.5, cue.color);
      sweep.addColorStop(1, cue.color + '00');
      c.globalAlpha = fade * 0.05;
      c.fillStyle = sweep;
    }
    c.fillRect(0, 0, w, h);
    let x = w / 2,
      y = h / 2 + (h < 500 ? 62 : 80);
    // 留开角色和顶部 HUD；小屏与妖王名号同时出现时让到侧边。
    if (bossEntranceCue(game)) {
      if (w > h) x = w * 0.88;
      else if (w < 700 && h < 720) {
        x = w * 0.22;
        y = h / 2 - 4;
      }
    }
    if (!still) y -= cue.progress * 6;
    const fontSize = w < 700 || h < 500 ? 22 : 28;
    const serif = '"Noto Serif SC", "Songti SC", "STSong", serif';
    c.globalAlpha = fade;
    c.textAlign = 'center';
    c.shadowColor = '#102b25cc';
    c.shadowBlur = 6;
    c.shadowOffsetY = 1;
    c.fillStyle = '#eee5c9';
    c.font = `400 ${fontSize}px ${serif}`;
    c.fillText(cue.name, x, y + 5);
    c.globalAlpha = fade * 0.7;
    c.fillStyle = c.strokeStyle = cue.color;
    c.font = `400 ${fontSize === 22 ? 8 : 9}px ${serif}`;
    c.fillText('破 境', x, y + 21);
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    c.lineWidth = 0.75;
    // 细线收束名号，不加厚重描边或遮住战场的底板。
    for (const side of [-1, 1]) {
      const edge = x + side * (fontSize + 10);
      c.beginPath();
      c.moveTo(edge, y - 3);
      c.lineTo(edge + side * 19, y - 3);
      c.stroke();
      c.beginPath();
      c.arc(edge + side * 23, y - 3, 1.2, 0, TAU);
      c.fill();
    }
    c.restore();
  }
  private drawBossEntrance(game: Game) {
    const cue = bossEntranceCue(game);
    if (!cue) return;
    const c = this.ctx,
      w = this.width,
      h = this.height;
    const theme = BOSS_ENTRANCE_THEMES[cue.stage];
    const still = this.reducedMotion.matches;
    const fade = cue.arriving
      ? Math.min(1, (1 - cue.progress) / 0.22)
      : Math.min(1, cue.progress / 0.25);
    const motion = still ? 0.4 : cue.progress;
    c.save();
    // 暗角只收束边缘，保留人物、弹幕与已有红色技能预警的辨识度。
    const shade = c.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.6,
    );
    shade.addColorStop(0, '#081a1900');
    shade.addColorStop(1, `rgba(5, 22, 18, ${fade * 0.45})`);
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = theme.color;
    c.fillStyle = theme.color;
    c.lineWidth = 1.5;
    if (cue.stage === 0) {
      // 藤蔓从两侧破土，中心和底部操作区域留空。
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const x = side < 0 ? i * 18 : w - i * 18;
          const y = h * (0.45 + i * 0.09);
          c.globalAlpha = fade * 0.45;
          c.beginPath();
          c.moveTo(x, y + 80);
          c.bezierCurveTo(
            x + side * 25,
            y + 20,
            x - side * 60,
            y + 10,
            x - side * 45,
            y - 55 * motion,
          );
          c.stroke();
        }
    }
    // 粒子固定数量，不在绘制中使用随机数；减少动态效果时仅保留静态名号。
    if (!still)
      for (let i = 0; i < 20; i++) {
        const side = i % 2 ? 1 : -1;
        const x =
          (side < 0 ? 0 : w) - side * (18 + ((i * 37 + motion * 95) % Math.max(40, w * 0.22)));
        const y = (((i * 113 + motion * (cue.arriving ? -150 : 60)) % h) + h) % h;
        c.save();
        c.globalAlpha = fade * (0.25 + (i % 3) * 0.12);
        c.translate(x, y);
        c.rotate(i + motion * 2);
        c.beginPath();
        if (theme.particle === 'leaf') c.ellipse(0, 0, 3, 9, 0.4, 0, TAU);
        else if (theme.particle === 'ice') {
          c.moveTo(0, -9);
          c.lineTo(3, 0);
          c.lineTo(0, 9);
          c.lineTo(-3, 0);
          c.closePath();
        } else if (theme.particle === 'miasma') {
          c.globalAlpha *= 0.5;
          c.arc(0, 0, 8 + (i % 4) * 4, 0, TAU);
        } else if (theme.particle === 'soul') {
          c.ellipse(0, 0, 3, 7, 0, 0, TAU);
          c.moveTo(0, 6);
          c.quadraticCurveTo(12, 12, 3, 22);
          c.stroke();
        } else if (theme.particle === 'lightning') {
          c.moveTo(0, -14);
          c.lineTo(-5, 0);
          c.lineTo(4, -2);
          c.lineTo(-2, 14);
          c.stroke();
        } else if (theme.particle === 'rune') {
          c.strokeRect(-8, -8, 16, 16);
          c.font = '12px serif';
          c.textAlign = 'center';
          c.fillText(['劫', '天', '道', '仙'][i % 4], 0, 4);
        } else c.arc(0, 0, 2 + (i % 3), 0, TAU);
        c.fill();
        c.restore();
      }
    c.globalAlpha = fade;
    const cardWidth = Math.min(440, w - 32);
    const centerY = h < 500 ? h * 0.67 : w < 700 ? h - 190 : Math.max(230, h * 0.29);
    c.translate(w / 2, centerY);
    const panel = c.createLinearGradient(-cardWidth / 2, 0, cardWidth / 2, 0);
    panel.addColorStop(0, '#0b241b00');
    panel.addColorStop(0.18, '#0b241be8');
    panel.addColorStop(0.82, '#0b241be8');
    panel.addColorStop(1, '#0b241b00');
    c.fillStyle = panel;
    c.fillRect(-cardWidth / 2, -54, cardWidth, 108);
    c.strokeStyle = theme.color + '80';
    c.beginPath();
    c.moveTo(-cardWidth * 0.4, -53);
    c.lineTo(cardWidth * 0.4, -53);
    c.moveTo(-cardWidth * 0.4, 53);
    c.lineTo(cardWidth * 0.4, 53);
    c.stroke();
    if (cue.arriving) {
      this.sprite(STAGES[cue.stage].sprite, -cardWidth / 2 + 54, 26, 88);
      c.translate(w < 700 ? 34 : 46, 0);
    }
    c.textAlign = 'center';
    c.fillStyle = theme.color;
    c.font = '12px serif';
    c.fillText(cue.arriving ? `${theme.title} · 妖王降临` : '妖气汇聚 · 妖王将至', 0, -27);
    c.font = `${w < 700 ? 28 : 34}px serif`;
    c.fillStyle = '#f3e9c8';
    c.fillText(STAGES[cue.stage].boss, 0, 12);
    c.font = '12px serif';
    c.fillStyle = theme.color;
    c.fillText(`第${STAGES[cue.stage].chapter}境 · ${STAGES[cue.stage].name}`, 0, 36);
    c.restore();
  }
  private drawPreview(camera: Point, time: number, realm: number) {
    const c = this.ctx;
    c.save();
    c.translate(camera.x, camera.y);
    const colors = [
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
    const color = colors[realm];
    const swords = (count: number, radius: number) => {
      for (let i = 0; i < count; i++) {
        const a = time * 0.26 + (i / count) * TAU;
        this.sword(Math.cos(a) * radius, Math.sin(a) * radius * 0.65, a + Math.PI / 2, color, 1.15);
      }
    };
    const orb = (x: number, y: number, radius: number, tint: string) => {
      c.save();
      c.shadowColor = tint;
      c.shadowBlur = 20;
      const glow = c.createRadialGradient(x - radius * 0.25, y - radius * 0.25, 0, x, y, radius);
      glow.addColorStop(0, '#fff9df');
      glow.addColorStop(0.35, tint);
      glow.addColorStop(1, tint + '15');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(x, y, radius, 0, TAU);
      c.fill();
      c.restore();
    };
    if (realm > 0) this.formation(0, 15, 110 + realm * 8, time * 0.08, color, 0.35);
    switch (realm) {
      case 0:
        swords(1, 90);
        for (let i = 0; i < 3; i++) {
          const a = time * 0.4 + (i / 3) * TAU;
          orb(Math.cos(a) * 75, Math.sin(a) * 45, 7, color);
        }
        break;
      case 1:
        swords(3, 130);
        this.formation(0, 15, 78, -time * 0.12, color, 0.45);
        break;
      case 2:
        orb(0, -142 + Math.sin(time) * 7, 25, color);
        swords(3, 145);
        this.formation(0, -142 + Math.sin(time) * 7, 35, time * 0.2, color, 0.7);
        break;
      case 3:
        for (let i = 0; i < 3; i++) {
          const a = time * 0.3 + (i / 3) * TAU;
          this.lotus(Math.cos(a) * 110, Math.sin(a) * 65 + 15, time * 0.2, 0.7);
        }
        c.save();
        c.globalAlpha = 0.6;
        c.shadowColor = color;
        c.shadowBlur = 18;
        this.sprite(0, 75, -95 + Math.sin(time) * 8, 65, -1);
        c.restore();
        break;
      case 4:
        for (let i = 0; i < 5; i++) {
          const a = -time * 0.25 + (i / 5) * TAU;
          c.save();
          c.translate(Math.cos(a) * 140, Math.sin(a) * 88);
          c.rotate(Math.sin(a) * 0.2);
          c.fillStyle = '#322d46b0';
          c.strokeStyle = color;
          c.fillRect(-12, -23, 24, 46);
          c.strokeRect(-12, -23, 24, 46);
          c.fillStyle = color;
          c.font = '18px serif';
          c.textAlign = 'center';
          c.fillText(['金', '木', '水', '火', '土'][i], 0, 6);
          c.restore();
        }
        break;
      case 5:
        for (let ring = 0; ring < 2; ring++) {
          c.save();
          c.rotate(ring ? -0.6 : 0.6);
          c.strokeStyle = color + '90';
          c.beginPath();
          c.ellipse(0, 0, 175, 65, 0, 0, TAU);
          c.stroke();
          for (let i = 0; i < 8; i++) {
            const a = time * (ring ? -0.3 : 0.3) + (i / 8) * TAU;
            orb(Math.cos(a) * 175, Math.sin(a) * 65, i % 2 ? 3 : 6, color);
          }
          c.restore();
        }
        break;
      case 6:
        for (let i = 0; i < 2; i++) {
          const a = time * 0.4 + i * Math.PI;
          orb(Math.cos(a) * 125, Math.sin(a) * 75, 27, i ? '#b5cdf6' : '#f1d290');
        }
        for (let i = 0; i < 6; i++) {
          const a = -time * 0.18 + (i / 6) * TAU;
          this.lotus(Math.cos(a) * 175, Math.sin(a) * 100, -time * 0.1, 0.5);
        }
        break;
      case 7:
        swords(12, 178);
        this.formation(0, 15, 115, -time * 0.1, color, 0.55);
        this.formation(0, 15, 195, time * 0.04, color, 0.3);
        break;
      case 8:
        swords(9, 180);
        this.formation(0, 15, 190, -time * 0.1, '#f6dd97', 0.5);
        for (let i = 0; i < 6; i++) {
          c.save();
          c.rotate((i / 6) * TAU + time * 0.06);
          c.globalAlpha = 0.5 + Math.sin(time * 2 + i) * 0.2;
          c.strokeStyle = color;
          c.shadowColor = color;
          c.shadowBlur = 12;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(95, 0);
          c.lineTo(135, -10);
          c.lineTo(127, 8);
          c.lineTo(182, -4);
          c.stroke();
          c.restore();
        }
        break;
    }
    this.sprite(0, 0, 0, 150, 1);
    c.restore();
  }
  private drawGame(game: Game, time: number) {
    const c = this.ctx,
      p = game.player;
    if (game.tribulation) {
      c.save();
      c.strokeStyle = '#d4adff';
      c.lineWidth = 5;
      c.setLineDash([18, 8]);
      c.beginPath();
      c.arc(0, 0, game.tribulationRadius, 0, TAU);
      c.stroke();
      c.restore();
    }
    // 先画地面底色；危险边界集中放在法宝、人物和装饰之后绘制。
    for (const z of game.zones)
      if (hasArtifactField(z) && this.visible(z, p, z.radius + 50))
        drawArtifactField(c, z, time, this.reducedMotion.matches);
    for (const z of game.zones) {
      if (hasArtifactField(z) || !this.visible(z, p, z.radius + 50)) continue;
      c.save();
      c.translate(z.x, z.y);
      const alpha = z.delay > 0 ? 0.15 + Math.sin(time * 13) * 0.06 : 0.22;
      c.fillStyle = z.hostile ? `rgba(214,82,68,${alpha})` : z.color + '28';
      c.strokeStyle = z.hostile ? '#ef9281' : z.color + '99';
      c.lineWidth = z.hostile ? 2 : 1;
      c.setLineDash(z.delay > 0 ? [7, 5] : []);
      c.beginPath();
      c.arc(0, 0, z.radius, 0, TAU);
      c.fill();
      if (!z.hostile) c.stroke();
      if (z.kind === 'vortex') this.formation(0, 0, z.radius * 0.9, time, z.color, 0.6);
      if (z.delay <= 0 && z.kind !== 'vortex') {
        for (let i = 0; i < 9; i++) {
          const a = time * 0.5 + i * 2.4;
          c.globalAlpha = 0.4;
          c.beginPath();
          c.arc(Math.cos(a) * z.radius * 0.65, Math.sin(a) * z.radius * 0.65, 3 + (i % 4), 0, TAU);
          c.fillStyle = z.color;
          c.fill();
        }
      }
      c.restore();
    }
    for (const item of game.pickups) {
      if (!this.visible(item, p)) continue;
      c.save();
      c.translate(item.x, item.y);
      if (item.kind === 'xp') {
        const r = item.value > 15 ? 6 : 3.7;
        c.fillStyle = '#96ded170';
        c.beginPath();
        c.arc(0, 0, r + 2, 0, TAU);
        c.fill();
        c.fillStyle = item.value > 15 ? '#eddda0' : '#b7f0de';
        c.beginPath();
        c.moveTo(0, -r);
        c.lineTo(r * 0.8, 0);
        c.lineTo(0, r);
        c.lineTo(-r * 0.8, 0);
        c.closePath();
        c.fill();
        c.strokeStyle = '#194c42';
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = '#edfff2';
        c.fillRect(-1, -r + 1, 2, 2);
      } else {
        const kind = item.kind;
        this.glowSprite(`pickup:${kind}`, 60, 60, (c) => {
          const colors = { heal: '#e4a49a', magnet: '#a2e2ee', iron: '#cad6e1', chest: '#f0d88e' };
          c.shadowColor = colors[kind];
          c.shadowBlur = 14;
          c.fillStyle = '#244740';
          c.strokeStyle = colors[kind];
          c.lineWidth = 1.5;
          c.beginPath();
          c.roundRect(-13, -13, 26, 26, 5);
          c.fill();
          c.stroke();
          c.shadowBlur = 0;
          c.fillStyle = colors[kind];
          c.font = 'bold 15px serif';
          c.textAlign = 'center';
          c.fillText({ heal: '丹', magnet: '灵', iron: '铁', chest: '宝' }[kind], 0, 5);
        });
      }
      c.restore();
    }
    const cache = game.cacheChallenge;
    if (
      cache &&
      ['offered', 'active'].includes(cache.phase) &&
      this.visible(cache, p, CACHE_CHALLENGE.approach)
    ) {
      c.save();
      this.formation(cache.x, cache.y, 45, time * 0.3, '#e9ce8a', 0.65);
      if (cache.phase === 'offered') {
        c.strokeStyle = '#d8c48180';
        c.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const a = (i * TAU) / 4;
          c.beginPath();
          c.arc(cache.x, cache.y, CACHE_CHALLENGE.approach, a - 0.09, a + 0.09);
          c.stroke();
        }
        if (game.cacheApproachProgress > 0) {
          c.fillStyle = '#193c35';
          c.fillRect(cache.x - 30, cache.y + 55, 60, 3);
          c.fillStyle = '#ead292';
          c.fillRect(cache.x - 30, cache.y + 55, 60 * game.cacheApproachProgress, 3);
        }
      }
      c.textAlign = 'center';
      c.font = '16px serif';
      c.lineWidth = 4;
      c.strokeStyle = '#173b35';
      c.fillStyle = '#f2e1ad';
      const text = cache.phase === 'offered' ? '守匣灵阵' : '破阵取匣';
      c.strokeText(text, cache.x, cache.y - 52);
      c.fillText(text, cache.x, cache.y - 52);
      c.fillText('匣', cache.x, cache.y + 6);
      c.restore();
    }
    for (const e of game.enemies) {
      if (e.dead || !game.encounterVersion || !ENEMY_TACTICS[e.type].boundSummons) continue;
      c.save();
      c.strokeStyle = '#cbb0e978';
      c.setLineDash([5, 8]);
      c.lineWidth = 1.5;
      for (const child of game.enemies) {
        if (child.dead || child.summonedBy !== e.id || !this.visible(child, p, 100)) continue;
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(child.x, child.y);
        c.stroke();
      }
      c.restore();
    }
    const entities = [
      ...game.enemies.filter((e) => !e.dead && this.visible(e, p)),
      {
        ...p,
        type: -1,
        radius: 20,
        boss: false,
        bossStage: undefined,
        elite: false,
        slow: 0,
        flash: 0,
        charge: 0,
        cooldown: 0,
        dx: 0,
        dy: 0,
        maxHp: p.maxHp,
      },
    ].sort((a, b) => a.y - b.y);
    for (const e of entities) {
      if (e.type === -1) {
        this.formation(p.x, p.y + 9, 29, time * 0.5, '#c7e4bd', 0.5);
        c.globalAlpha = p.invincible > 0 ? 0.5 + Math.sin(time * 35) * 0.3 : 1;
        this.sprite(
          0,
          p.x,
          p.y + (p.moving ? Math.sin(time * 15) * 2 : Math.sin(time * 2) * 1.5),
          84,
          p.facing,
        );
        c.globalAlpha = 1;
        if (game.slowed > 0) {
          c.strokeStyle = '#a8e1f4';
          c.lineWidth = 2;
          c.beginPath();
          c.ellipse(p.x, p.y + 12, 25, 10, 0, 0, TAU);
          c.stroke();
          c.font = 'bold 13px serif';
          c.textAlign = 'center';
          c.fillStyle = '#d3f1ff';
          c.strokeStyle = '#173e4e';
          c.lineWidth = 3;
          c.strokeText('迟滞 · 移速 −25%', p.x, p.y + 46);
          c.fillText('迟滞 · 移速 −25%', p.x, p.y + 46);
        }
      } else {
        if (e.elite || e.boss)
          this.cachedFormation(
            e.x,
            e.y + 6,
            e.radius + 10,
            -time * 0.5,
            e.boss ? '#dd8e7a' : '#e0c18a',
            0.7,
          );
        if (!e.boss && ENEMIES[e.type].behavior === 'shield' && e.cooldown > 1.5) {
          c.strokeStyle = '#b4d9ee';
          c.lineWidth = 3;
          c.beginPath();
          c.ellipse(e.x, e.y - 12, e.radius + 9, e.radius * 1.5, 0, 0, TAU);
          c.stroke();
        }
        if (e.slow > 0) {
          c.fillStyle = '#b3dcf048';
          c.beginPath();
          c.ellipse(e.x, e.y + 7, e.radius + 4, e.radius * 0.5, 0, 0, TAU);
          c.fill();
        }
        if (game.tribulation && e.boss)
          this.formation(
            e.x,
            e.y,
            e.radius + 25,
            time * 0.7,
            game.tribulationVulnerable ? '#ffdc83' : '#bb93ee',
            0.8,
          );
        const sprite =
          game.tribulation && e.boss
            ? 81
            : e.boss
              ? STAGES[e.bossStage ?? game.stage].sprite
              : ENEMIES[e.type].sprite;
        this.sprite(
          sprite,
          e.x,
          e.y + Math.sin(time * 8 + e.x) * (e.boss ? 1 : 2),
          e.radius * 3.1,
          e.x < p.x ? 1 : -1,
          e.flash > 0,
        );
        if (e.hp < e.maxHp || e.elite) {
          c.fillStyle = '#142623bb';
          c.fillRect(e.x - e.radius, e.y - e.radius * 2.5, e.radius * 2, 3);
          c.fillStyle = e.boss ? '#d8917f' : '#b8c68b';
          c.fillRect(
            e.x - e.radius,
            e.y - e.radius * 2.5,
            e.radius * 2 * Math.max(0, e.hp / e.maxHp),
            3,
          );
        }
      }
    }
    for (const z of game.zones)
      if (hasArtifactField(z) && this.visible(z, p, z.radius + 180))
        drawArtifactObject(c, z, time, this.reducedMotion.matches);
    const lotus = game.weapons.find((w) => w.id === 'orbit');
    if (lotus) {
      const count = 2 + Math.floor(lotus.level / 2) + (lotus.evolved ? 3 : 0),
        radius = (95 + lotus.level * 7) * game.stats.area;
      for (let i = 0; i < count; i++) {
        const a = time * 1.5 + (i / count) * TAU;
        this.lotus(
          p.x + Math.cos(a) * radius,
          p.y + Math.sin(a) * radius,
          a,
          lotus.evolved ? 1 : 0.75,
        );
      }
    }
    for (const shot of game.shots) {
      if (!this.visible(shot, p)) continue;
      const a = Math.atan2(shot.vy, shot.vx);
      if (shot.kind === 'sword') this.sword(shot.x, shot.y, a, shot.color, 0.8);
      else {
        c.save();
        c.translate(shot.x, shot.y);
        c.rotate(a);
        if (shot.kind === 'blade') c.rotate(time * 12);
        if (shot.kind === 'dragon') {
          const bend = this.reducedMotion.matches ? 0 : Math.sin(shot.age * 7) * 8;
          c.strokeStyle = shot.color + '50';
          c.lineWidth = 15;
          c.beginPath();
          c.moveTo(-58, -bend);
          c.bezierCurveTo(-37, 21 + bend, -20, -22, 9, 0);
          c.stroke();
          c.strokeStyle = shot.color;
          c.lineWidth = 5;
          c.stroke();
          c.strokeStyle = '#f1e7c4';
          c.lineWidth = 1.5;
          c.stroke();
          c.fillStyle = '#b3d7b5';
          c.beginPath();
          c.moveTo(19, 0);
          c.lineTo(3, -9);
          c.lineTo(-2, -2);
          c.lineTo(3, 8);
          c.closePath();
          c.fill();
          c.beginPath();
          c.moveTo(4, -6);
          c.lineTo(-4, -15);
          c.lineTo(-10, -12);
          c.moveTo(11, 3);
          c.quadraticCurveTo(26, 11, 29, 3);
          c.stroke();
          c.fillStyle = '#fff5c9';
          c.fillRect(9, -3, 3, 2);
        } else if (shot.kind === 'qin') {
          // 扩散音波的半径持续变化，直接画线，避免为每一帧建立纹理。
          c.strokeStyle = shot.color;
          c.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(-15, 0, shot.radius + i * 7, -1, 1);
            c.stroke();
          }
        } else
          this.glowSprite(`shot:${shot.kind}:${shot.color}:${shot.radius}`, 144, 112, (c) => {
            c.shadowColor = shot.color;
            c.shadowBlur = 12;
            c.strokeStyle = shot.color;
            c.fillStyle = shot.color;
            if (shot.kind === 'arrow') {
              c.lineWidth = 2;
              c.beginPath();
              c.moveTo(-38, 0);
              c.lineTo(15, 0);
              c.stroke();
              c.fillStyle = '#f6e6b1';
              c.beginPath();
              c.moveTo(24, 0);
              c.lineTo(9, -5);
              c.lineTo(13, 0);
              c.lineTo(9, 5);
              c.closePath();
              c.fill();
              c.strokeStyle = shot.color;
              c.lineWidth = 1;
              for (let i = 0; i < 3; i++) {
                c.beginPath();
                c.moveTo(-29 + i * 4, 0);
                c.lineTo(-36 + i * 4, -6);
                c.moveTo(-29 + i * 4, 0);
                c.lineTo(-36 + i * 4, 6);
                c.stroke();
              }
            } else if (shot.kind === 'blade') {
              c.lineWidth = 4;
              c.beginPath();
              c.arc(0, 0, 15, 0, Math.PI * 1.7);
              c.stroke();
            } else if (shot.kind === 'talisman') {
              c.fillRect(-12, -5, 20, 10);
              c.fillStyle = '#58475d';
              c.fillRect(-7, -2, 10, 3);
            } else if (shot.kind === 'spear' || shot.kind === 'nail') {
              const length = shot.kind === 'spear' ? 48 : 20;
              c.lineWidth = shot.kind === 'spear' ? 3 : 1.5;
              c.beginPath();
              c.moveTo(-length, 0);
              c.lineTo(12, 0);
              c.stroke();
              c.beginPath();
              c.moveTo(18, 0);
              c.lineTo(5, -5);
              c.lineTo(5, 5);
              c.closePath();
              c.fill();
            } else if (shot.kind === 'flute') {
              c.beginPath();
              c.ellipse(0, 3, 6, 4, -0.4, 0, TAU);
              c.fill();
              c.lineWidth = 2;
              c.beginPath();
              c.moveTo(5, 3);
              c.lineTo(5, -15);
              c.lineTo(14, -9);
              c.stroke();
            } else if (shot.kind === 'shard' || shot.kind === 'umbrella') {
              c.beginPath();
              c.moveTo(14, 0);
              c.lineTo(-8, -6);
              c.lineTo(-2, 2);
              c.lineTo(-8, 7);
              c.closePath();
              c.fill();
              c.strokeStyle = '#eee7ff';
              c.stroke();
            } else if (shot.kind === 'skull') {
              c.fillStyle = '#b3d7c333';
              c.beginPath();
              c.moveTo(3, -11);
              c.bezierCurveTo(-17, -22, -29, 9, -52, -2);
              c.bezierCurveTo(-32, 21, -14, 6, 3, 11);
              c.fill();
              c.fillStyle = '#d9d8bc';
              c.strokeStyle = '#9cad93';
              c.lineWidth = 1;
              c.beginPath();
              c.ellipse(1, 0, 12, 10, 0, 0, TAU);
              c.fill();
              c.stroke();
              c.fillRect(8, -6, 8, 12);
              c.fillStyle = '#263d3e';
              c.beginPath();
              c.ellipse(5, -4, 4, 3, -0.2, 0, TAU);
              c.ellipse(5, 4, 4, 3, 0.2, 0, TAU);
              c.fill();
              c.fillStyle = '#9fe4c0';
              c.fillRect(5, -5, 2, 2);
              c.fillRect(5, 3, 2, 2);
              c.strokeStyle = '#455855';
              for (let y = -4; y <= 4; y += 4) {
                c.beginPath();
                c.moveTo(12, y);
                c.lineTo(16, y);
                c.stroke();
              }
            } else if (shot.kind === 'beads') {
              c.beginPath();
              c.arc(0, 0, shot.radius, 0, TAU);
              c.fill();
              c.strokeStyle = '#fff0bb';
              c.lineWidth = 1;
              c.beginPath();
              c.arc(0, 0, shot.radius * 0.65, 0, TAU);
              c.stroke();
            } else if (shot.kind === 'fan') {
              c.lineWidth = 3;
              c.beginPath();
              c.arc(-10, 0, 20, -0.8, 0.8);
              c.stroke();
            } else if (shot.enemySkill === 'frostbolt') {
              c.beginPath();
              c.moveTo(12, 0);
              c.lineTo(-5, -6);
              c.lineTo(-2, 0);
              c.lineTo(-5, 6);
              c.closePath();
              c.fill();
              c.strokeStyle = '#e6faff';
              c.stroke();
            } else if (shot.enemySkill === 'firebolt') {
              c.beginPath();
              c.ellipse(0, 0, 9, 7, 0, 0, TAU);
              c.fill();
              c.fillStyle = '#fff0b2';
              c.beginPath();
              c.arc(2, 0, 4, 0, TAU);
              c.fill();
            } else {
              c.beginPath();
              c.arc(0, 0, shot.kind === 'hostile' ? 5 : shot.radius * 0.75, 0, TAU);
              c.fill();
              c.fillStyle = '#fff8df';
              c.beginPath();
              c.arc(-1, -1, 2.5, 0, TAU);
              c.fill();
            }
          });
        c.restore();
      }
    }
    for (const e of game.effects) {
      if (e.kind === 'line') continue;
      c.save();
      c.globalAlpha = Math.min(1, (e.life / e.maxLife) * 1.8);
      c.strokeStyle = e.color;
      c.fillStyle = e.color;
      if (e.kind === 'realm-breakthrough') {
        const progress = 1 - e.life / e.maxLife;
        const radius = this.reducedMotion.matches ? e.radius : 28 + e.radius * progress;
        // 跟随角色脚下扩散，直接绘制动态半径，不增加纹理缓存。
        this.formation(game.player.x, game.player.y + 9, radius, 0, e.color, 0.7 * (1 - progress));
      } else if (e.kind === 'boss-entrance') {
        const progress = 1 - e.life / e.maxLife;
        const radius = e.radius + 45 + (this.reducedMotion.matches ? 0 : progress * 30);
        // 半径逐帧变化，直接绘制，避免为每一帧生成并永久缓存离屏画布。
        this.formation(e.x, e.y + 8, radius, 0, e.color, 0.6 * (1 - progress));
        if (e.bossStage !== undefined) {
          c.lineWidth = 2;
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * TAU;
            c.save();
            c.translate(e.x, e.y + 8);
            c.rotate(angle);
            c.beginPath();
            if (e.bossStage === 0) {
              c.moveTo(30, 0);
              c.bezierCurveTo(55, -20, radius - 20, 20, radius, 0);
              c.stroke();
            } else if (e.bossStage === 1) {
              c.arc(0, 0, radius * 0.8, -0.16, 0.16);
              c.stroke();
            } else if (e.bossStage === 2) {
              c.moveTo(radius - 22, -5);
              c.lineTo(radius + 8, 0);
              c.lineTo(radius - 22, 5);
              c.closePath();
              c.stroke();
            } else if (e.bossStage === 3 || e.bossStage === 4) {
              c.globalAlpha *= 0.5;
              c.beginPath();
              c.ellipse(radius * 0.75, 0, e.bossStage === 3 ? 16 : 6, 10, 0, 0, TAU);
              c.fill();
            } else if (e.bossStage === 5) {
              c.moveTo(radius * 0.4, 0);
              c.lineTo(radius * 0.7, -8);
              c.lineTo(radius * 0.65, 8);
              c.lineTo(radius, 0);
              c.stroke();
            } else {
              c.font = '16px serif';
              c.textAlign = 'center';
              c.fillText(['天', '地', '玄', '黄', '宇', '宙', '洪', '荒'][i], radius * 0.82, 5);
            }
            c.restore();
          }
        }
      } else if (e.kind === 'text') {
        c.font = `600 ${e.text?.includes('!') ? 16 : 13}px Georgia, serif`;
        c.textAlign = 'center';
        c.strokeStyle = '#132421';
        c.lineWidth = 2;
        c.strokeText(e.text || '', e.x, e.y);
        c.fillText(e.text || '', e.x, e.y);
      } else if (e.kind === 'cleave') {
        const angle = Math.atan2(e.y2! - e.y, e.x2! - e.x);
        c.lineWidth = (10 * e.life) / e.maxLife + 1;
        c.beginPath();
        c.arc(e.x, e.y, e.radius, angle - 1.7, angle + 1.7);
        c.stroke();
      } else if (e.kind === 'umbrella' || e.kind === 'bone') {
        const radius = e.radius;
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * TAU;
          c.lineTo(e.x + Math.cos(a) * radius, e.y + Math.sin(a) * radius);
        }
        c.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          c.beginPath();
          c.moveTo(
            e.x + Math.cos(a) * radius * (e.kind === 'bone' ? 0.65 : 0),
            e.y + Math.sin(a) * radius * (e.kind === 'bone' ? 0.65 : 0),
          );
          c.lineTo(e.x + Math.cos(a) * radius, e.y + Math.sin(a) * radius);
          c.stroke();
        }
      } else if (['chain', 'whip', 'starline', 'tower-ray'].includes(e.kind)) {
        drawArtifactBeam(c, e, this.reducedMotion.matches);
      } else if (e.kind === 'lightning') {
        c.translate(e.x, e.y);
        this.glowSprite(`lightning:${e.color}`, 110, 570, (c) => {
          c.strokeStyle = e.color;
          c.lineWidth = 3;
          c.shadowColor = e.color;
          c.shadowBlur = 16;
          c.beginPath();
          c.moveTo(-20, -260);
          c.lineTo(12, -140);
          c.lineTo(-9, -130);
          c.lineTo(5, 0);
          c.stroke();
          c.lineWidth = 1;
          c.beginPath();
          c.ellipse(0, 0, 35, 18, 0, 0, TAU);
          c.stroke();
        });
      } else if (e.kind === 'ice' || e.kind === 'bell') {
        drawArtifactBurst(c, e, this.reducedMotion.matches);
      } else if (e.kind === 'awaken') {
        this.awakening(p.x, p.y, 1 - e.life / e.maxLife, e.radius, e.color, e.element);
      } else {
        // 瞬发效果首帧即覆盖判定范围，普通脉冲仍作为扩散装饰。
        const r = e.kind === 'impact' ? e.radius : e.radius * (1 - e.life / e.maxLife);
        c.lineWidth = 3;
        c.beginPath();
        c.arc(e.x, e.y, r, 0, TAU);
        c.stroke();
      }
      c.restore();
    }
    this.drawEnemyWarnings(game);
  }
  private drawEnemyWarnings(game: Game) {
    const c = this.ctx,
      p = game.player;
    // 仅重绘清晰的边界与标记，不叠加第二层红色底色。
    for (const z of game.zones) {
      if (!z.hostile || !this.visible(z, p, z.radius + 50)) continue;
      c.save();
      c.translate(z.x, z.y);
      c.setLineDash(z.delay > 0 ? [7, 5] : []);
      c.beginPath();
      c.arc(0, 0, z.radius, 0, TAU);
      c.strokeStyle = '#301c2280';
      c.lineWidth = 4;
      c.stroke();
      c.strokeStyle = '#ff9b80';
      c.lineWidth = 2;
      c.stroke();
      if (z.kind.startsWith('enemy-')) {
        c.fillStyle = z.color;
        c.font = 'bold 16px serif';
        c.textAlign = 'center';
        c.fillText(
          (
            {
              'enemy-roots': '藤',
              'enemy-firepath': '火',
              'enemy-frost': '霜',
              'enemy-miasma': '瘴',
              'enemy-storm': '雷',
              'enemy-stomp': '震',
            } as Record<string, string>
          )[z.kind] ?? '',
          0,
          6,
        );
      }
      c.restore();
    }
    // 普通秘境小怪的预警直接由战斗状态绘制，刷新续局也不会丢失。
    for (const e of game.enemies) {
      if (!game.usesRegionalSkill(e)) continue;
      if (e.dead || e.boss || !this.visible(e, p, 260)) continue;
      if (e.charge <= 0.55 && !(e.windup && e.pendingSkill)) continue;
      c.save();
      c.strokeStyle = '#ffc199';
      c.fillStyle = '#e9836130';
      c.lineWidth = 2;
      if (e.charge > 0.55) {
        c.translate(e.x, e.y);
        c.rotate(Math.atan2(e.dy, e.dx));
        const width = e.radius + 13;
        c.fillRect(0, -width, 209, width * 2);
        c.setLineDash([7, 5]);
        c.strokeRect(0, -width, 209, width * 2);
      } else {
        c.beginPath();
        c.arc(e.x, e.y, e.radius + 8, 0, TAU);
        c.stroke();
      }
      c.restore();
    }
    // 妖王冲刺的路线也必须在己方法宝与觉醒装饰之上。
    for (const e of game.effects) {
      if (e.kind !== 'line') continue;
      c.save();
      c.globalAlpha = Math.min(1, (e.life / e.maxLife) * 1.8);
      c.strokeStyle = e.color;
      if (e.radius > 30) {
        c.save();
        c.globalAlpha *= 0.2;
        c.lineWidth = e.radius * 2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(e.x2!, e.y2!);
        c.stroke();
        c.restore();
      }
      c.lineWidth = 2;
      c.setLineDash([8, 5]);
      c.beginPath();
      c.moveTo(e.x, e.y);
      c.lineTo(e.x2!, e.y2!);
      c.stroke();
      c.restore();
    }
  }
  private visible(at: Point, camera: Point, margin = 150) {
    return (
      Math.abs(at.x - camera.x) < this.width / this.scale / 2 + margin &&
      Math.abs(at.y - camera.y) < this.height / this.scale / 2 + margin
    );
  }
  private sprite(index: number, x: number, y: number, size: number, facing = 1, flash = false) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.scale(facing, 1);
    c.fillStyle = '#061d2550';
    c.beginPath();
    c.ellipse(0, 11, size * 0.25, size * 0.09, 0, 0, TAU);
    c.fill();
    const frame = spriteFrame(index);
    const source = this.atlases[frame.atlas];
    const width = Math.min(size, (size * 4 * frame.width) / (3 * frame.height));
    const height = (width * frame.height) / frame.width;
    if (source?.complete && source.naturalWidth) {
      const key = `${index}:${size}:${flash}`;
      let sprite = this.sprites.get(key);
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = Math.ceil(width * 2);
        sprite.height = Math.ceil(height * 2);
        const context = sprite.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        if (flash) context.filter = 'brightness(1.7)';
        context.drawImage(
          source,
          (frame.x / 1536) * source.naturalWidth,
          (frame.y / 1024) * source.naturalHeight,
          source.naturalWidth / frame.columns,
          source.naturalHeight / frame.rows,
          0,
          0,
          sprite.width,
          sprite.height,
        );
        this.sprites.set(key, sprite);
      }
      c.drawImage(sprite, -width / 2, -height * 0.765, width, height);
    }
    c.restore();
  }
  private sword(x: number, y: number, angle: number, color: string, scale = 1) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(scale, scale);
    const g = c.createLinearGradient(-55, 0, 10, 0);
    g.addColorStop(0, color + '00');
    g.addColorStop(1, color + 'b0');
    c.strokeStyle = g;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-55, -3);
    c.quadraticCurveTo(-25, 6, 8, 0);
    c.stroke();
    c.fillStyle = '#edead0';
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(25, 0);
    c.lineTo(0, -3);
    c.lineTo(-4, 0);
    c.lineTo(0, 3);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = '#c9a76a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-5, -7);
    c.lineTo(-5, 7);
    c.moveTo(-5, 0);
    c.lineTo(-17, 0);
    c.stroke();
    c.restore();
  }
  private lotus(x: number, y: number, angle: number, scale: number) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(scale, scale);
    this.glowSprite('lotus', 90, 90, (c) => {
      c.shadowColor = '#adf0d3';
      c.shadowBlur = 14;
      for (let i = 0; i < 8; i++) {
        c.rotate(TAU / 8);
        c.fillStyle = i % 2 ? '#96ccbb' : '#c2e9c7';
        c.strokeStyle = '#def3cf';
        c.lineWidth = 0.7;
        c.beginPath();
        c.ellipse(11, 0, 15, 7, 0, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.fillStyle = '#e7d58e';
      c.beginPath();
      c.arc(0, 0, 9, 0, TAU);
      c.fill();
    });
    c.restore();
  }
  private glowSprite(
    key: string,
    width: number,
    height: number,
    paint: (context: CanvasRenderingContext2D) => void,
  ) {
    let texture = this.glowSprites.get(key);
    if (!texture) {
      texture = document.createElement('canvas');
      texture.width = width * 2;
      texture.height = height * 2;
      const context = texture.getContext('2d')!;
      context.scale(2, 2);
      context.translate(width / 2, height / 2);
      paint(context);
      // 光效只在首次使用时计算模糊，后续帧复用；限制长局中的纹理占用。
      if (this.glowSprites.size >= 96)
        this.glowSprites.delete(this.glowSprites.keys().next().value!);
      this.glowSprites.set(key, texture);
    }
    this.ctx.drawImage(texture, -width / 2, -height / 2, width, height);
  }
  private awakening(
    x: number,
    y: number,
    progress: number,
    radius: number,
    color: string,
    element?: ElementId,
  ) {
    const c = this.ctx;
    const gold = '#f6dc8e';
    const fade = Math.min(1, (1 - progress) * 1.8);
    const burst = 1 - (1 - Math.min(1, progress / 0.35)) ** 3;
    const spread = 1 - (1 - Math.min(1, progress / 0.5)) ** 2;
    const ground = y + 9;
    const seal = radius * 0.36;
    c.globalCompositeOperation = 'lighter';
    const top = y - 340 * Math.min(1, progress / 0.25);
    const width = 56 * (1 - progress * 0.5);
    for (const [beamWidth, core] of [
      [width, '#f6dc8e70'],
      [width * 0.34, '#fffbe8c0'],
    ] as const) {
      // 角色身高范围内保持透明，避免光柱盖住人物。
      const beam = c.createLinearGradient(0, y + 14, 0, y - 340);
      beam.addColorStop(0, '#f6dc8e00');
      beam.addColorStop(0.2, '#f6dc8e18');
      beam.addColorStop(0.34, core);
      beam.addColorStop(1, '#f6dc8e00');
      c.fillStyle = beam;
      c.fillRect(x - beamWidth / 2, top, beamWidth, y + 14 - top);
    }
    this.formation(x, ground, seal * (0.25 + 0.75 * burst), progress * 2.4, gold, fade);
    this.formation(x, ground, seal * (0.16 + 0.46 * burst), -progress * 3.2, color, fade * 0.9);
    // 伤害在觉醒瞬间结算，冲击环扩散到的范围就是实际命中范围。
    c.globalAlpha = fade * (1 - Math.min(1, progress / 0.45));
    c.strokeStyle = color;
    c.lineWidth = 6;
    c.beginPath();
    c.arc(x, ground, radius * Math.min(1, progress / 0.3), 0, TAU);
    c.stroke();
    c.globalAlpha = fade;
    if (element === 'metal') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const r = radius * (0.1 + 0.85 * spread);
        this.sword(x + Math.cos(a) * r, ground + Math.sin(a) * r, a, color, 1.3);
      }
    } else if (element === 'wood') {
      c.strokeStyle = color;
      c.fillStyle = color + 'c0';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU,
          curl = i % 2 ? 1.1 : -1.1,
          length = radius * 0.75 * spread;
        c.lineWidth = 3 - 2 * progress;
        c.beginPath();
        for (let step = 0; step <= 12; step++) {
          const r = 30 + ((length - 30) * step) / 12,
            turn = a + (curl * step) / 12;
          c.lineTo(x + Math.cos(turn) * r, ground + Math.sin(turn) * r);
        }
        c.stroke();
        for (const at of [0.35, 0.6, 0.85]) {
          const r = length * at,
            turn = a + curl * at;
          c.beginPath();
          c.ellipse(x + Math.cos(turn) * r, ground + Math.sin(turn) * r, 9, 4, turn + curl, 0, TAU);
          c.fill();
        }
        this.lotus(
          x + Math.cos(a + curl) * length,
          ground + Math.sin(a + curl) * length,
          progress * 3,
          0.25 + 0.35 * spread,
        );
      }
    } else if (element === 'water') {
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + progress,
          arm = seal * 1.05 * burst;
        c.moveTo(x + Math.cos(a) * 36, ground + Math.sin(a) * 36);
        c.lineTo(x + Math.cos(a) * arm, ground + Math.sin(a) * arm);
        for (const [at, side] of [
          [0.45, 0.28],
          [0.72, 0.2],
        ]) {
          const bx = x + Math.cos(a) * arm * at,
            by = ground + Math.sin(a) * arm * at;
          for (const sign of [-1, 1]) {
            c.moveTo(bx, by);
            c.lineTo(
              bx + Math.cos(a + sign * 0.8) * arm * side,
              by + Math.sin(a + sign * 0.8) * arm * side,
            );
          }
        }
      }
      c.stroke();
      c.fillStyle = color + 'd0';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.26,
          r = radius * (0.14 + 0.8 * spread);
        c.save();
        c.translate(x + Math.cos(a) * r, ground + Math.sin(a) * r);
        c.rotate(a);
        c.beginPath();
        c.moveTo(18, 0);
        c.lineTo(-10, -5);
        c.lineTo(-6, 0);
        c.lineTo(-10, 5);
        c.closePath();
        c.fill();
        c.restore();
      }
    } else if (element === 'fire') {
      const core = c.createRadialGradient(x, ground, 0, x, ground, seal * 0.9 * burst + 1);
      core.addColorStop(0, '#fff2c000');
      core.addColorStop(0.45, '#ffcf8a60');
      core.addColorStop(0.72, color + '60');
      core.addColorStop(1, color + '00');
      c.fillStyle = core;
      c.beginPath();
      c.arc(x, ground, seal * 0.9 * burst + 1, 0, TAU);
      c.fill();
      c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU,
          r = radius * (0.15 + 0.6 * spread),
          length = 48 + Math.sin(i * 1.7 + progress * 20) * 12;
        c.save();
        c.translate(x + Math.cos(a) * r, ground + Math.sin(a) * r);
        c.rotate(a);
        for (const [scale, fill] of [
          [1, color + 'a0'],
          [0.55, '#ffb070a0'],
        ] as const) {
          c.fillStyle = fill;
          c.beginPath();
          c.moveTo(0, -12 * scale);
          c.quadraticCurveTo(length * 0.5 * scale, -10 * scale, length * scale, 0);
          c.quadraticCurveTo(length * 0.5 * scale, 10 * scale, 0, 12 * scale);
          c.closePath();
          c.fill();
        }
        c.restore();
      }
      c.globalCompositeOperation = 'lighter';
    } else if (element === 'earth') {
      c.globalCompositeOperation = 'source-over';
      c.lineCap = 'round';
      for (const [width, stroke] of [
        [5, '#2b2016b0'],
        [1.5, color],
      ] as const) {
        c.lineWidth = width;
        c.strokeStyle = stroke;
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.2,
            length = radius * 0.85 * spread;
          c.moveTo(x + Math.cos(a) * 28, ground + Math.sin(a) * 28);
          for (let step = 1; step <= 6; step++) {
            const r = (length * step) / 6,
              turn = a + (step % 2 ? 0.12 : -0.1) * (1 + (i % 3) * 0.3);
            c.lineTo(x + Math.cos(turn) * r, ground + Math.sin(turn) * r);
          }
        }
        c.stroke();
      }
      c.fillStyle = '#8a7355';
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.5,
          r = radius * (0.12 + 0.7 * spread),
          size = 7 + (i % 3) * 3;
        c.save();
        c.translate(
          x + Math.cos(a) * r,
          ground + Math.sin(a) * r - Math.sin(Math.min(1, progress * 1.6) * Math.PI) * 46,
        );
        c.rotate(progress * 6 + i);
        c.beginPath();
        c.moveTo(-size, -size * 0.6);
        c.lineTo(size * 0.7, -size);
        c.lineTo(size, size * 0.5);
        c.lineTo(-size * 0.4, size);
        c.closePath();
        c.fill();
        c.stroke();
        c.restore();
      }
      c.globalCompositeOperation = 'lighter';
    }
    for (let i = 0; i < 14; i++) {
      const rise = (progress * 1.6 + i / 14) % 1;
      c.globalAlpha = fade * (1 - rise);
      c.fillStyle = i % 3 ? '#fff4cf' : color;
      c.beginPath();
      c.arc(x + Math.sin(i * 2.4) * (18 + (i % 4) * 7), y + 10 - rise * 300, 2 + (i % 3), 0, TAU);
      c.fill();
    }
  }
  private cachedFormation(
    x: number,
    y: number,
    radius: number,
    angle: number,
    color: string,
    alpha: number,
  ) {
    const key = `${radius}:${color}`;
    const extent = Math.ceil(radius + 3);
    let texture = this.formations.get(key);
    if (!texture) {
      texture = document.createElement('canvas');
      texture.width = texture.height = extent * 4;
      const context = texture.getContext('2d')!;
      context.scale(2, 2);
      this.formation(extent, extent, radius, 0, color, 1, context);
      this.formations.set(key, texture);
    }
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.globalAlpha = alpha;
    c.drawImage(texture, -extent, -extent, extent * 2, extent * 2);
    c.restore();
  }
  private formation(
    x: number,
    y: number,
    radius: number,
    angle: number,
    color: string,
    alpha: number,
    c = this.ctx,
  ) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = 1;
    for (const r of [radius, radius * 0.87]) {
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
      c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      c.rotate(TAU / 8);
      c.strokeRect(radius * 0.77, -4, radius * 0.09, 8);
    }
    c.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TAU;
      c.lineTo(Math.cos(a) * radius * 0.76, Math.sin(a) * radius * 0.76);
    }
    c.stroke();
    c.restore();
  }
}
