import { CURIO_IDS, type CurioId } from './curio-data.ts';
import { assetUrl } from './asset-url.ts';
export function curioArt(id: string) {
  const i = CURIO_IDS.indexOf(id as CurioId);
  return i < 0
    ? ''
    : `<span class="curio-art" aria-hidden="true" style="background-image:url('${assetUrl('/assets/curios.webp')}');background-position:${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%"></span>`;
}
