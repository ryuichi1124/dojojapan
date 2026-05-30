const LINE_API_BASE = 'https://api.line.me';
const LINE_DATA_BASE = 'https://api-data.line.me';
const DEFAULT_IMAGE_PATH = '/assets/line/dojo-member-richmenu.jpg';
const ADMIN_AUTH_FAIL_LIMIT = 5;
const ADMIN_AUTH_LOCK_SECONDS = 15 * 60;
const MENU_CONFIGS = {
  member: {
    alias: 'dojo-member',
    name: 'DOJO JAPAN member rich menu',
    imagePath: DEFAULT_IMAGE_PATH,
    labels: {
      primary: '予約',
      secondary: '予約キャンセル・確認',
      instagram: '公式Instagram',
      official: 'DOJO公式サイト',
    },
    links: {
      primaryUrl: 'https://dojo-japan.jp/dj-member-rsv-8f3k2q/?utm_source=line&utm_medium=richmenu&utm_campaign=member_menu',
      secondaryUrl: 'https://dojo-japan.jp/dj-member-rsv-8f3k2q/?utm_source=line&utm_medium=richmenu&utm_campaign=member_menu',
      instagramUrl: 'https://www.instagram.com/dojo_japan/',
      officialUrl: 'https://dojo-japan.jp/?utm_source=line&utm_medium=richmenu&utm_campaign=member_menu',
    },
  },
  guest: {
    alias: 'dojo-guest',
    name: 'DOJO JAPAN guest rich menu',
    imagePath: DEFAULT_IMAGE_PATH,
    labels: {
      primary: '初回体験',
      secondary: 'ビジター利用',
      instagram: '公式Instagram',
      official: 'DOJO公式サイト',
    },
    links: {
      primaryUrl: 'https://dojo-japan.jp/?utm_source=line&utm_medium=richmenu&utm_campaign=guest_menu#trial',
      secondaryUrl: 'https://dojo-japan.jp/pricing?utm_source=line&utm_medium=richmenu&utm_campaign=guest_menu#visitor',
      instagramUrl: 'https://www.instagram.com/dojo_japan/',
      officialUrl: 'https://dojo-japan.jp/?utm_source=line&utm_medium=richmenu&utm_campaign=guest_menu',
    },
  },
};

