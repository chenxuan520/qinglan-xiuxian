import { HOUSE_AD_PLACEMENTS, HOUSE_AD_MAX_BYTES } from '../../src/house-ad-contract.ts';

// 只描述接口契约，不读取投放、账号、会话或统计数据。
export function houseAdsOpenApi(origin: string) {
  const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
  const body = (schema: unknown) => ({
    required: true,
    content: { 'application/json': { schema } },
  });
  const response = (description: string, schema: Record<string, unknown> = ref('Message')) => ({
    description,
    content: { 'application/json': { schema } },
  });
  const errors = {
    '400': response('正文或参数无效；配置最大' + HOUSE_AD_MAX_BYTES + '字节'),
    '401': response('登录失效或账号密码不正确；停止写入，交由操作者处理'),
    '403': response('来源、Content-Type不符或登录人机验证未通过；不会保存'),
    '405': response('不支持此HTTP方法'),
    '409': response('版本冲突；重新读取并核对差异，不得盲目重放旧配置'),
    '429': response('当前来源登录失败尝试过多；15分钟后再试，不循环认证'),
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
  const document = {
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
      '/admin/diagnostics': {
        get: {
          ...operation('getLoadDiagnostics', '只读查询匿名广告加载故障'),
          parameters: [
            {
              name: 'days',
              in: 'query',
              schema: { type: 'integer', enum: [1, 7, 30], default: 7 },
            },
          ],
          responses: {
            '200': response(
              'UTC日聚合，最多500行；含阶段/错误类别/版本/设备/浏览器族/状态码/次数/总耗时/最后时间',
              {
                type: 'object',
                properties: { rows: { type: 'array', items: { type: 'object' } } },
              },
            ),
            ...errors,
          },
        },
      },
      '/api/reward-content/preload': {
        servers: [{ url: origin }],
        get: {
          operationId: 'preloadPlayerContent',
          summary: '预加载当前端最多4张已启用素材，不签发凭条或累计指标',
          security: [],
          parameters: [
            {
              name: 'device',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['mobile', 'desktop'] },
            },
          ],
          responses: {
            '200': response('为四位置按本端权重预选创意及去重图片，Google/占位模式无创意', {
              type: 'object',
              properties: {
                images: { type: 'array', maxItems: 4, items: { type: 'string', format: 'uri' } },
                ads: { type: 'object', description: '四个位置各自的公开创意或null，不含receipt' },
              },
            }),
            ...errors,
          },
        },
      },
      '/admin/login': {
        post: {
          ...operation('login', '账号密码登录，保存Set-Cookie', {
            type: 'object',
            required: ['username', 'password', 'cf-turnstile-response'],
            properties: {
              username: { type: 'string', maxLength: 254 },
              password: { type: 'string', minLength: 1, maxLength: 128, writeOnly: true },
              'cf-turnstile-response': {
                type: 'string',
                minLength: 1,
                maxLength: 2048,
                writeOnly: true,
                description: '正常浏览器登录组件取得的新验证结果，5分钟有效且只能用一次。',
              },
            },
          }),
          security: [],
          description:
            'JSON正文最大4096字节。必须同时提交账号密码和新的Turnstile验证结果；服务端核验success===true、action=ad_admin_login及本站精确hostname。agent可在正常浏览器登录后，在同一浏览器会话调用管理JSON API，原8小时会话不需要重复验证码。没有免验证的密码登录接口。不要输出密码、验证结果或Set-Cookie。',
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
      '/api/reward-content/creative': {
        servers: [{ url: origin }],
        get: {
          operationId: 'getPlayerCreative',
          summary: '只读抽取该端与广告位的一条当前广告',
          security: [],
          description:
            'agent检查必须带verification=1，不带管理Cookie，不上报观看、点击或领取事件。无有效投放时ad为null；统计签发受频控时仍返回广告，receipt可以缺省。',
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
              name: 'campaign',
              in: 'query',
              schema: { type: 'string', pattern: '^[a-zA-Z0-9-]{1,64}$' },
              description:
                '仅实际打开已预备的创意时指定；须仍启用、包含该位置且本端正权重，否则ad=null。',
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
            receipt: {
              type: 'string',
              description:
                '可选；频控、缺边缘IP或统计服务异常时不签发，仍可观看广告；验证时不伪造观看、点击或领取。',
            },
          },
        },
      },
    },
  };
  // 管理接口仍使用 /ads；玩家公开入口独立声明根路径，不能泛化为管理别名。
  Object.assign(document.paths, {
    '/api/reward-content/config': {
      servers: [{ url: origin }],
      get: {
        operationId: 'getPlayerContentConfig',
        summary: '匿名读取当前供给配置',
        security: [],
        parameters: document.paths['/api/reward-content/creative'].get.parameters
          .filter((p) => ['placement', 'verification'].includes(p.name))
          .map((p) => ({ ...p, required: false })),
        responses: {
          '200': response('当前配置，可选Google统计凭条', {
            type: 'object',
            required: ['settings'],
            properties: {
              settings: ref('Settings'),
              receipt: { type: 'string' },
            },
          }),
          ...errors,
        },
      },
    },
    '/api/reward-content/event': {
      servers: [{ url: origin }],
      post: {
        operationId: 'recordPlayerContentEvent',
        summary: '凭条累计事件；agent验证不伪造此请求',
        security: [],
        parameters: [
          {
            ...writeOrigin,
            description: '官网或Pages允许的Origin；不携带管理Cookie。',
            schema: { type: 'string' },
          },
        ],
        requestBody: body({
          type: 'object',
          additionalProperties: false,
          required: ['receipt', 'flags'],
          properties: {
            receipt: { type: 'string', format: 'uuid' },
            flags: { type: 'integer', enum: [1, 3, 5, 7, 13, 15] },
          },
        }),
        responses: { '204': { description: '已接收；同一凭条事件幂等' }, ...errors },
      },
    },
  });
  return document;
}

