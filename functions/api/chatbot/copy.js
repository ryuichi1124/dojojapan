const DEFAULT_MAIL_ENDPOINT = 'https://crossbeams.xsrv.jp/mail/dojo-reservation-mail.php';
const DEFAULT_NOTIFY_TO = 'ichi.design1111@gmail.com';
const MAX_TEXT_LENGTH = 4000;
const RATE_LIMIT_SECONDS = 60 * 60;
const RATE_LIMIT_MAX = 8;

export async function onRequestPost({ request, env }) {
  if (!env.DOJO_MAIL_SECRET) {
    return json({ ok: false, error: 'mail_not_configured' }, 503);
  }

  const origin = request.headers.get('origin') || '';
  if (origin && !isAllowedOrigin(origin)) {
    return json({ ok: false, error: 'forbidden_origin' }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const text = sanitizeText(payload?.text || '');
  if (!text) return json({ ok: false, error: 'empty_text' }, 400);

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimited = await isRateLimited(env, ip);
  if (rateLimited) return json({ ok: false, error: 'rate_limited' }, 429);

  const endpoint = env.DOJO_MAIL_ENDPOINT || DEFAULT_MAIL_ENDPOINT;
  const to = env.CHATBOT_COPY_NOTIFY_TO || DEFAULT_NOTIFY_TO;
  const subject = `公式サイト チャットボットコピー ${label(payload?.intent)} ${payload?.name || ''}`.trim();
  const body = [
    '公式サイトのチャットボットで案内文がコピーされました。',
    '',
    `日時: ${new Date().toISOString()}`,
    `ページ: ${payload?.page || '未取得'}`,
    `言語: ${payload?.lang || '未取得'}`,
    `内容: ${label(payload?.intent)}`,
    `プラン: ${payload?.plan || '未選択'}`,
    `人数: ${payload?.people || '未取得'}`,
    `名前: ${payload?.name || '未入力'}`,
    '',
    '--- コピー内容 ---',
    text,
  ].join('\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dojo-mail-secret': env.DOJO_MAIL_SECRET,
      },
      body: JSON.stringify({ to, subject, body, replyTo: 'dojomail@dojo-japan.jp' }),
    });
    if (!response.ok) return json({ ok: false, error: 'mail_failed' }, 502);
  } catch (_) {
    return json({ ok: false, error: 'mail_failed' }, 502);
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function sanitizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, MAX_TEXT_LENGTH);
}

function label(intent) {
  if (intent === 'trial') return '初回体験';
  if (intent === 'member') return '入会相談';
  if (intent === 'tour') return '施設見学';
  return intent || '未選択';
}

function isAllowedOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    return host === 'dojo-japan.jp'
      || host === 'www.dojo-japan.jp'
      || host.endsWith('.dojojapan.pages.dev')
      || host === 'localhost'
      || host === '127.0.0.1';
  } catch (_) {
    return false;
  }
}

async function isRateLimited(env, ip) {
  if (!env.LINE_BOT_SESSIONS || !ip) return false;
  const key = `chatbot-copy-rate:${ip}`;
  const current = Number(await env.LINE_BOT_SESSIONS.get(key)) || 0;
  if (current >= RATE_LIMIT_MAX) return true;
  await env.LINE_BOT_SESSIONS.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_SECONDS });
  return false;
}
