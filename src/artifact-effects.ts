import { TAU } from './data.ts';
import type { Effect, Zone } from './game.ts';

const KINDS = new Set([
  'axe',
  'meteor',
  'coffin',
  'grave',
  'brush',
  'pagoda',
  'banner',
  'cauldron',
  'bloodpool',
  'nest',
  'sand',
  'poison',
  'vortex',
]);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const hasArtifactField = (z: Zone) => !z.hostile && KINDS.has(z.kind);

// 只读取对局时钟；暂停、续局和画布重建都不重放施法，也不使用战斗随机数。
export function artifactCue(z: Zone, reducedMotion = false) {
  const initialDelay = z.castDelay ?? Math.max(z.delay, 0);
  // delay 刚扣至零的那一帧还未结算，不能提前画落地冲击。
  const charging = z.delay > 0 || (initialDelay > 0 && z.life >= z.maxLife);
  const progress = clamp(1 - z.life / Math.max(z.maxLife, 0.001));
  return {
    charging,
    charge: initialDelay > 0 ? clamp(1 - z.delay / initialDelay) : 1,
    progress,
    opacity: charging ? 0.7 : clamp(z.life / Math.min(0.24, z.maxLife * 0.4)),
    motion: reducedMotion ? 0 : 1,
  };
}

function line(c: CanvasRenderingContext2D, points: number[][], close = false, fill = false) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
  if (fill) c.fill();
  c.stroke();
}
function ring(c: CanvasRenderingContext2D, r: number) {
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.stroke();
}
function mote(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  c.beginPath();
  c.moveTo(x - size, y);
  c.lineTo(x, y - size * 1.7);
  c.lineTo(x + size, y);
  c.lineTo(x, y + size * 1.7);
  c.closePath();
  c.fill();
}

/** 地面只画实际作用范围与材质，实体在人物之后绘制，避免巨斧被妖群遮住。 */
export function drawArtifactField(
  c: CanvasRenderingContext2D,
  z: Zone,
  time: number,
  reduced = false,
) {
  const cue = artifactCue(z, reduced),
    r = z.radius;
  const clock = reduced ? 0 : time;
  c.save();
  c.translate(z.x, z.y);
  c.globalAlpha = cue.opacity;
  c.strokeStyle = z.color + (cue.charging ? '66' : '80');
  c.fillStyle = z.color + (cue.charging ? '08' : '12');
  c.lineWidth = 1;
  c.setLineDash(cue.charging ? [3, 9] : []);
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();
  c.stroke();
  c.setLineDash([]);
  if (!cue.charging && ['axe', 'meteor', 'coffin'].includes(z.kind)) {
    // 裂纹从受击中心伸向边界，长度不越过真实伤害圈。
    c.rotate(z.castAngle ?? 0);
    c.strokeStyle = z.color + 'a0';
    c.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      c.save();
      c.rotate((i * TAU) / 6 + 0.13);
      line(c, [
        [r * 0.12, 0],
        [r * 0.38, -7],
        [r * 0.51, 6],
        [r * 0.87, -3],
      ]);
      line(c, [
        [r * 0.38, -7],
        [r * 0.49, -r * 0.15],
      ]);
      c.restore();
    }
  } else if (z.kind === 'vortex') {
    c.rotate(clock * 0.6);
    c.strokeStyle = z.color + 'aa';
    c.lineWidth = 2;
    for (let arm = 0; arm < 2; arm++) {
      c.rotate(Math.PI);
      c.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 1.7,
          d = r * (0.85 - i / 40);
        if (i) c.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        else c.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      c.stroke();
    }
    c.fillStyle = '#d8e9d8';
    c.beginPath();
    c.arc(0, -r * 0.2, r * 0.13, 0, TAU);
    c.fill();
    c.fillStyle = '#153c39';
    c.beginPath();
    c.arc(0, r * 0.2, r * 0.13, 0, TAU);
    c.fill();
  } else if (z.kind === 'bloodpool') {
    c.fillStyle = '#841f5355';
    c.beginPath();
    c.arc(0, 0, r * 0.92, 0, TAU);
    c.fill();
    c.strokeStyle = '#e998bb';
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 + clock * 0.18;
      const d = r * (0.3 + ((i * 0.17 + clock * 0.13) % 0.55));
      c.beginPath();
      c.arc(0, 0, d, a, a + 0.7);
      c.stroke();
    }
  } else if (z.kind === 'poison' || z.kind === 'grave') {
    // 稀薄雾团，不覆盖人物或敌方危险预警。
    c.fillStyle = z.color + '18';
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + clock * 0.12;
      c.beginPath();
      c.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.43, 0, TAU);
      c.fill();
    }
  } else if (z.kind === 'pagoda' || z.kind === 'banner' || z.kind === 'cauldron') {
    c.strokeStyle = z.color + '70';
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i * TAU) / 8);
      line(c, [
        [r * 0.85, -5],
        [r * 0.92, -5],
        [r * 0.92, 5],
        [r * 0.85, 5],
      ]);
      c.restore();
    }
  }
  c.restore();
}

