const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PROFILE_URL = 'https://api.line.me/v2/bot/profile/';
const DEFAULT_MAIL_ENDPOINT = 'https://crossbeams.xsrv.jp/mail/dojo-reservation-mail.php';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const CAPACITY = 6;
const START_HOUR = 7;
const END_HOUR = 18;
const CANDIDATE_DAYS = 14;
const MAX_DATE_CANDIDATES = 7;
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const PRICE = {
  trial: 0,
  visitorFirst: 3000,
  visitorRepeat: 5000,
  dogi: 2000,
  wear: 0,
};

const T = {
  welcome: 'DŌJŌ JAPAN へようこそ。\n下部のメニューよりご希望の項目をお選びください。',
  intentQ: 'ご希望の利用方法を選んでください。',
  residentQ: '無料体験は福岡在住の方限定です。お客様について教えてください。',
  residentLocal: '福岡に住んでいる',
  residentVisitor: '観光・出張で来訪',
  residentLocalNote: '承知しました。初回無料体験 45分として受付内容を確認します。',
  residentVisitorNote: '恐れ入ります。無料体験は福岡在住の方限定です。\n観光・出張のお客様はビジター1回目（¥3,000 / 60分）でご案内します。',
  visitorFrequencyQ: 'ビジター利用は今回が初めてですか？',
  visitorFirst: 'ビジター1回目',
  visitorRepeat: 'ビジター2回目以降',
  nameQ: 'お名前をフルネームで入力してください。',
  peopleQ: 'ご来館人数を選んでください。',
  dateQ: '初回体験・ビジター予約は翌日以降で承ります。\n空きのある候補日はこちらです。\nご希望の日付を選んでください。\n※スタッフ確認後に予約確定となります。\n\nお急ぎの場合や当日予約のご相談は、営業時間内にお電話（092-753-3029）・LINE・Instagram DMでご連絡ください。',
  timeQ: '空きのある時間はこちらです。\nご希望の時間を選んでください。\n※スタッフ確認後に予約確定となります。',
  invalidDate: 'ご希望日をもう少し短く送ってください。\n例: 来週土曜 / 平日夜 / 2026-06-01',
  invalidTime: 'ご希望時間をもう少し短く送ってください。\n例: 18時半ごろ / 夕方以降 / 午前中',
  complete: 'ありがとうございます。仮予約として受け付けました。\nスタッフが確認後、予約確定または調整のご案内をいたします。\nご予約状況によりご希望に添えない場合がございます。',
  cancel: 'キャンセル',
  cancelled: '受付をキャンセルしました。\n必要になりましたら、下部メニューから初回体験・ビジター利用を選び直してください。',
  noActiveFlow: '現在進行中の受付はありません。\n下部メニューからご希望の項目をお選びください。',
  restart: '最初から',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function textMessage(text, quickReplies = []) {
  const message = { type: 'text', text };
  if (quickReplies.length) {
    message.quickReply = {
      items: quickReplies.map((item) => ({
        type: 'action',
        action: item.action || { type: 'message', label: item.label, text: item.text || item.label },
      })),
    };
  }
  return message;
}

async function verifySignature(request, body, secret) {
  const signature = request.headers.get('x-line-signature') || '';
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const digest = btoa(String.fromCharCode(...new Uint8Array(signed)));
  return timingSafeEqual(signature, digest);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function getSession(env, userId) {
  if (!env.LINE_BOT_SESSIONS || !userId) return newSession();
  const raw = await env.LINE_BOT_SESSIONS.get(sessionKey(userId));
  if (!raw) return newSession();
  try {
    return { ...newSession(), ...JSON.parse(raw) };
  } catch (_) {
    return newSession();
  }
}

async function putSession(env, userId, session) {
  if (!env.LINE_BOT_SESSIONS || !userId) return;
  await env.LINE_BOT_SESSIONS.put(sessionKey(userId), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

function sessionKey(userId) {
  return `line-session:${userId}`;
}

function newSession() {
  return {
    step: 'intent',
    plan: null,
    firstVisit: null,
    visitorVisit: '',
    resident: null,
    rental: 'undecided',
    name: '',
    people: 1,
    date: '',
    selectedDateKey: '',
    time: '',
  };
}

function startMessages(session) {
  session.step = 'intent';
  return [textMessage(T.welcome)];
}

function isCancelText(text) {
  return /^(キャンセル|中止|やめる|やめます|取り消し|取消|中断|cancel|stop)$/i.test(text);
}

function isCancellableSession(session) {
  return (
    (session.plan === 'trial' || session.plan === 'visitor')
    && ['resident', 'visitor_frequency', 'rental', 'name', 'people', 'date', 'time'].includes(session.step)
  );
}

function cancelMessages(session) {
  if (!isCancellableSession(session)) {
    Object.assign(session, newSession());
    return [textMessage(T.noActiveFlow)];
  }
  Object.assign(session, newSession());
  return [textMessage(T.cancelled)];
}

function cancelQuickReply() {
  return { label: T.cancel };
}

function withCancelQuickReplies(items) {
  return [...items, cancelQuickReply()];
}

function followMessages(session) {
  Object.assign(session, newSession());
  return [textMessage(T.welcome)];
}

function trialMessages(session) {
  Object.assign(session, newSession(), {
    plan: 'trial',
    firstVisit: true,
    step: 'resident',
  });
  return [textMessage(T.residentQ, withCancelQuickReplies([{ label: T.residentLocal }, { label: T.residentVisitor }]))];
}

function visitorMessages(session) {
  Object.assign(session, newSession(), {
    plan: 'visitor',
    firstVisit: false,
    step: 'visitor_frequency',
  });
  return [textMessage(T.visitorFrequencyQ, withCancelQuickReplies([{ label: T.visitorFirst }, { label: T.visitorRepeat }]))];
}

function visitorFirstMessages(session) {
  session.plan = 'visitor';
  session.visitorVisit = 'first';
  session.step = 'name';
  return [
    textMessage('ビジター1回目（¥3,000 / 60分）として受付内容を確認します。'),
    nameMessage(),
  ];
}

function visitorRepeatMessages(session) {
  session.plan = 'visitor';
  session.visitorVisit = 'repeat';
  session.step = 'name';
  return [
    textMessage('ビジター2回目以降（¥5,000 / 60分）として受付内容を確認します。'),
    nameMessage(),
  ];
}

async function handleText(session, text, env, userId) {
  const normalized = text.trim();
  if (!normalized || normalized === T.restart || /^(start|menu|restart)$/i.test(normalized)) {
    return startMessages(Object.assign(session, newSession()));
  }

  if (isCancelText(normalized)) {
    return cancelMessages(session);
  }

  if (session.step === 'visitor_frequency') {
    if (/^(ビジター)?1回目|初めて|初回|first/i.test(normalized)) return visitorFirstMessages(session);
    if (/2回目|以降|再訪|repeat|return/i.test(normalized)) return visitorRepeatMessages(session);
    return [textMessage(T.visitorFrequencyQ, withCancelQuickReplies([{ label: T.visitorFirst }, { label: T.visitorRepeat }]))];
  }

  if ((session.step === 'intent' || session.step === 'complete') && /(無料体験|初回体験|体験|trial)/i.test(normalized)) {
    return trialMessages(session);
  }

  if ((session.step === 'intent' || session.step === 'complete') && /(ドロップイン|drop|ビジター|visitor)/i.test(normalized)) {
    return visitorMessages(session);
  }

  if (session.step === 'resident') {
    if (/福岡|住んで|在住|local/.test(normalized)) {
      session.resident = 'local';
      session.plan = 'trial';
      session.step = 'name';
      return [textMessage(T.residentLocalNote), nameMessage()];
    }
    if (/観光|出張|来訪|visitor|tourist|trip/.test(normalized)) {
      session.resident = 'visitor';
      session.plan = 'visitor';
      session.visitorVisit = 'first';
      session.step = 'name';
      return [textMessage(T.residentVisitorNote), nameMessage()];
    }
    return [textMessage(T.residentQ, withCancelQuickReplies([{ label: T.residentLocal }, { label: T.residentVisitor }]))];
  }

  if (session.step === 'rental') {
    session.step = 'people';
    return [peopleMessage()];
  }

  if (session.step === 'name') {
    const name = normalizeName(normalized);
    if (!name) return [nameMessage()];
    session.name = name;
    session.step = 'people';
    return [peopleMessage()];
  }

  if (session.step === 'people') {
    const people = parseInt(normalized.replace(/[^\d]/g, ''), 10);
    if (!people || people < 1 || people > 6) {
      return [peopleMessage()];
    }
    session.people = people;
    session.step = 'date';
    return [await dateMessage(env, session)];
  }

  if (session.step === 'date') {
    const preferredDate = normalizeFreeText(normalized);
    if (!preferredDate) return [textMessage(T.invalidDate)];
    session.date = preferredDate;
    session.step = 'time';
    return [await timeMessage(env, session)];
  }

  if (session.step === 'time') {
    const preferredTime = normalizeFreeText(normalized);
    if (!preferredTime) return [textMessage(T.invalidTime)];
    session.time = preferredTime;
    session.step = 'complete';
    const lineRequest = await createLineBookingRequest(env, userId, session);
    await notifyLineBookingRequest(env, lineRequest);
    return [textMessage(`${T.complete}\n\n${summaryText(session)}`)];
  }

  return startMessages(Object.assign(session, newSession()));
}

async function handlePostback(session, event, env, userId) {
  const params = new URLSearchParams(event.postback?.data || '');
  if (params.has('switch')) return [];

  const intent = String(params.get('intent') || params.get('plan') || params.get('action') || '').toLowerCase();
  if (intent === 'cancel') return cancelMessages(session);
  if (intent === 'trial' || intent === 'first_trial') return trialMessages(session);
  if (intent === 'visitor' || intent === 'dropin' || intent === 'drop_in') return visitorMessages(session);
  if (intent === 'visitor_first') return visitorFirstMessages(session);
  if (intent === 'visitor_repeat') return visitorRepeatMessages(session);

  const field = params.get('field');

  if (field === 'candidate_date' && session.step === 'date') {
    const date = parseDateKey(params.get('date'));
    if (!date) return [await dateMessage(env, session)];
    session.selectedDateKey = date;
    session.date = formatDateLabel(date);
    session.step = 'time';
    return [await timeMessage(env, session)];
  }

  if (field === 'candidate_time' && session.step === 'time') {
    const time = params.get('time') || '';
    if (!/^\d{2}:00-\d{2}:00$/.test(time)) return [await timeMessage(env, session)];
    session.time = time;
    session.step = 'complete';
    const lineRequest = await createLineBookingRequest(env, userId, session);
    await notifyLineBookingRequest(env, lineRequest);
    return [textMessage(`${T.complete}\n\n${summaryText(session)}`)];
  }

  if (field === 'date' && session.step === 'date') {
    const date = event.postback?.params?.date || '';
    if (!date) return [await dateMessage(env, session)];
    session.date = date;
    session.selectedDateKey = date;
    session.step = 'time';
    return [await timeMessage(env, session)];
  }

  if (field === 'time' && session.step === 'time') {
    const time = event.postback?.params?.time || '';
    if (!time) return [await timeMessage(env, session)];
    session.time = time;
    session.step = 'complete';
    const lineRequest = await createLineBookingRequest(env, userId, session);
    await notifyLineBookingRequest(env, lineRequest);
    return [textMessage(`${T.complete}\n\n${summaryText(session)}`)];
  }

  return startMessages(Object.assign(session, newSession()));
}

function normalizeFreeText(text) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value || value.length > 80) return '';
  return value;
}

function normalizeName(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || value.length > 80) return '';
  return value;
}

function rentalMessage() {
  return textMessage('レンタルはご希望ですか？\nスポーツウェア・グローブ・レガース・タオルは無料、道着のみ ¥2,000 です。', [
    { label: '道着レンタル' },
    { label: 'スポーツウェアのみ' },
    { label: '不要' },
  ]);
}

function peopleMessage() {
  return textMessage(T.peopleQ, withCancelQuickReplies(['1名', '2名', '3名', '4名', '5名', '6名'].map((label) => ({ label }))));
}

function nameMessage() {
  return textMessage(T.nameQ, [cancelQuickReply()]);
}

async function dateMessage(env, session) {
  const candidates = await availableDateCandidates(env, session.people);
  if (!candidates.length) {
    return textMessage('現在、候補を自動表示できる空き枠がありません。\n初回体験・ビジター予約は翌日以降で承ります。\nご希望日をメッセージでお送りください。\n\nお急ぎの場合や当日予約のご相談は、営業時間内にお電話（092-753-3029）・LINE・Instagram DMでご連絡ください。\n※スタッフ確認後に予約確定となります。', [cancelQuickReply()]);
  }
  return textMessage(T.dateQ, withCancelQuickReplies(candidates.map((candidate) => ({
    action: {
      type: 'postback',
      label: candidate.label,
      data: `field=candidate_date&date=${candidate.date}`,
      displayText: candidate.label,
    },
  }))));
}

async function timeMessage(env, session) {
  const date = parseDateKey(session.selectedDateKey);
  const candidates = date ? await availableTimeCandidates(env, date, session.people) : [];
  if (!candidates.length) {
    return textMessage('この日の候補を自動表示できませんでした。\nご希望時間をメッセージでお送りください。\n\nお急ぎの場合や当日予約のご相談は、営業時間内にお電話（092-753-3029）・LINE・Instagram DMでご連絡ください。\n※スタッフ確認後に予約確定となります。', [cancelQuickReply()]);
  }
  return textMessage(`${session.date}\n${T.timeQ}`, withCancelQuickReplies(candidates.map((candidate) => ({
    action: {
      type: 'postback',
      label: candidate.label,
      data: `field=candidate_time&time=${encodeURIComponent(candidate.time)}`,
      displayText: `${session.date} ${candidate.time}`,
    },
  }))));
}

async function availableDateCandidates(env, people) {
  if (!env.RESERVATIONS_DB) return [];
  const dates = [];
  const start = addDays(jstToday(), 1);
  const end = addDays(start, CANDIDATE_DAYS - 1);
  const counts = await confirmedCounts(env, toDateKey(start), toDateKey(end));
  for (let index = 0; index < CANDIDATE_DAYS && dates.length < MAX_DATE_CANDIDATES; index += 1) {
    const date = addDays(start, index);
    if (date.getDay() === 0) continue;
    const dateKey = toDateKey(date);
    const hasOpenSlot = hours().some((hour) => remainingFor(counts, `${dateKey}-${pad(hour)}`) >= people);
    if (hasOpenSlot) dates.push({ date: dateKey, label: formatDateLabel(dateKey) });
  }
  return dates;
}

async function availableTimeCandidates(env, dateKey, people) {
  if (!env.RESERVATIONS_DB) return [];
  const counts = await confirmedCounts(env, dateKey, dateKey);
  return hours()
    .map((hour) => {
      const remaining = remainingFor(counts, `${dateKey}-${pad(hour)}`);
      return { hour, remaining };
    })
    .filter((slot) => slot.remaining >= people)
    .map((slot) => ({
      time: `${pad(slot.hour)}:00-${pad(slot.hour + 1)}:00`,
      label: `${pad(slot.hour)}:00 ${availabilityLabel(slot.remaining)}`,
    }));
}

function availabilityLabel(remaining) {
  return Number(remaining) >= 4 ? '◯空きあり' : '▲残りわずか';
}

async function confirmedCounts(env, startDateKey, endDateKey) {
  const rows = await env.RESERVATIONS_DB.prepare(
    `select session_id as sessionId, coalesce(sum(coalesce(capacity_units, 1)), 0) as units
     from reservations
     where status = 'confirmed' and session_id between ?1 and ?2
     group by session_id`,
  ).bind(`${startDateKey}-00`, `${endDateKey}-23`).all();
  return Object.fromEntries((rows.results || []).map((row) => [row.sessionId, Number(row.units || 0)]));
}

function remainingFor(counts, sessionId) {
  return Math.max(0, CAPACITY - Number(counts[sessionId] || 0));
}

function hours() {
  const result = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) result.push(hour);
  return result;
}

