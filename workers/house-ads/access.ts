// 验证 Access 签名、签发方、应用和有效期；邮箱标头本身不作为登录凭据。
type AccessConfig = { ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; ADMIN_EMAIL: string };
const decode = (part: string) =>
  Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export async function allowedAdAdmin(
  request: Request,
  env: AccessConfig,
  fetcher: typeof fetch = fetch,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN) ||
    !env.ACCESS_AUD ||
    !env.ADMIN_EMAIL
  )
    return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 12_000) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return false;
    const header: unknown = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims: unknown = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (
      !object(header) ||
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      !object(claims) ||
      claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` ||
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      typeof claims.iat !== 'number' ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 30 ||
      claims.iat >= claims.exp ||
      (claims.nbf !== undefined &&
        (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now)) ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(env.ACCESS_AUD) ||
      typeof claims.email !== 'string' ||
      claims.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
    )
      return false;
    const response = await fetcher(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, {
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
    });
    if (!response.ok) return false;
    // 公开 JWKS 有固定上限，不能跟随用户提供的签名地址。
    const { boundedAdJson } = await import('../../src/house-ad-contract.ts');
    const jwks = await boundedAdJson(response, 64_000);
    if (!object(jwks) || !Array.isArray(jwks.keys)) return false;
    const key = jwks.keys.find(
      (key: unknown) =>
        object(key) &&
        key.kid === header.kid &&
        key.kty === 'RSA' &&
        (key.alg === undefined || key.alg === 'RS256') &&
        (key.use === undefined || key.use === 'sig'),
    );
    if (!object(key) || typeof key.n !== 'string' || typeof key.e !== 'string') return false;
    const imported = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      imported,
      decode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}
