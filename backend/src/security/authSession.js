const SESSION_COOKIE = 'studyflow_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
let configuredSecret = process.env.AUTH_TOKEN_SECRET || '';

export function configureAuthSessionSecret(secret) {
  configuredSecret = secret || '';
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url');
}

async function signingKey() {
  if (configuredSecret.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters.');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(configuredSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createAuthSession(user) {
  const payload = base64UrlEncode(JSON.stringify({
    id: user.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  }));
  const key = await signingKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${base64UrlEncode(signature)}`;
}

export async function verifyAuthSession(token) {
  if (typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;

  try {
    const key = await signingKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return null;
    const session = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    if (!session.id || !Number.isFinite(session.exp) || session.exp <= Date.now() / 1000) return null;
    return { id: session.id };
  } catch {
    return null;
  }
}

export function setAuthSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_SECONDS}`);
}

export function clearAuthSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`);
}

export function getAuthSessionCookie(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1)); }
  catch { return null; }
}
