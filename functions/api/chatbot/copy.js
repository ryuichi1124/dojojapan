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
  const subject = `公式サイトで${label(payload?.intent)}の案内文がコピーされました`;
  const customerLines = [
    `受付日時: ${formatJstDateTime(new Date())}`,
    `お名前: ${payload?.name || '未入力'}`,
    `内容: ${label(payload?.intent)}`,
  ];
  const plan = planLabel(payload?.plan);
  if (plan) customerLines.push(`プラン: ${plan}`);
  customerLines.push(
    `人数: ${payload?.people || '未入力'}`,
    `言語: ${languageLabel(payload?.lang)}`,
  );

  const body = [
    '公式サイトのチャットボットで、お客様が問い合わせ用の文章をコピーしました。',
    '',
    'この時点では予約確定ではありません。',
    'Instagram DMなどで連絡が届いた際に、下記の内容を確認してご案内ください。',
    '',
    '------------------------------',
    'お客様情報',
    '------------------------------',
    ...customerLines,
    '',
    '------------------------------',
    'コピーされた問い合わせ文',
    '------------------------------',
    text,
    '',
    '------------------------------',
    '確認用',
    '------------------------------',
    payload?.page || 'ページURL未取得',
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

function planLabel(plan) {
  if (plan === 'visitor') return 'ビジター利用';
  if (plan === 'member') return '月会員';
  if (plan === 'prime') return '正会員';
  return '';
}

function languageLabel(lang) {
  if (lang === 'ja') return '日本語';
  if (lang === 'en') return '英語';
  if (lang === 'ko') return '韓国語';
  if (lang === 'zh') return '中国語';
  return lang || '未取得';
}

function formatJstDateTime(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
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
