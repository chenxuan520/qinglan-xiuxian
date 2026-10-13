// AdSense ads.txt 验证：根域 011203.xyz 只代理这一份授权声明，其余路径照旧跳个人主页。
// pub ID 与 src/setting.ts 的 ADS_SETTINGS.adsense.client 同源。
const BODY = 'google.com, pub-9047842625721721, DIRECT, f08c47fec0942fa0\n';

export default {
  async fetch(): Promise<Response> {
    return new Response(BODY, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  },
} satisfies { fetch(): Promise<Response> };
