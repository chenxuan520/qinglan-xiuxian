import { HOUSE_AD_PLACEMENTS, HOUSE_AD_MAX_BYTES } from '../../src/house-ad-contract.ts';

// 只描述接口契约，不读取投放、账号、会话或统计数据。
export function houseAdsOpenApi(origin: string) {
  const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
  const body = (schema: unknown) => ({
    required: true,
    content: { 'application/json': { schema } },
  });
  const response = (description: string, schema = ref('Message')) => ({
    description,
    content: { 'application/json': { schema } },
  });
  const errors = {
    '400': response('正文或参数无效；配置最大' + HOUSE_AD_MAX_BYTES + '字节'),
    '401': response('登录失效或账号密码不正确；停止写入，交由操作者处理'),
    '403': response('来源或Content-Type不符；不会保存'),
    '405': response('不支持此HTTP方法'),
    '409': response('版本冲突；重新读取并核对差异，不得盲目重放旧配置'),
    '429': response('登录限流；15分钟后再试，不循环认证'),
    '503': response('服务暂不可用；写入结果不确定时先重新读取配置核对'),
  };
  const writeOrigin = {
    name: 'Origin',
    in: 'header',
    required: true,
    schema: { type: 'string', const: origin },
    description: '非浏览器agent也必须发送此标头；不支持跨站浏览器管理。',
  };
  const operation = (operationId: string, summary: string, schema?: unknown) => ({
    operationId,
    summary,
    ...(schema ? { requestBody: body(schema), parameters: [writeOrigin] } : {}),
    responses: { '200': response('成功', ref('Ok')), ...errors },
  });
  const https = {
    type: 'string',
    maxLength: 2048,
    format: 'uri',
    pattern: '^https://',
    description: '合法HTTPS完整URL，不含用户名、密码或首尾空白；服务端进行URL解析校验。',
  };
  const link = { anyOf: [{ const: '' }, https] };
  return {
    openapi: '3.1.0',
    info: {
      title: '青岚纪广告管理 API',
      version: '1.0.0',
      description:
        '沿用后台账号密码与8小时Cookie会话。先读 /ads/api.md；仅执行操作者要求的改动，读取完整配置后按revision条件保存。文档公开，投放配置和指标仍需登录。',
    },
    servers: [{ url: origin + '/ads' }],
    externalDocs: { description: '登录、编辑、冲突处理与调用示例', url: origin + '/ads/api.md' },
    security: [{ adminSession: [] }],
    paths: {
      '/admin/login': {
        post: {
          ...operation('login', '账号密码登录，保存Set-Cookie', {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: { type: 'string', maxLength: 254 },
              password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
            },
          }),
          security: [],
          description:
            'JSON正文最大2048字节。账号密码由操作者提供，不在说明中。不要输出Set-Cookie。',
        },
      },
      '/admin/logout': {
        post: {
          ...operation('logout', '退出并撤销当前会话', { type: 'object', maxProperties: 0 }),
          parameters: [writeOrigin],
          description: '发送当前Cookie及Content-Type: application/json；已退出时仍返回ok。',
        },
      },
      '/admin/password': {
        post: {
          ...operation('changePassword', '修改密码并撤销全部旧会话', {
            type: 'object',
            required: ['password', 'newPassword'],
            properties: {
              password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
              newPassword: { type: 'string', minLength: 12, maxLength: 128, writeOnly: true },
            },
          }),
          description: '仅操作者明确要求改密时使用；普通广告编辑不调用此接口。正文最大2048字节。',
        },
      },
      '/admin/config': {
        get: {
          ...operation('getConfig', '读取完整投放与Google配置'),
          responses: {
            '200': response('完整配置；保留未要求修改的内容', ref('Config')),
            ...errors,
          },
        },
        put: {
          ...operation('replaceConfig', '以revision条件替换完整配置', ref('Config')),
          description:
            '这是整体替换，不是PATCH。新增、修改、停用、删除都编辑campaigns后提交整个数组；settings可省略并保留现值。不要清空其他广告或擅自切换Google。所有非空图片保存前检查可访问的公开HTTPS响应、image类型及非空正文（总8秒）；失败400 invalid-image含id/field且不改配置。后台另用原生图片加载核验能否解析。成功revision加1；409不得直接用新revision重发旧正文。',
          responses: { '200': response('已保存的完整配置与新revision', ref('Config')), ...errors },
        },
      },
      '/admin/stats': {
        get: {
          ...operation('getStats', '只读查询投放指标'),
          parameters: [
            {
              name: 'days',
              in: 'query',
              schema: { type: 'integer', enum: [1, 7, 30], default: 7 },
            },
          ],
          responses: {
            '200': response('按北京时间、请求日归集；计数不是结算凭据', ref('Stats')),
            ...errors,
          },
        },
      },
      '/v1/ad': {
        get: {
          operationId: 'previewAd',
          summary: '只读抽取该端与广告位的一条当前广告',
          security: [],
          description:
            'agent检查必须带verification=1，不带管理Cookie，不上报观看、点击或领取事件。无有效投放时ad为null。',
          parameters: [
            {
              name: 'placement',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: [...HOUSE_AD_PLACEMENTS] },
            },
            {
              name: 'device',
              in: 'query',
              schema: { type: 'string', enum: ['desktop', 'mobile'] },
              description: '建议显式指定；缺省按UA/Client Hint判定。',
            },
            {
              name: 'verification',
              in: 'query',
              schema: { type: 'string', const: '1' },
              description: '验证请求须填1，避免污染运营指标。',
            },
          ],
          responses: {
            '200': response('本次所选渠道的公开素材；可能附统计凭条', ref('Delivery')),
            ...errors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        adminSession: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Host-qinglan-ad-session',
          description: '登录响应Set-Cookie下发，8小时有效；不得打印或转传。',
        },
      },
      schemas: {
        Ok: { type: 'object', properties: { ok: { const: true } }, required: ['ok'] },
        Message: {
          type: 'object',
          properties: { error: { type: 'string' }, message: { type: 'string' } },
        },
        Config: {
          type: 'object',
          additionalProperties: false,
          required: ['revision', 'campaigns'],
          properties: {
            revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            campaigns: {
              type: 'array',
              maxItems: 20,
              items: ref('Campaign'),
              description: 'id唯一；保存完整数组，遗漏即删除。',
            },
            settings: ref('Settings'),
          },
        },
        Campaign: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name', 'imageUrl', 'targetUrl', 'enabled', 'placements'],
          description:
            '新编辑同时填写desktopWeight和mobileWeight；某端权重大于0须填本端图，任一端投放须填跳转；两端0链接可空。非空链接始终校验。旧weight缺省1；仅完全没有双端权重的旧格式允许缺手机图时沿用电脑图。',
          properties: {
            id: {
              type: 'string',
              pattern: '^[a-zA-Z0-9-]{1,64}$',
              description: '稳定唯一标识；新广告建议UUID，改名不改id。',
            },
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 40,
              pattern: '^[^\\u0000-\\u001f\\u007f]+$',
              allOf: [{ pattern: '\\S' }],
            },
            imageUrl: link,
            mobileImageUrl: link,
            targetUrl: link,
            desktopWeight: { type: 'integer', minimum: 0, maximum: 1000 },
            mobileWeight: { type: 'integer', minimum: 0, maximum: 1000 },
            weight: { type: 'integer', minimum: 1, maximum: 1000, deprecated: true },
            enabled: { type: 'boolean' },
            placements: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { type: 'string', enum: [...HOUSE_AD_PLACEMENTS] },
            },
          },
        },
        Settings: {
          type: 'object',
          additionalProperties: false,
          required: ['provider', 'adsense'],
          description:
            '保持现有供给，除非操作者明确要求切换；填写Google参数不等于审核通过。provider=adsense必须有合法client。',
          properties: {
            provider: { type: 'string', enum: ['house', 'adsense', 'placeholder'] },
            adsense: {
              type: 'object',
              additionalProperties: false,
              required: ['client', 'testMode', 'placements'],
              properties: {
                client: { type: 'string', pattern: '^(|ca-pub-[0-9]{16})$' },
                testMode: { type: 'boolean' },
                placements: {
                  type: 'object',
                  additionalProperties: false,
                  required: [...HOUSE_AD_PLACEMENTS],
                  properties: Object.fromEntries(
                    HOUSE_AD_PLACEMENTS.map((p) => [
                      p,
                      { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,80}$' },
                    ]),
                  ),
                },
              },
            },
          },
        },
        Stats: {
          type: 'object',
          required: ['from', 'to', 'timezone', 'rows'],
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
            timezone: { const: 'Asia/Shanghai' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  provider: { enum: ['house', 'adsense'] },
                  archived: { type: 'boolean' },
                  ...Object.fromEntries(
                    ['requests', 'shown', 'clicked', 'watched', 'claimed'].map((k) => [
                      k,
                      { type: 'integer', minimum: 0 },
                    ]),
                  ),
                },
              },
            },
          },
        },
        Delivery: {
          type: 'object',
          required: ['ad'],
          properties: {
            ad: {
              oneOf: [
                { type: 'null' },
                {
                  type: 'object',
                  required: ['id', 'name', 'imageUrl', 'targetUrl'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    imageUrl: https,
                    mobileImageUrl: https,
                    targetUrl: https,
                  },
                },
              ],
            },
            receipt: { type: 'string', description: '验证时不用于伪造观看、点击或领取。' },
          },
        },
      },
    },
  };
}

