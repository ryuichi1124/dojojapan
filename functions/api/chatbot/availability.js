const CAPACITY = 6;
const START_HOUR = 7;
const END_HOUR = 18;
const CANDIDATE_DAYS = 45;
const MAX_DATE_CANDIDATES = 30;

export async function onRequestGet({ request, env }) {
  if (!env.RESERVATIONS_DB) return json({ ok: false, error: 'D1_NOT_CONFIGURED' }, 503);

  const url = new URL(request.url);
  const people = normalizePeople(url.searchParams.get('people'));
  const dateKey = normalizeDateKey(url.searchParams.get('date'));

  if (dateKey) {
    const times = await availableTimeCandidates(env, dateKey, people);
    return json({ ok: true, date: dateKey, people, times });
  }

  const dates = await availableDateCandidates(env, people);
  return json({ ok: true, people, dates });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function availableDateCandidates(env, people) {
  const dates = [];
  const start = addDays(jstToday(), 1);
  const end = addDays(start, CANDIDATE_DAYS - 1);
  const [counts, closures] = await Promise.all([
    confirmedCounts(env, toDateKey(start), toDateKey(end)),
    closureMap(env, toDateKey(start), toDateKey(end)),
  ]);

  for (let index = 0; index < CANDIDATE_DAYS && dates.length < MAX_DATE_CANDIDATES; index += 1) {
    const date = addDays(start, index);
    const dateKey = toDateKey(date);
    const hasOpenSlot = hours().some((hour) => {
      const sessionId = `${dateKey}-${pad(hour)}`;
      return !isClosed(sessionId, closures) && remainingFor(counts, sessionId) >= people;
    });
    if (hasOpenSlot) dates.push({ value: dateKey, date: dateKey });
  }
  return dates;
}

async function availableTimeCandidates(env, dateKey, people) {
  const [counts, closures] = await Promise.all([
    confirmedCounts(env, dateKey, dateKey),
    closureMap(env, dateKey, dateKey),
  ]);

  return hours()
    .map((hour) => {
      const sessionId = `${dateKey}-${pad(hour)}`;
      const remaining = remainingFor(counts, sessionId);
      return { hour, remaining, sessionId };
    })
    .filter((slot) => !isClosed(slot.sessionId, closures) && slot.remaining >= people)
    .map((slot) => ({
      value: `${pad(slot.hour)}:00-${pad(slot.hour + 1)}:00`,
      time: `${pad(slot.hour)}:00-${pad(slot.hour + 1)}:00`,
      label: `${pad(slot.hour)}:00-${pad(slot.hour + 1)}:00 ${availabilityLabel(slot.remaining)}`,
      remaining: slot.remaining,
    }));
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

async function closureMap(env, startDateKey, endDateKey) {
  const rows = await env.RESERVATIONS_DB.prepare(
    `select date_key as dateKey, period
     from business_closures
     where date_key between ?1 and ?2`,
  ).bind(startDateKey, endDateKey).all();
  const map = {};
  for (const row of rows.results || []) {
    if (!map[row.dateKey]) map[row.dateKey] = new Set();
    map[row.dateKey].add(row.period);
  }
  return map;
}

function remainingFor(counts, sessionId) {
  return Math.max(0, CAPACITY - Number(counts[sessionId] || 0));
}

function isClosed(sessionId, closures) {
  if (isRecurringSunday(sessionId)) return true;
  if (isRecurringFirstSaturdayMorning(sessionId)) return true;
  const session = parseSession(sessionId);
  const periods = closures[session.dateKey];
  return Boolean(periods && (periods.has('full') || periods.has(closurePeriodForHour(session.hour))));
}

function hours() {
  const result = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) result.push(hour);
  return result;
}

function availabilityLabel(remaining) {
  return Number(remaining) >= 4 ? '◯空きあり' : '▲残りわずか';
}

function parseSession(sessionId) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(sessionId);
  if (!match) return { dateKey: '', hour: 0 };
  return { dateKey: `${match[1]}-${match[2]}-${match[3]}`, hour: Number(match[4]) };
}

function closurePeriodForHour(hour) {
  return Number(hour) < 12 ? 'morning' : 'afternoon';
}

function isRecurringFirstSaturdayMorning(sessionId) {
  const session = parseSession(sessionId);
  if (session.hour >= 12) return false;
  const [year, month, day] = session.dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getDay() === 6 && day <= 7;
}

function isRecurringSunday(sessionId) {
  const session = parseSession(sessionId);
  const [year, month, day] = session.dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).getDay() === 0;
}

function normalizePeople(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(6, Math.max(1, parsed));
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function jstToday() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}