function jstToday() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toDateKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseDateKey(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function formatDateLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${month}/${day}（${DAY_LABELS[date.getUTCDay()]}）`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function summaryText(session) {
  const base = session.plan === 'visitor'
    ? visitorBaseLine(session)
    : { label: '初回無料体験 45分', price: PRICE.trial };
  const rental = rentalLine(session.rental);
  const perPerson = base.price + rental.price;
  const total = perPerson * session.people;
  const lines = [
    `プラン: ${base.label}`,
    `お名前: ${session.name}`,
    `人数: ${session.people}名`,
    `希望日: ${session.date}`,
    `希望時間: ${session.time}`,
    `レンタル: ${rental.label}`,
  ];
  if (session.resident) {
    lines.push(`在住状況: ${session.resident === 'local' ? T.residentLocal : T.residentVisitor}`);
  }
  lines.push(`合計目安: ${formatJPY(perPerson)} × ${session.people}名 = ${formatJPY(total)}`);
  lines.push('支払い: 当日、施設にて現金またはPayPay');
  return lines.join('\n');
}

async function createLineBookingRequest(env, userId, session) {
  const db = lineBookingDb(env);
  if (!db || !userId || !session.name || !session.date || !session.time) return null;
  const sessionId = sessionIdFromSelection(session);
  const profile = await getLineProfile(env, userId);
  const base = session.plan === 'visitor'
    ? visitorBaseLine(session)
    : { price: PRICE.trial };
  const total = (base.price + rentalLine(session.rental).price) * Number(session.people || 1);
  const request = {
    id: crypto.randomUUID(),
    lineUserId: userId,
    lineDisplayName: profile.displayName || '',
    plan: session.plan === 'visitor' ? 'visitor' : 'trial',
    visitorVisit: session.visitorVisit || '',
    resident: session.resident || '',
    displayName: session.name,
    people: Number(session.people || 1),
    preferredDate: session.date,
    preferredDateKey: session.selectedDateKey || '',
    preferredTime: session.time,
    sessionId,
    rental: session.rental || 'undecided',
    summaryText: summaryText(session),
    priceYen: total,
  };
  await db.prepare(
    `insert into line_booking_requests(
       id, line_user_id, line_display_name, plan, visitor_visit, resident, display_name, people,
       preferred_date, preferred_date_key, preferred_time, session_id, rental,
       summary_text, price_yen, status, created_at, updated_at
     )
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'pending', datetime('now'), datetime('now'))`,
  ).bind(
    request.id,
    request.lineUserId,
    request.lineDisplayName || null,
    request.plan,
    request.visitorVisit,
    request.resident,
    request.displayName,
    request.people,
    request.preferredDate,
    request.preferredDateKey || null,
    request.preferredTime,
    request.sessionId || null,
    request.rental,
    request.summaryText,
    request.priceYen,
  ).run();
  return request;
}

async function notifyLineBookingRequest(env, request) {
  if (!request || !env.DOJO_MAIL_SECRET) return;
  const endpoint = env.DOJO_MAIL_ENDPOINT || DEFAULT_MAIL_ENDPOINT;
  const subject = `LINE仮予約 ${lineBookingPlanLabel(request)} ${request.displayName}`;
  const body = [
    'LINEから初回体験・ビジター仮予約が入りました。',
    '',
    `受付ID: ${request.id}`,
    `LINE名: ${request.lineDisplayName || '未取得'}`,
    `申込名: ${request.displayName}`,
    `内容: ${lineBookingPlanLabel(request)}`,
    `人数: ${request.people}名`,
    `日時: ${request.preferredDate} ${request.preferredTime}`,
    `予約枠ID: ${request.sessionId || '手動確認'}`,
    `料金目安: ${formatJPY(Number(request.priceYen || 0))}`,
    '',
    request.summaryText,
    '',
    '管理画面を開き、承認またはキャンセルをご案内ください。',
    'https://dojo-japan.jp/dj-ops-6271-kuroobi/',
  ].join('\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dojo-mail-secret': env.DOJO_MAIL_SECRET,
      },
      body: JSON.stringify({ subject, body, replyTo: 'dojomail@dojo-japan.jp' }),
    });
    if (!response.ok) console.warn(`DOJO mail notify failed: ${response.status}`);
  } catch (error) {
    console.warn('DOJO mail notify failed:', error?.message || error);
  }
}

function lineBookingPlanLabel(request) {
  if (request.plan === 'trial') return '初回無料体験';
  if (request.visitorVisit === 'repeat') return 'ビジター2回目以降';
  return 'ビジター1回目';
}

async function getLineProfile(env, userId) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId) return {};
  try {
    const response = await fetch(`${LINE_PROFILE_URL}${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (!response.ok) return {};
    return await response.json();
  } catch (_) {
    return {};
  }
}