export const AD_API_GUIDE = String.raw`# 青岚纪广告管理 API

服务基址：https://xiuxian.011203.xyz/ads
机器契约：/ads/openapi.json（OpenAPI 3.1）。普通登录页面的head元数据可发现本说明；页面正文不展示agent提示。说明与契约公开，账号、会话、完整配置和指标不公开。

## 登录与退出

复用现有后台账号密码，不需要API key、Cloudflare登录或新授权。凭据由操作者提供，不从页面、仓库或文档寻找。POST /admin/login，JSON正文为 {"username":"你的账号","password":"你的密码","cf-turnstile-response":"本次浏览器验证结果"}，总正文最多4096字节；请求应带明确的客户端标识，例如 User-Agent: Qinglan-Ad-Agent/1.0；所有POST/PUT必须发送 Origin: https://xiuxian.011203.xyz 和 Content-Type: application/json。成功返回 {"ok":true}，保存Set-Cookie到内存会话或私有cookie jar；后续管理请求发送该Cookie。会话有效期8小时，Secure/HttpOnly/SameSite=Strict；不支持跨站浏览器管理。新登录必须通过官方Turnstile组件；验证结果最多2048字符、5分钟有效且只能用一次，服务端核对ad_admin_login动作与本站精确hostname，网络或配置失败不会放行。登录失败或验证码过期须在原组件重新取得验证结果，不能重放旧结果。已有会话继续有效，后续配置/统计请求无需重复验证。移除全局100次/15分钟额度，只保留可信来源IP散列的10次/15分钟失败及并发名额；成功和服务故障释放名额，错误账号密码保留计数，不记录原始IP。不要将密码放URL、命令行参数、日志或工具输出，也不要打印Cookie。

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

玩家端统一使用官网根路径 GET /api/reward-content/config、GET /api/reward-content/creative、GET /api/reward-content/preload、POST /api/reward-content/event，不拼接 /ads，不提供旧 /v1/ 或 /ads/v1/ 兼容接口。四个精确公开地址共用来源白名单、凭条和签发频控；管理和登录仍位于 /ads/admin/，新前缀不提供管理入口。公开响应带 X-Qinglan-Content: reward-content-v1 并对允许的跨域来源暴露；这是响应来源诊断标记，不是鉴权或完整性保证。新路径非JSON且缺此标记时记录 unexpected-response，仍不收集响应正文，不能仅凭此断言具体拦截规则。下文公开完整路径以官网根域为基址，管理路径仍相对于上方管理基址。

GET /admin/stats?days=1|7|30，默认7。返回from/to/timezone/rows，按北京时间及请求日归集。每行含id/name/provider/archived及requests/shown/clicked/watched/claimed；零分母比率不应当作0%，Google点击与收入以官方报表为准。统计失败不能伪装零数据。

GET /api/reward-content/preload?device=mobile|desktop，匿名按四广告位及当前端正权重分别抽取一条创意，返回ads及最多4张去重图片；不签发receipt、不计请求或曝光。首页空闲时预加载模块、配置和图片，自营类型与成功图片预备最多保留两分钟且一次消费；前台联网且非省流量时每分钟续备，完整观看后即补下一条，并发合并。切后台、断网或页面退出取消预热，返回前台或恢复联网重新准备；打开立即显示预备素材，后台GET /api/reward-content/creative携带campaign=id核验当前启用、位置、端权重并申请新凭条。失效或已改素材立即停止并回退，不继续观看或解锁；未核验成功不能完成。未预备或已过期走原即时抽取；不提前播放或启动观看时钟，省流量模式不预热。实际播放仍须有效观看满5秒后才能关闭，满5秒保留画面，主动关闭才回奖励页领取。

GET /admin/diagnostics?days=1|7|30 复用管理登录，返回rows，按UTC日聚合加载故障，最多500行。字段为day/version/placement/device/browser/stage/code/status/count/elapsed_total/last_seen；stage为platform-module/settings/house-module/creative/image/sdk，code为timeout/network/http/invalid/unavailable/body-read/empty/html/json/schema/too-large/unexpected-response；status为实际收到的HTTP状态，未取得响应时为0。仅故障上报，不把无投放或玩家关闭视为故障；Via仅在UA声明Via时识别，否则记录实际可识别的浏览器族，不能据此排除Via。故障上报独立入口 POST https://xiuxian.011203.xyz/api/client-status，Origin白名单、512字节封闭字段校验、每IP单机房每分钟约30次的独立边缘频控，故障静默丢弃，不影响游戏；保留最近约30天。不会保存原始IP、完整UA、链接、异常原文、存档或任何账号凭据。此聚合只供诊断，不能单凭network类别断言被浏览器拦截。机器验证不要向正式入口造故障数据。

验证投放可匿名GET /api/reward-content/creative?placement=revive&device=mobile&verification=1；device可为desktop/mobile，无投放ad=null。凭条签发使用Cloudflare边缘频控：同一CF-Connecting-IP在单机房每60秒约60张，自营和Google（/api/reward-content/config）所有位置、设备及verification请求共用额度。超限、缺可信边缘IP/绑定或限流异常时，仍200返回广告或settings，但不发receipt、不新增统计写入；已发凭条的事件继续按原规则处理。共享出口IP可能少记，机房之间独立且计数近似，不能作为全球严格配额或结算防作弊。不要携带管理Cookie，不调用游戏事件接口伪造展示、点击、看完或领取。图片预览直接读取HTTPS素材；指标只供参考，不用于结算。

## agent与Python调用示例

agent推荐通过正常浏览器在 /ads/admin/ 完成登录，然后在该浏览器的同源Cookie会话中调用JSON接口。纯HTTP的新登录同样需要合法前端取得的新Turnstile结果；下面示例不负责获取或绕过人机验证。标准库即可运行；账号密码与验证结果不会进入命令行；仅输出revision、条数及统计窗口，不输出凭据或完整配置。编辑时按上面的读改写读流程使用request("/admin/config", "PUT", edited_config)，不要直接构造空配置覆盖线上。

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
captcha_response = getpass.getpass("本次浏览器验证结果: ")
request("/admin/login", "POST", {"username": username, "password": password,
                                 "cf-turnstile-response": captcha_response})
del password, captcha_response
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
