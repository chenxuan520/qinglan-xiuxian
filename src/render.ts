import { ENEMIES, STAGES, TAU } from './data.ts';
import type { Game, Point } from './game.ts';
import { spriteFrame, SPRITE_ATLASES } from './sprites.ts';
import { assetUrl } from './asset-url.ts';

export class Renderer {
  ctx: CanvasRenderingContext2D;
  private atlases: HTMLImageElement[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private formations = new Map<string, HTMLCanvasElement>();
  width = 0;
  height = 0;
  scale = 1;
  ready: Promise<void>;
  private tiles: CanvasPattern[] = [];
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ready = Promise.all([
      ...STAGES.map(
        (stage, index) =>
          new Promise<void>((resolve, reject) => {
            const terrain = new Image();
            terrain.onload = () => {
              const texture = document.createElement('canvas');
              texture.width = texture.height = 850;
              texture.getContext('2d')!.drawImage(terrain, 0, 0, 850, 850);
              this.tiles[index] = this.ctx.createPattern(texture, 'repeat')!;
              resolve();
            };
            terrain.onerror = reject;
            terrain.src = assetUrl(stage.terrain);
          }),
      ),
      ...SPRITE_ATLASES.map(
        (sheet, index) =>
          new Promise<void>((resolve, reject) => {
            const atlas = new Image();
            this.atlases[index] = atlas;
            atlas.onload = () => {
              resolve();
            };
            atlas.onerror = reject;
            atlas.src = assetUrl(sheet.url);
          }),
      ),
    ]).then(() => {});
    this.resize();
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
    for (const z of game.zones) {
      if (!this.visible(z, p, z.radius + 50)) continue;
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
      if (z.hostile) {
        c.strokeStyle = '#301c2280';
        c.lineWidth = 4;
        c.stroke();
        c.strokeStyle = '#ff9b80';
        c.lineWidth = 2;
      }
      c.stroke();
      this.zoneEmblem(z.kind, z.color, time, z.radius);
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
        const colors = { heal: '#e4a49a', magnet: '#a2e2ee', iron: '#cad6e1', chest: '#f0d88e' };
        c.shadowColor = colors[item.kind];
        c.shadowBlur = 14;
        c.fillStyle = '#244740';
        c.strokeStyle = colors[item.kind];
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(-13, -13, 26, 26, 5);
        c.fill();
        c.stroke();
        c.shadowBlur = 0;
        c.fillStyle = colors[item.kind];
        c.font = 'bold 15px serif';
        c.textAlign = 'center';
        c.fillText({ heal: '丹', magnet: '灵', iron: '铁', chest: '宝' }[item.kind], 0, 5);
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
      if (shot.kind === 'sword' || shot.kind === 'arrow' || shot.kind === 'dragon')
        this.sword(shot.x, shot.y, a, shot.color, shot.kind === 'dragon' ? 1.7 : 0.8);
      else {
        c.save();
        c.translate(shot.x, shot.y);
        c.rotate(a);
        c.shadowColor = shot.color;
        c.shadowBlur = 12;
        c.strokeStyle = shot.color;
        c.fillStyle = shot.color;
        if (shot.kind === 'blade') {
          c.rotate(time * 12);
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
        } else if (shot.kind === 'qin') {
          c.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(-15, 0, shot.radius + i * 7, -1, 1);
            c.stroke();
          }
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
          c.beginPath();
          c.ellipse(0, 0, 13, 10, 0, 0, TAU);
          c.fill();
          c.fillRect(-2, 6, 9, 7);
          c.fillStyle = '#332344';
          c.beginPath();
          c.arc(3, -4, 3, 0, TAU);
          c.arc(3, 4, 3, 0, TAU);
          c.fill();
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
        } else {
          c.beginPath();
          c.arc(0, 0, shot.kind === 'hostile' ? 5 : shot.radius * 0.75, 0, TAU);
          c.fill();
          c.fillStyle = '#fff8df';
          c.beginPath();
          c.arc(-1, -1, 2.5, 0, TAU);
          c.fill();
        }
        c.restore();
      }
    }
    for (const e of game.effects) {
      c.save();
      c.globalAlpha = Math.min(1, (e.life / e.maxLife) * 1.8);
      c.strokeStyle = e.color;
      c.fillStyle = e.color;
      if (e.kind === 'text') {
        c.font = `600 ${e.text?.includes('!') ? 16 : 13}px Georgia, serif`;
        c.textAlign = 'center';
        c.shadowColor = '#132421';
        c.shadowBlur = 3;
        c.fillText(e.text || '', e.x, e.y);
      } else if (e.kind === 'cleave') {
        const angle = Math.atan2(e.y2! - e.y, e.x2! - e.x);
        c.lineWidth = (10 * e.life) / e.maxLife + 1;
        c.beginPath();
        c.arc(e.x, e.y, e.radius * (1 - (e.life / e.maxLife) * 0.35), angle - 1.7, angle + 1.7);
        c.stroke();
      } else if (e.kind === 'umbrella' || e.kind === 'bone') {
        const radius = e.radius * (1 - (e.life / e.maxLife) * 0.6);
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
      } else if (e.kind === 'line') {
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
      } else if (e.kind === 'lightning') {
        c.lineWidth = 3;
        c.shadowColor = e.color;
        c.shadowBlur = 16;
        c.beginPath();
        c.moveTo(e.x - 20, e.y - 260);
        c.lineTo(e.x + 12, e.y - 140);
        c.lineTo(e.x - 9, e.y - 130);
        c.lineTo(e.x + 5, e.y);
        c.stroke();
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(e.x, e.y, 35, 18, 0, 0, TAU);
        c.stroke();
      } else {
        const r = e.radius * (1 - e.life / e.maxLife);
        c.lineWidth = e.kind === 'ice' ? 4 : 3;
        c.beginPath();
        c.arc(e.x, e.y, r, 0, TAU);
        c.stroke();
        if (e.kind === 'ice') this.formation(e.x, e.y, r, 0, e.color, 0.5);
      }
      c.restore();
    }
  }
  private zoneEmblem(kind: string, color: string, time: number, radius: number) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 2;
    c.globalAlpha = 0.8;
    c.setLineDash([]);
    if (kind === 'pagoda') {
      for (let i = 0; i < 4; i++) {
        const width = 10 + i * 5,
          y = -40 + i * 15;
        c.beginPath();
        c.moveTo(-width, y + 8);
        c.lineTo(0, y);
        c.lineTo(width, y + 8);
        c.stroke();
        c.strokeRect(-width * 0.65, y + 8, width * 1.3, 9);
      }
    } else if (kind === 'cauldron') {
      c.beginPath();
      c.ellipse(0, 0, 24, 17, 0, 0, Math.PI);
      c.stroke();
      c.beginPath();
      c.ellipse(0, 0, 24, 8, 0, 0, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(-17, 12);
      c.lineTo(-20, 24);
      c.moveTo(17, 12);
      c.lineTo(20, 24);
      c.stroke();
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(i * 12, -8);
        c.quadraticCurveTo(i * 12 + Math.sin(time * 3) * 10, -23, i * 12, -34);
        c.stroke();
      }
    } else if (kind === 'coffin' || kind === 'grave') {
      c.beginPath();
      c.moveTo(-17, -32);
      c.lineTo(17, -32);
      c.lineTo(24, -16);
      c.lineTo(15, 30);
      c.lineTo(-15, 30);
      c.lineTo(-24, -16);
      c.closePath();
      c.stroke();
      c.strokeRect(-8, -20, 16, 33);
    } else if (kind === 'banner') {
      c.beginPath();
      c.moveTo(-8, 23);
      c.lineTo(-8, -30);
      c.lineTo(26, -16);
      c.lineTo(-8, -4);
      c.stroke();
      this.formation(0, 0, radius * 0.8, time * 0.25, color, 0.3);
    } else if (kind === 'brush') {
      c.lineWidth = 5;
      c.rotate(-0.35);
      c.beginPath();
      c.moveTo(-24, -12);
      c.lineTo(18, -12);
      c.moveTo(0, -27);
      c.lineTo(0, 25);
      c.moveTo(-20, 20);
      c.lineTo(18, 2);
      c.stroke();
    } else if (kind === 'bloodpool') {
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(
          0,
          0,
          radius * (0.35 + i * 0.2),
          radius * (0.2 + i * 0.13),
          time * 0.3 + i,
          0,
          TAU,
        );
        c.stroke();
      }
    } else if (kind === 'nest') {
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5;
        c.beginPath();
        c.ellipse(Math.cos(a) * 15, Math.sin(a) * 15, 6, 10, a, 0, TAU);
        c.stroke();
      }
    } else if (kind === 'sand') {
      c.rotate(time);
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * TAU) / 10,
          r = i % 2 ? 8 : 25;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
    } else if (kind === 'axe') {
      c.rotate(-0.5);
      c.fillRect(-3, -28, 6, 60);
      c.beginPath();
      c.moveTo(0, -24);
      c.quadraticCurveTo(35, -45, 32, 10);
      c.lineTo(0, -3);
      c.closePath();
      c.fill();
    }
    c.restore();
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
    c.restore();
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
