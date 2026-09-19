const paths: Record<string, string> = {
  sword: '<path d="m32 5 5 30-5 6-5-6Z"/><path d="M21 39q11-6 22 0M32 40v14m-4-3 4 7 4-7"/>',
  orbit:
    '<path d="M32 15Q17 30 32 44Q47 30 32 15ZM14 27Q13 45 31 46Q28 31 14 27Zm36 0Q51 45 33 46Q36 31 50 27Z"/><path d="M7 38q7 20 25 10 18 10 25-10-10-1-19 5M20 51h24"/>',
  lightning: '<path d="m36 6-20 30h15l-3 22 21-32H34Z"/><path d="m15 9-5 8m42 28 4 8"/>',
  pulse:
    '<path d="M19 40V27q0-16 13-16t13 16v13l6 7H13Zm-1-8h28M24 21h16M28 10V7h8v3m-8 43h8M32 25v14"/>',
  poison:
    '<path d="M27 11h10l-2 8q13 8 2 15 20 8 12 20-17 10-33 0-8-12 12-20-11-7 0-15Z"/><path d="m22 35 20-2M25 43q-5 7 0 9M31 10q4-8 12-4"/>',
  ice: '<circle cx="32" cy="28" r="20"/><circle cx="32" cy="28" r="15"/><path d="M32 48v10m-7 0h14M32 15v26M20 21l24 14M20 35l24-14m-5-5-7 5-6-5m0 24 6-5 7 5"/>',
  fire: '<path d="M35 6q0 14 10 21 15 18-3 28-21 10-28-9-5-12 7-23 0 13 7 13 10-10 7-30Z"/><path d="M32 33q-15 19 2 23 12-10-2-23Z"/>',
  fan: '<path d="m32 54-26-26q26-35 52 0ZM32 54 18 20m14 34V15m0 39 14-34M11 33q21-24 42 0"/>',
  blade: '<path d="M48 9Q8 7 9 36q2 27 31 20-22-1-22-21Q17 16 48 9ZM51 29q8 20-11 27 9-13 2-22Z"/>',
  arrow: '<path d="M17 7q39 25 0 50l10-25ZM10 32h44m-9-7 10 7-10 7m-30-11 6 4-6 4"/>',
  meteor:
    '<path d="M13 31h38v24H13ZM19 31V20h26v11M26 20l6-11 6 11M18 49h28m-26-9h24M24 4l8 5 8-5"/>',
  chain:
    '<path d="M29 22 18 33q-11 12 1 19t19-8l5-7M35 42l11-11q11-12-1-19t-19 8l-5 7M22 42l20-20"/><path d="m14 8-4 5m41 35 4 5"/>',
  vortex:
    '<circle cx="32" cy="32" r="24"/><path d="M32 8c-24 10 24 38 0 48C8 46 56 18 32 8Z"/><circle cx="30" cy="20" r="3"/><circle cx="34" cy="44" r="3"/>',
  talisman:
    '<path d="M21 8v49M18 9h33l-4 8 4 8-4 8H22m0-17h22M30 9l5 7-5 8m-14 33h10M11 39q3-7 8-3m9 7q13-12 21 0"/>',
  pearl:
    '<circle cx="32" cy="28" r="19"/><path d="M19 26q7-20 23-9M8 52q12-17 24 0t24 0M9 45q5-7 10-6m26 0q6-1 11 6M29 53v5"/>',
  dragon:
    '<path d="M11 49q-6-14 15-14 22 0 19-15l-8-5 8-7 8 10-6 14Q43 45 27 43q-18-1-10 12m23-32-8-4 5 12M45 9l-5-6m12 8 6-1M29 43l4 10m-10-9-3 7"/>',
  power: '<path d="M15 12h25l9 8v34H15ZM40 12v10h9M23 30h18M23 38h18M23 46h12"/>',
  haste: '<path d="m32 7 6 17 18 2-14 12 4 18-14-10-15 10 5-18L8 26l18-2Z"/>',
  area: '<circle cx="32" cy="32" r="21"/><path d="M11 32h42M32 11v42M17 17l30 30M17 47l30-30"/>',
  guard: '<path d="m32 7 21 9v17q-3 17-21 24Q14 50 11 33V16Zm0 12v26M21 31h22"/>',
  duration: '<path d="M32 55V25M31 38Q8 40 12 15q20 0 19 23Zm2-8Q31 9 52 8q3 22-19 22Z"/>',
  crit: '<path d="M7 32q25-32 50 0-25 32-50 0Z"/><circle cx="32" cy="32" r="9"/>',
  magnet:
    '<path d="M13 13v23q0 23 19 23t19-23V13H39v23q0 10-7 10t-7-10V13Zm0 12h12m14 0h12M29 5v10m7-10v10"/>',
  spirit: '<path d="m10 28 22-18 22 18M15 27v26h34V27M25 53V36h14v17M8 56h48M32 6V2"/>',
};
export function icon(id: string, color = 'currentColor', cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 64 64" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id] || paths.sword}</svg>`;
}
export const smallIcon = (id: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 5H2v4h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m11 5-6 5H2v4h3l6 5ZM16 9l6 6m0-6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    gem: '<path d="m12 2 8 10-8 10-8-10Zm0 0v20M4 12h16"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    book: '<path d="M3 4q5-1 9 3 4-4 9-3v15q-5-1-9 3-4-4-9-3ZM12 7v15"/>',
    refresh: '<path d="M20 7A9 9 0 1 0 21 15M20 2v6h-6"/>',
  };
  return `<svg viewBox="0 0 24 24" class="small-icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id] || paths.gem}</svg>`;
};