/** 有限数量的几何笔画，不随时间分配纹理、不创建独立粒子或新图片。 */
export function drawArtifactObject(
  c: CanvasRenderingContext2D,
  z: Zone,
  time: number,
  reduced = false,
) {
  const q = artifactCue(z, reduced),
    r = z.radius;
  const clock = reduced ? 0 : time;
  c.save();
  c.translate(z.x, z.y);
  c.globalAlpha = q.opacity * 0.9;
  c.strokeStyle = z.color;
  c.fillStyle = '#193c39';
  c.lineWidth = 1.6;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.setLineDash([]);
  if (z.kind === 'axe') {
    const size = Math.min(r / 140, 1.65);
    // 先举斧、再斜劈；落地时才出现裂纹，避免把蓄力看成已命中。
    const lift = q.charging ? (1 - q.charge ** 3) * 100 * q.motion : 0;
    c.translate(-lift * 0.35, -lift);
    c.rotate((z.castAngle ?? 0) * 0.22 - 0.6 + (q.charging ? -0.9 * (1 - q.charge) * q.motion : 0));
    c.scale(size, size);
    c.fillStyle = '#725745';
    c.strokeStyle = '#dbbc81';
    line(
      c,
      [
        [-5, -58],
        [5, -58],
        [4, 41],
        [-4, 41],
      ],
      true,
      true,
    );
    for (let y = 0; y < 32; y += 6)
      line(c, [
        [-4, y],
        [4, y + 3],
      ]);
    const metal = c.createLinearGradient(-35, -60, 48, -10);
    metal.addColorStop(0, '#b6c1ab');
    metal.addColorStop(0.4, '#3c625f');
    metal.addColorStop(0.7, '#88a399');
    metal.addColorStop(1, '#264345');
    c.fillStyle = metal;
    c.strokeStyle = '#eae3bd';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-3, -56);
    c.quadraticCurveTo(-28, -74, -47, -57);
    c.quadraticCurveTo(-56, -31, -25, -13);
    c.lineTo(-4, -32);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(-3, -56);
    c.quadraticCurveTo(36, -76, 57, -51);
    c.quadraticCurveTo(51, -12, 17, -10);
    c.lineTo(5, -31);
    c.lineTo(-3, -31);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ccd5bd';
    c.beginPath();
    c.moveTo(47, -57);
    c.lineTo(57, -51);
    c.quadraticCurveTo(51, -12, 17, -10);
    c.lineTo(21, -20);
    c.quadraticCurveTo(45, -27, 47, -57);
    c.fill();
    c.strokeStyle = '#d5bb7c';
    line(
      c,
      [
        [9, -48],
        [28, -48],
        [35, -38],
        [22, -31],
        [9, -38],
      ],
      true,
    );
    if (z.castEvolved) {
      c.fillStyle = '#fff1ba';
      mote(c, 25, -40, 5);
    }
  } else if (z.kind === 'meteor') {
    const lift = q.charging ? (1 - q.charge ** 2) * 135 * q.motion : 0;
    c.translate(0, -lift);
    c.scale(Math.min(1.5, r / 80), Math.min(1.5, r / 80));
    if (q.charging && !reduced) {
      c.strokeStyle = z.color + '88';
      for (let i = -1; i <= 1; i++)
        line(c, [
          [i * 17, -50],
          [i * 17, -82],
        ]);
    }
    // 番天印是玉印：兽钮、金边、篆纹和厚重侧面。
    c.fillStyle = '#4f7970';
    c.strokeStyle = '#e3d7a4';
    line(
      c,
      [
        [-31, -21],
        [25, -21],
        [34, -12],
        [34, 20],
        [-22, 20],
        [-31, 11],
      ],
      true,
      true,
    );
    c.fillStyle = '#99ac82';
    line(
      c,
      [
        [-31, -21],
        [25, -21],
        [34, -12],
        [-22, -12],
      ],
      true,
      true,
    );
    c.strokeRect(-17, -7, 44, 21);
    line(c, [
      [-9, -2],
      [2, -2],
      [2, 9],
      [10, 9],
      [10, -2],
      [20, -2],
    ]);
    c.fillStyle = '#cfbd82';
    line(
      c,
      [
        [-15, -23],
        [-9, -39],
        [3, -44],
        [16, -36],
        [10, -29],
        [20, -23],
      ],
      true,
      true,
    );
    if (z.castEvolved) {
      c.strokeStyle = '#fff1ba';
      c.strokeRect(-21, -11, 52, 29);
    }
  } else if (z.kind === 'coffin' || z.kind === 'grave') {
    if (z.kind === 'grave' && q.charging) {
      c.restore();
      return;
    }
    const lift = z.kind === 'coffin' && q.charging ? (1 - q.charge ** 2) * 90 * q.motion : 0;
    c.translate(0, -lift);
    c.rotate(-0.3);
    c.scale(Math.min(1.5, r / 95), Math.min(1.5, r / 95));
    c.fillStyle = '#233934';
    c.strokeStyle = '#d8cfa2';
    line(
      c,
      [
        [-18, -49],
        [18, -49],
        [27, -29],
        [18, 30],
        [-18, 30],
        [-27, -29],
      ],
      true,
      true,
    );
    c.fillStyle = '#475148';
    line(
      c,
      [
        [-12, -42],
        [12, -42],
        [19, -26],
        [12, 21],
        [-12, 21],
        [-19, -26],
      ],
      true,
      true,
    );
    c.strokeStyle = z.color;
    c.lineWidth = 2;
    line(c, [
      [-7, -29],
      [7, -29],
      [0, -29],
      [0, 4],
      [-6, -4],
      [7, -15],
    ]);
    if (z.kind === 'grave') {
      for (let i = -1; i <= 1; i++) {
        const h = reduced ? 16 : (clock * 23 + i * 19 + 60) % 42;
        c.strokeStyle = z.color + '90';
        c.beginPath();
        c.moveTo(i * 16, -26);
        c.quadraticCurveTo(i * 20 + 7, -42 - h, i * 18, -53 - h);
        c.stroke();
      }
    }
  } else if (z.kind === 'brush') {
    const strokes = [
      [
        [-30, -21],
        [24, -25],
      ],
      [
        [-6, -40],
        [-3, 29],
      ],
      [
        [-20, 7],
        [23, -9],
      ],
      [
        [-5, 3],
        [-32, 30],
      ],
      [
        [2, 7],
        [30, 25],
      ],
    ];
    c.rotate(-0.15);
    const size = Math.min(1.05, r / 90);
    c.scale(size, size);
    c.strokeStyle = '#122e31';
    c.lineWidth = 5;
    const count = q.charging ? Math.max(1, Math.ceil(q.charge * strokes.length)) : strokes.length;
    for (const stroke of strokes.slice(0, count)) line(c, stroke);
    c.strokeStyle = '#e0d8ae';
    c.lineWidth = 1.2;
    for (const stroke of strokes.slice(0, count)) line(c, stroke);
    if (!q.charging) {
      c.fillStyle = z.color;
      for (let i = 0; i < 6; i++) {
        const a = i * 2.4;
        mote(c, Math.cos(a) * 48, Math.sin(a) * 48, 2);
      }
    }
  } else if (z.kind === 'pagoda') {
    c.translate(0, -7);
    c.scale(z.castEvolved ? 1.15 : 1, z.castEvolved ? 1.15 : 1);
    for (let i = 0; i < 5; i++) {
      const w = 11 + i * 5,
        y = -85 + i * 17;
      c.fillStyle = '#375e50';
      c.strokeStyle = '#d8c88e';
      line(
        c,
        [
          [-w, y + 7],
          [0, y - 3],
          [w, y + 7],
          [w + 5, y + 5],
        ],
        false,
      );
      c.fillRect(-w * 0.66, y + 8, w * 1.32, 9);
      c.strokeRect(-w * 0.66, y + 8, w * 1.32, 9);
      c.fillStyle = '#fff0b0';
      c.fillRect(-2, y + 10, 4, 5);
    }
    c.strokeStyle = '#eee1b0';
    line(c, [
      [0, -94],
      [0, -85],
    ]);
    c.fillStyle = z.color;
    mote(c, 0, -98, 3);
  } else if (z.kind === 'banner') {
    c.strokeStyle = '#d8ca9d';
    c.lineWidth = 3;
    line(c, [
      [-9, 8],
      [-9, -63],
    ]);
    const sway = Math.sin(clock * 3 + z.x) * 4;
    c.fillStyle = z.color + '99';
    c.strokeStyle = '#eee1bb';
    c.lineWidth = 1;
    line(
      c,
      [
        [-7, -61],
        [32, -54 + sway],
        [25, -39 + sway],
        [34, -24 + sway],
        [-7, -32],
      ],
      true,
      true,
    );
    c.fillStyle = '#f3e7b2';
    mote(c, 9, -44 + sway / 2, 6);
    c.strokeStyle = z.color;
    ring(c, Math.min(24, r * 0.4));
  } else if (z.kind === 'cauldron') {
    c.strokeStyle = '#d5caa0';
    c.fillStyle = '#496d53';
    c.beginPath();
    c.moveTo(-24, -28);
    c.bezierCurveTo(-31, 18, 31, 18, 24, -28);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#b7ca8e';
    c.beginPath();
    c.ellipse(0, -28, 24, 8, 0, 0, TAU);
    c.fill();
    c.stroke();
    line(c, [
      [-16, 1],
      [-21, 17],
    ]);
    line(c, [
      [16, 1],
      [21, 17],
    ]);
    line(c, [
      [-24, -25],
      [-35, -28],
      [-35, -12],
      [-26, -9],
    ]);
    line(c, [
      [24, -25],
      [35, -28],
      [35, -12],
      [26, -9],
    ]);
    for (let i = -1; i <= 1; i++) {
      c.strokeStyle = '#d1e5b188';
      c.beginPath();
      c.moveTo(i * 11, -28);
      c.bezierCurveTo(i * 11 - 10, -42, i * 11 + Math.sin(clock * 2) * 11, -56, i * 11, -68);
      c.stroke();
      c.fillStyle = '#e8c775';
      mote(c, i * 11, 16 + Math.sin(clock * 4 + i) * 3, 3);
    }
  } else if (z.kind === 'nest') {
    if (q.charging) {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 13,
          y = (i % 2) * 10;
        c.fillStyle = '#566847';
        c.beginPath();
        c.ellipse(x, y, 9, 14, i - 1, 0, TAU);
        c.fill();
        c.stroke();
        if (q.charge > 0.6)
          line(c, [
            [x - 4, y - 6],
            [x + 2, y - 1],
            [x - 2, y + 6],
          ]);
      }
    } else {
      const d = r * (0.3 + q.progress * 0.5 * q.motion);
      for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * TAU) / 5);
        c.translate(d, 0);
        c.fillStyle = z.color;
        c.beginPath();
        c.ellipse(0, 0, 7, 4, 0, 0, TAU);
        c.fill();
        line(c, [
          [-3, -3],
          [-7, -8],
          [3, -3],
          [7, -8],
        ]);
        line(c, [
          [-3, 3],
          [-7, 8],
          [3, 3],
          [7, 8],
        ]);
        c.restore();
      }
    }
  } else if (z.kind === 'sand') {
    c.fillStyle = '#f2de9e';
    c.strokeStyle = '#ecd59688';
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4,
        d = r * (0.15 + i * 0.1);
      const lift = q.charging ? (1 - q.charge) * (45 + i * 8) * q.motion : 0;
      const x = Math.cos(a) * d,
        y = Math.sin(a) * d - lift;
      if (q.charging && !reduced)
        line(c, [
          [x - 10, y - 24],
          [x, y],
        ]);
      mote(c, x, y, i % 2 ? 3 : 5);
    }
  } else if (z.kind === 'poison' || z.kind === 'bloodpool') {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4,
        d = r * (0.2 + i * 0.12);
      const lift = reduced ? 4 : (clock * 12 + i * 9) % 22;
      c.save();
      c.translate(Math.cos(a) * d, Math.sin(a) * d - lift);
      c.globalAlpha *= 0.55;
      if (z.kind === 'poison') {
        c.fillStyle = z.color + '40';
        c.beginPath();
        c.arc(0, 0, 4 + (i % 3) * 2, 0, TAU);
        c.fill();
        c.stroke();
      } else {
        c.fillStyle = '#eda6c7';
        c.beginPath();
        c.moveTo(0, -6);
        c.bezierCurveTo(-7, 2, -5, 7, 0, 7);
        c.bezierCurveTo(5, 7, 7, 2, 0, -6);
        c.fill();
      }
      c.restore();
    }
  }
  c.restore();
}

