import type { Game, Point } from './game.ts';
import { TAU } from './data.ts';
import { drawRegionalField } from './regional-render.ts';
import { hazardMargin } from './regional-hazards.ts';

export function drawEnemyWarnings(
  ctx: CanvasRenderingContext2D,
  game: Game,
  visible: (at: Point, camera: Point, margin: number) => boolean,
) {
  const c = ctx,
    p = game.player;
  // 仅重绘清晰的边界与标记，不叠加第二层红色底色。
  for (const z of game.zones) {
    if (!z.hostile || !visible(z, p, hazardMargin(z))) continue;
    if (drawRegionalField(c, z, game.time, true, true)) continue;
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
    if (z.kind.startsWith('boss-') && z.delay > 0) {
      const progress = Math.max(0, Math.min(1, 1 - z.delay / (z.castDelay || 1.2)));
      c.setLineDash([]);
      c.beginPath();
      c.arc(0, 0, z.radius * 0.92, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
      c.strokeStyle = '#ffe0a1';
      c.stroke();
    }
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
    if (e.dead || e.boss || e.bossSummon || !visible(e, p, 260)) continue;
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