export async function onRequestPost({ request, env }) {
  try {
    const auth = await authorize(request, env);
    if (auth.locked) return json({ ok: false, error: 'TOO_MANY_ATTEMPTS' }, 429, { 'retry-after': String(ADMIN_AUTH_LOCK_SECONDS) });
    if (!auth.ok) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ ok: false, error: 'LINE_TOKEN_NOT_CONFIGURED' }, 503);
    const input = await readJson(request);
    const menuKey = normalizeMenuKey(input.menuKey);
    const config = MENU_CONFIGS[menuKey];
    const links = normalizeLinks(menuKey, input.links || input);
    const imagePath = normalizeImagePath(input.imagePath || config.imagePath);
    const menu = buildMenu(menuKey, links);

    const created = await lineRequest(env, LINE_API_BASE, '/v2/bot/richmenu', {
      method: 'POST',
      jsonBody: menu,
    });
    const richMenuId = created.richMenuId;

    const imageUrl = new URL(imagePath, request.url);
    const image = await fetch(imageUrl);
    if (!image.ok) return json({ ok: false, error: 'RICH_MENU_IMAGE_NOT_FOUND', status: image.status }, 500);

    await lineRequest(env, LINE_DATA_BASE, `/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      body: await image.arrayBuffer(),
      contentType: 'image/jpeg',
    });

    await upsertAlias(env, config.alias, richMenuId);

    return json({ ok: true, menuKey, alias: config.alias, richMenuId, links, imagePath });
  } catch (error) {
    return json({ ok: false, error: error.message || 'SERVER_ERROR' }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await authorize(request, env);
    if (auth.locked) return json({ ok: false, error: 'TOO_MANY_ATTEMPTS' }, 429, { 'retry-after': String(ADMIN_AUTH_LOCK_SECONDS) });
    if (!auth.ok) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ ok: false, error: 'LINE_TOKEN_NOT_CONFIGURED' }, 503);
    const menus = {};
    for (const menuKey of Object.keys(MENU_CONFIGS)) {
      menus[menuKey] = await getCurrentMenu(env, menuKey);
    }
    return json({
      ok: true,
      service: 'dojo-line-rich-menu-sync',
      menus,
    });
  } catch (error) {
    return json({ ok: false, error: error.message || 'SERVER_ERROR' }, 500);
  }
}

function buildMenu(menuKey, links) {
  const config = MENU_CONFIGS[menuKey];
  return {
    size: { width: 2500, height: 1686 },
    selected: false,
    name: config.name,
    chatBarText: 'メニュー',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 260 },
        action: { type: 'richmenuswitch', label: '会員の方専用', richMenuAliasId: 'dojo-member', data: 'switch=member' },
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 260 },
        action: { type: 'richmenuswitch', label: '初めて・非会員の方', richMenuAliasId: 'dojo-guest', data: 'switch=guest' },
      },
      {
        bounds: { x: 0, y: 300, width: 1250, height: 693 },
        action: { type: 'uri', label: config.labels.primary, uri: links.primaryUrl },
      },
      {
        bounds: { x: 1250, y: 300, width: 1250, height: 693 },
        action: { type: 'uri', label: config.labels.secondary, uri: links.secondaryUrl },
      },
      {
        bounds: { x: 0, y: 993, width: 1250, height: 693 },
        action: { type: 'uri', label: config.labels.instagram, uri: links.instagramUrl },
      },
      {
        bounds: { x: 1250, y: 993, width: 1250, height: 693 },
        action: { type: 'uri', label: config.labels.official, uri: links.officialUrl },
      },
    ],
  };
}

async function getCurrentMenu(env, menuKey) {
  const config = MENU_CONFIGS[menuKey];
  const aliasResponse = await fetch(`${LINE_API_BASE}/v2/bot/richmenu/alias/${config.alias}`, {
    headers: lineHeaders(env, 'application/json'),
  });
  if (aliasResponse.status === 404) return defaultMenuState(menuKey);
  const aliasText = await aliasResponse.text();
  if (!aliasResponse.ok) throw new Error(`LINE_ALIAS_READ_FAILED: ${aliasResponse.status} ${aliasText}`);
  const alias = aliasText ? JSON.parse(aliasText) : {};
  const richMenuId = alias.richMenuId || '';
  if (!richMenuId) return defaultMenuState(menuKey);

  const menu = await lineRequest(env, LINE_API_BASE, `/v2/bot/richmenu/${richMenuId}`, {
    method: 'GET',
  });
  const areas = menu.areas || [];
  return {
    menuKey,
    alias: config.alias,
    richMenuId,
    name: menu.name || '',
    chatBarText: menu.chatBarText || '',
    labels: config.labels,
    imagePath: config.imagePath,
    image: {
      path: config.imagePath,
      width: 2500,
      height: 1686,
      contentType: 'image/jpeg',
    },
    links: extractLinks(menuKey, areas),
    areas,
  };
}

function defaultMenuState(menuKey) {
  const config = MENU_CONFIGS[menuKey];
  return {
    menuKey,
    alias: config.alias,
    richMenuId: '',
    name: config.name,
    chatBarText: 'メニュー',
    labels: config.labels,
    imagePath: config.imagePath,
    image: {
      path: config.imagePath,
      width: 2500,
      height: 1686,
      contentType: 'image/jpeg',
    },
    links: config.links,
    areas: [],
  };
}

function extractLinks(menuKey, areas) {
  const config = MENU_CONFIGS[menuKey];
  const links = { ...config.links };
  for (const area of areas || []) {
    const action = area.action || {};
    if (action.type !== 'uri') continue;
    if (action.label === config.labels.primary) links.primaryUrl = action.uri || links.primaryUrl;
    if (action.label === config.labels.secondary) links.secondaryUrl = action.uri || links.secondaryUrl;
    if (action.label === config.labels.instagram) links.instagramUrl = action.uri || links.instagramUrl;
    if (action.label === config.labels.official) links.officialUrl = action.uri || links.officialUrl;
  }
  return links;
}

function normalizeLinks(menuKey, input) {
  const fallback = MENU_CONFIGS[menuKey].links;
  return {
    primaryUrl: normalizeUrl(input.primaryUrl || input.reservationUrl, fallback.primaryUrl),
    secondaryUrl: normalizeUrl(input.secondaryUrl || input.confirmUrl, fallback.secondaryUrl),
    instagramUrl: normalizeUrl(input.instagramUrl, fallback.instagramUrl),
    officialUrl: normalizeUrl(input.officialUrl, fallback.officialUrl),
  };
}

function normalizeUrl(value, fallback) {
  const url = String(value || fallback || '').trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
    return parsed.toString();
  } catch (_) {
    throw new Error('INVALID_URL');
  }
}

function normalizeImagePath(value) {
  const path = String(value || DEFAULT_IMAGE_PATH).trim();
  if (!/^\/assets\/line\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png)$/i.test(path)) throw new Error('INVALID_IMAGE_PATH');
  return path;
}

function normalizeMenuKey(value) {
  const key = String(value || 'member').trim();
  return MENU_CONFIGS[key] ? key : 'member';
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

async function upsertAlias(env, alias, richMenuId) {
  const create = await fetch(`${LINE_API_BASE}/v2/bot/richmenu/alias`, {
    method: 'POST',
    headers: lineHeaders(env, 'application/json'),
    body: JSON.stringify({ richMenuAliasId: alias, richMenuId }),
  });
  if (create.ok) return;
  const detail = await create.text();
  if (create.status !== 409 && !detail.includes('conflict richmenu alias id')) {
    throw new Error(`LINE_ALIAS_CREATE_FAILED: ${create.status} ${detail}`);
  }
  await lineRequest(env, LINE_API_BASE, `/v2/bot/richmenu/alias/${alias}`, {
    method: 'POST',
    jsonBody: { richMenuId },
  });
}

async function lineRequest(env, base, path, options) {
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: lineHeaders(env, options.contentType || 'application/json'),
    body: options.jsonBody ? JSON.stringify(options.jsonBody) : options.body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LINE_API_FAILED: ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

function lineHeaders(env, contentType) {
  return {
    authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    'content-type': contentType,
  };
}

async function authorize(request, env) {
  if (!env.RESERVATION_ADMIN_USER || !env.RESERVATION_ADMIN_PASSWORD) return { ok: false };
  if (await isAdminAuthLocked(request, env)) return { ok: false, locked: true };

  const ok = request.headers.get('x-admin-user') === env.RESERVATION_ADMIN_USER &&
    request.headers.get('x-admin-password') === env.RESERVATION_ADMIN_PASSWORD;
  if (ok) {
    await clearAdminAuthFailures(request, env);
    return { ok: true };
  }

  const locked = await recordAdminAuthFailure(request, env);
  return { ok: false, locked };
}

async function isAdminAuthLocked(request, env) {
  if (!env.LINE_BOT_SESSIONS) return false;
  const count = Number(await env.LINE_BOT_SESSIONS.get(adminAuthFailureKey(request))) || 0;
  return count >= ADMIN_AUTH_FAIL_LIMIT;
}

async function recordAdminAuthFailure(request, env) {
  if (!env.LINE_BOT_SESSIONS) return false;
  const key = adminAuthFailureKey(request);
  const count = (Number(await env.LINE_BOT_SESSIONS.get(key)) || 0) + 1;
  await env.LINE_BOT_SESSIONS.put(key, String(count), { expirationTtl: ADMIN_AUTH_LOCK_SECONDS });
  return count >= ADMIN_AUTH_FAIL_LIMIT;
}

async function clearAdminAuthFailures(request, env) {
  if (!env.LINE_BOT_SESSIONS) return;
  await env.LINE_BOT_SESSIONS.delete(adminAuthFailureKey(request));
}

function adminAuthFailureKey(request) {
  return `admin-auth-fail:${clientIp(request)}`;
}

function clientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
