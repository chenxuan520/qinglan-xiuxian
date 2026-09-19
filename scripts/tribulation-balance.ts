import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { autoplayInput } from '../src/autoplay.ts';
// 满阶根基、十阶炼器、六件觉醒法宝；每次天劫允许用尽十次复活。
const results = [];
for (let round = 1; round <= 5; round++)
  for (const initial of [41, 82, 123, 164, 205, 246, 287, 328, 369]) {
    let seed = initial;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const save = freshSave();
    save.cultivation = 1e9;
    save.unlocked = 6;
    save.training = { vitality: 20, power: 20, speed: 20 };
    save.tribulations = round - 1;
    save.nextTribulationAge = 20000;
    save.age = 20000;
    const source = new Game(save, 6, 0, rand);
    source.level = 100;
    source.weapons = ['sword', 'orbit', 'lightning', 'pulse', 'fire', 'chain'].map((id) => ({
      id,
      level: 6,
      evolved: true,
      timer: 0,
    }));
    source.passives = { guard: 5, duration: 5, haste: 5, power: 5 };
    save.forge = Object.fromEntries(source.weapons.map((w) => [w.id, 10]));
    const g = Game.createTribulation(save, source);
    g.random = rand;
    let hits = 0;
    g.onEvent = (e) => {
      if (e === 'hurt') hits++;
    };
    for (let frame = 0; frame < 600 * 30; frame++) {
      if (g.state === 'won') break;
      if (g.state === 'lost' && !g.revive()) break;
      if (frame % 4 === 0) g.input = autoplayInput(g);
      g.update(1 / 30);
    }
    results.push({
      round,
      seed: initial,
      state: g.state,
      time: Math.round(g.time),
      revives: g.revivesUsed,
      hits,
      bossPct: Math.round(((g.boss?.hp ?? 0) / (g.boss?.maxHp ?? 1)) * 100),
    });
  }
console.table(results);