function lineBookingDb(env) {
  return env.LINE_BOOKINGS_DB || env.RESERVATIONS_DB;
}

function sessionIdFromSelection(session) {
  const dateKey = parseDateKey(session.selectedDateKey);
  const match = /^(\d{2}):00-\d{2}:00$/.exec(String(session.time || ''));
  if (!dateKey || !match) return '';
  return `${dateKey}-${match[1]}`;
}

function visitorBaseLine(session) {
  if (session.visitorVisit === 'repeat') {
    return { label: 'ビジター2回目以降 60分', price: PRICE.visitorRepeat };
  }
  return { label: 'ビジター1回目 60分', price: PRICE.visitorFirst };
}

function rentalLine(rental) {
  if (rental === 'dogi') return { label: `道着レンタル（${formatJPY(PRICE.dogi)} / 人）`, price: PRICE.dogi };
  if (rental === 'wear') return { label: 'スポーツウェア・グローブ等（無料）', price: PRICE.wear };
  if (rental === 'undecided') return { label: '当日確認', price: 0 };
  return { label: '不要', price: 0 };
}

function formatJPY(value) {
  return `¥${value.toLocaleString('ja-JP')}`;
}

async function reply(env, replyToken, messages) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
  }
  const res = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) {
    throw new Error(`LINE reply failed: ${res.status} ${await res.text()}`);
  }
}

export async function onRequestPost({ request, env }) {
  const body = await request.text();
  const ok = await verifySignature(request, body, env.LINE_CHANNEL_SECRET);
  if (!ok) return json({ error: 'invalid signature' }, 401);

  const payload = JSON.parse(body);
  await Promise.all((payload.events || []).map(async (event) => {
    if (!event.replyToken || !event.source?.userId) return;

    const userId = event.source.userId;
    const session = await getSession(env, userId);
    let messages = [];

    if (event.type === 'follow') {
      messages = followMessages(session);
    } else if (event.type === 'message' && event.message?.type === 'text') {
      messages = await handleText(session, event.message.text, env, userId);
    } else if (event.type === 'postback') {
      messages = await handlePostback(session, event, env, userId);
    } else {
      messages = [textMessage('下部のリッチメニューからご希望の項目をお選びください。')];
    }

    await putSession(env, userId, session);
    if (messages.length) await reply(env, event.replyToken, messages);
  }));

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ ok: true, service: 'dojo-japan-line-webhook' });
}
