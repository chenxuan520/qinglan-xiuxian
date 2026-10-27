import { adSellerLine, validAdPlatformSettings } from '../../src/ad-platform-contract.ts';

export default {
  async fetch(_request: Request, env: Pick<HouseAdsEnv, 'DB'>): Promise<Response> {
    try {
      const row = await env.DB.prepare('SELECT settings FROM ad_config WHERE id = 1').first<{
        settings: string;
      }>();
      const settings: unknown = row ? JSON.parse(row.settings) : null;
      if (!validAdPlatformSettings(settings)) throw Error('invalid-settings');
      return new Response(adSellerLine(settings), {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('temporarily unavailable', {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
  },
} satisfies ExportedHandler<Pick<HouseAdsEnv, 'DB'>>;