export function drawArtifactBeam(c: CanvasRenderingContext2D, e: Effect, reduced = false) {
  const dx = e.x2! - e.x,
    dy = e.y2! - e.y;
  const length = Math.hypot(dx, dy),
    progress = 1 - e.life / e.maxLife;
  c.save();
  c.translate(e.x, e.y);
  c.rotate(Math.atan2(dy, dx));
  c.setLineDash([]);
  c.lineCap = 'round';
  c.strokeStyle = e.color;
  if (e.kind === 'chain') {
    const count = Math.max(1, Math.min(24, Math.ceil(length / 18)));
    const step = length / count;
    c.lineWidth = 1.6;
    for (let i = 0; i < count; i++) {
      c.beginPath();
      c.ellipse((i + 0.5) * step, 0, step * 0.47, i % 2 ? 2 : 4, 0, 0, TAU);
      c.stroke();
    }
    c.beginPath();
    c.arc(length, 0, 10, 0, TAU);
    c.stroke();
  } else if (e.kind === 'whip') {
    c.globalAlpha *= 0.14;
    c.lineWidth = e.radius * 2;
    line(c, [
      [0, 0],
      [length, 0],
    ]);
    c.globalAlpha /= 0.14;
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const y =
        Math.sin(t * Math.PI * 3 - (reduced ? 0 : progress * 4)) *
        Math.sin(t * Math.PI) *
        e.radius *
        0.35;
      if (i) c.lineTo(t * length, y);
      else c.moveTo(0, y);
    }
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = '#f2c8ab';
    c.stroke();
  } else {
    c.lineWidth = e.kind === 'starline' ? e.radius * 2 : 9;
    c.globalAlpha *= 0.12;
    line(c, [
      [0, 0],
      [length, 0],
    ]);
    c.globalAlpha /= 0.12;
    c.lineWidth = 1.5;
    line(c, [
      [0, 0],
      [length, 0],
    ]);
    c.fillStyle = '#eee4ba';
    const count = e.kind === 'starline' ? 4 : 2;
    for (let i = 1; i <= count; i++) mote(c, (length * i) / count, 0, i === count ? 5 : 3);
  }
  c.restore();
}