export const AD_API_GUIDE = String.raw`# 青岚纪广告管理 API

服务基址：https://xiuxian.011203.xyz/ads
机器契约：/ads/openapi.json（OpenAPI 3.1）。普通登录页面的head元数据可发现本说明；页面正文不展示agent提示。说明与契约公开，账号、会话、完整配置和指标不公开。

## 登录与退出

复用现有后台账号密码，不需要API key、Cloudflare登录或新授权。凭据由操作者提供，不从页面、仓库或文档寻找。POST /admin/login，JSON正文为 {"username":"你的账号","password":"你的密码"}；请求应带明确的客户端标识，例如 User-Agent: Qinglan-Ad-Agent/1.0；所有POST/PUT必须发送 Origin: https://xiuxian.011203.xyz 和 Content-Type: application/json。成功返回 {"ok":true}，保存Set-Cookie到内存会话或私有cookie jar；后续管理请求发送该Cookie。有效期8小时，Secure/HttpOnly/SameSite=Strict；不支持跨站浏览器管理。不要将密码放URL、命令行参数、日志或工具输出，也不要打印Cookie。

结束调用POST /admin/logout，携带Cookie、上述两个标头，撤销当前会话。401停止操作，由操作者处理登录；429等待15分钟，不循环猜密码。修改密码仅在明确要求时调用POST /admin/password，正文password/newPassword，新密码12～128字符；它会撤销全部会话，普通投放编辑不调用。

## 广告与Google配置

1. GET /admin/config 读取完整 {revision,campaigns,settings}。
2. 在此快照上只改操作者指定字段。新增广告用稳定唯一id；更新保留原id；停用设enabled=false；删除从campaigns移除。
3. PUT /admin/config 提交完整revision、campaigns及需要更新的settings。它是整体替换，不是PATCH，遗漏的广告会被删除；settings省略则保留现值。成功返回新的完整配置，revision加1。
4. GET读回核对结果。409表示别人先保存了，重新读取、比较并按原意合并，不能只换revision就重发旧正文。网络中断或503后先读回核对，不盲目重复写入。不要在不确定时以空数组覆盖。

最多20条，正文上限96000字节。每条字段：id（1～64位字母、数字或连字符）、name（非空，最多40字符）、imageUrl、可选mobileImageUrl、targetUrl、desktopWeight、mobileWeight、enabled及placements。四个位置是revive（复活）、reward-root（自选灵根）、reward-supplies（物资）、lifespan（借寿）；至少选一个，不重复。

新编辑请同时写两端整数权重0～1000。某端0不投放，该端图片可以空；大于0必须写本端HTTPS图片。任一端大于0时共用HTTPS跳转必填；两端0三链接可空。非空链接总须合法HTTPS，无账号密码或首尾空白。旧weight保留读取兼容，只有完全缺少两端权重的旧格式允许缺手机图沿用电脑图；编辑旧广告时明确填入它原来实际使用的手机图。enabled仍是总开关。

settings结构见OpenAPI；保留未要求更改的Google参数和provider。自营house、Google adsense、占位placeholder是全局来源选择；不要为了填写参数擅自启用Google，保存也不代表通过审核。

保存前自动检查所有非空图片，包括0权重端主动填写的图片；空的0权重端不检查。后台使用原生Image实际加载，失败或无法解析则不发保存请求。API同时检查可公开访问的HTTPS响应、image类型及非空正文，最多3次重定向、总8秒；拒绝本机/私网字面地址、非图片、空响应、错误状态与超时。服务器不提供完整图片解码保证；agent应先确认素材在目标浏览器能显示。400 invalid-image返回id和field，不回显图片URL，配置及revision保持原值，检查失败保留草稿可重试。

## 指标与验证

GET /admin/stats?days=1|7|30，默认7。返回from/to/timezone/rows，按北京时间及请求日归集。每行含id/name/provider/archived及requests/shown/clicked/watched/claimed；零分母比率不应当作0%，Google点击与收入以官方报表为准。统计失败不能伪装零数据。

验证投放可匿名GET /v1/ad?placement=revive&device=mobile&verification=1；device可为desktop/mobile，无投放ad=null。不要携带管理Cookie，不调用游戏事件接口伪造展示、点击、看完或领取。图片预览直接读取HTTPS素材；指标只供参考，不用于结算。

## Python示例：只读登录、配置、指标、退出

标准库即可运行。输入账号密码不会进入命令行；仅输出revision、条数及统计窗口，不输出凭据或完整配置。编辑时按上面的读改写读流程使用request("/admin/config", "PUT", edited_config)，不要直接构造空配置覆盖线上。

~~~python
import getpass, http.cookiejar, json, urllib.request

ORIGIN = "https://xiuxian.011203.xyz"
BASE = ORIGIN + "/ads"
jar = http.cookiejar.CookieJar()
http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def request(path, method="GET", data=None):
    headers = {"Accept": "application/json", "User-Agent": "Qinglan-Ad-Agent/1.0"}
    if method in ("POST", "PUT"):
        headers.update({"Origin": ORIGIN, "Content-Type": "application/json"})
    raw = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=raw, headers=headers, method=method)
    with http.open(req, timeout=20) as response:
        return json.load(response)

username = input("账号: ")
password = getpass.getpass("密码: ")
request("/admin/login", "POST", {"username": username, "password": password})
del password
try:
    config = request("/admin/config")
    stats = request("/admin/stats?days=7")
    print({"revision": config["revision"], "campaigns": len(config["campaigns"]),
           "from": stats["from"], "to": stats["to"]})
finally:
    request("/admin/logout", "POST", {})
    jar.clear()
~~~
`;
