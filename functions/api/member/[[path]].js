const CAPACITY = 6;
const START_HOUR = 7;
const END_HOUR = 18;
const BOOK_DEADLINE_HOURS = 1;
const PERSONAL_BOOK_DEADLINE_HOURS = 6;
const CHANGE_DEADLINE_HOURS = 3;
const SESSION_DAYS = 90;
const SESSION_COOKIE = 'dojo_member_session';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/member\/?/, '').replace(/\/$/, '') || 'me';

  if (!env.RESERVATIONS_DB) return json({ ok: false, error: 'D1_NOT_CONFIGURED' }, 503);

  try {
    if (request.method === 'POST' && path === 'auth/login') return await login(request, env);
    if (request.method === 'POST' && path === 'auth/logout') return await logout(request, env);

    const member = await authorizeMember(request, env);
    if (!member) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

    if (request.method === 'GET' && path === 'me') return await memberMe(member);
    if (request.method === 'GET' && path === 'reservations') return await memberReservations(member, env);
    if (request.method === 'GET' && path === 'reservations/history') return await memberHistory(request, member, env);
    if (request.method === 'GET' && path === 'availability') return await availability(request, member, env);
    if (request.method === 'POST' && path === 'profile') return await updateProfile(request, member, env);
    if (request.method === 'POST' && path === 'reservations/book') return await book(request, member, env);
    if (request.method === 'POST' && path === 'reservations/cancel') return await cancel(request, member, env);
    if (request.method === 'POST' && path === 'reservations/change') return await change(request, member, env);
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || 'SERVER_ERROR' }, 400);
  }
}

async function login(request, env) {
  const input = await readJson(request);
  const token = normalizeToken(input.token);
  const memberCode = normalizeMemberCode(input.memberCode);
  const pin = normalizeDigits(input.pin, 6);
  if ((!token && !memberCode) || pin.length < 4) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const member = token ? await findMemberByToken(env, token) : await findMemberByCode(env, memberCode);
  if (!member) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if (!(await verifyPin(member, pin))) {
    await recordFailedAuth(env, member);
    return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  }

  await env.RESERVATIONS_DB.prepare(
    "update members set failed_auth_count = 0, auth_locked_until = null, updated_at = datetime('now') where member_code = ?1",
  ).bind(member.memberCode).run();

  const sessionToken = await createMemberSession(env, member, request.headers.get('user-agent') || '');
  return json(
    { ok: true, member: publicMember(member), bookingToken: member.bookingToken },
    200,
    { 'set-cookie': sessionCookie(sessionToken) },
  );
}

async function authorizeMember(request, env) {
  const sessionToken = normalizeToken(request.headers.get('x-member-session-token')) || normalizeToken(cookieValue(request, SESSION_COOKIE));
  if (sessionToken) {
    const member = await findMemberBySessionToken(env, sessionToken);
    if (member) return member;
  }

  const token = normalizeToken(request.headers.get('x-member-token'));
  const pin = normalizeDigits(request.headers.get('x-member-pin'), 6);
  if (!token || pin.length < 4) return null;
  const member = await findMemberByToken(env, token);
  if (!member) return null;
  if (!(await verifyPin(member, pin))) {
    await recordFailedAuth(env, member);
    return null;
  }
  return member;
}

async function logout(request, env) {
  const sessionToken = normalizeToken(request.headers.get('x-member-session-token')) || normalizeToken(cookieValue(request, SESSION_COOKIE));
  if (sessionToken) {
    const sessionHash = await hashToken(sessionToken);
    await env.RESERVATIONS_DB.prepare(
      "update member_sessions set revoked_at = datetime('now') where session_token_hash = ?1 and revoked_at is null",
    ).bind(sessionHash).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

async function createMemberSession(env, member, userAgent) {
  const sessionToken = randomToken(32);
  const sessionHash = await hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.RESERVATIONS_DB.prepare(
    `insert into member_sessions(id, member_code, session_token_hash, expires_at, user_agent)
     values (?1, ?2, ?3, ?4, ?5)`,
  ).bind(crypto.randomUUID(), member.memberCode, sessionHash, expiresAt, userAgent.slice(0, 300)).run();
  return sessionToken;
}

async function findMemberBySessionToken(env, sessionToken) {
  const sessionHash = await hashToken(sessionToken);
  const member = await env.RESERVATIONS_DB.prepare(
    `select m.member_code as memberCode, m.display_name as displayName, m.member_kana as memberKana, m.member_type as memberType,
      m.monthly_quota as monthlyQuota, m.quota_extra as quotaExtra, m.quota_extra_month as quotaExtraMonth,
      m.pause_on as pauseOn, m.active, m.status as memberStatus, m.booking_token as bookingToken,
      m.phone_last4 as phoneLast4, m.birth_mmdd as birthMmdd
     from member_sessions s
     join members m on m.member_code = s.member_code
     where s.session_token_hash = ?1
       and s.revoked_at is null
       and s.expires_at > datetime('now')
       and m.active = 1
       and m.status = 'active'
       and m.token_revoked_at is null`,
  ).bind(sessionHash).first();
  return member && isActiveMember(member) ? member : null;
}

async function findMemberByToken(env, token) {
  const member = await env.RESERVATIONS_DB.prepare(
    `select member_code as memberCode, display_name as displayName, member_kana as memberKana, member_type as memberType,
      monthly_quota as monthlyQuota, quota_extra as quotaExtra, quota_extra_month as quotaExtraMonth,
      pause_on as pauseOn, active, status as memberStatus, booking_token as bookingToken,
      pin_hash as pinHash, pin_salt as pinSalt, phone_last4 as phoneLast4,
      birth_mmdd as birthMmdd, token_revoked_at as tokenRevokedAt,
      auth_locked_until as authLockedUntil, failed_auth_count as failedAuthCount
     from members
     where booking_token = ?1 and active = 1 and status = 'active' and token_revoked_at is null`,
  ).bind(token).first();
  if (!member) return null;
  if (!isActiveMember(member)) return null;
  if (member.authLockedUntil && Date.parse(`${member.authLockedUntil}Z`) > Date.now()) return null;
  return member;
}

async function findMemberByCode(env, memberCode) {
  const member = await env.RESERVATIONS_DB.prepare(
    `select member_code as memberCode, display_name as displayName, member_kana as memberKana, member_type as memberType,
      monthly_quota as monthlyQuota, quota_extra as quotaExtra, quota_extra_month as quotaExtraMonth,
      pause_on as pauseOn, active, status as memberStatus, booking_token as bookingToken,
      pin_hash as pinHash, pin_salt as pinSalt, phone_last4 as phoneLast4,
      birth_mmdd as birthMmdd, token_revoked_at as tokenRevokedAt,
      auth_locked_until as authLockedUntil, failed_auth_count as failedAuthCount
     from members
     where member_code = ?1 and active = 1 and status = 'active' and booking_token is not null and token_revoked_at is null`,
  ).bind(memberCode).first();
  if (!member) return null;
  if (!isActiveMember(member)) return null;
  if (member.authLockedUntil && Date.parse(`${member.authLockedUntil}Z`) > Date.now()) return null;
  return member;
}

async function verifyPin(member, pin) {
  if (!member.pinHash || !member.pinSalt) return false;
  return timingSafeEqual(await hashPin(pin, member.pinSalt), member.pinHash);
}

async function recordFailedAuth(env, member) {
  const failed = Number(member.failedAuthCount || 0) + 1;
  const lockedExpr = failed >= 5 ? ", auth_locked_until = datetime('now', '+15 minutes')" : '';
  await env.RESERVATIONS_DB.prepare(
    `update members set failed_auth_count = ?2${lockedExpr}, updated_at = datetime('now') where member_code = ?1`,
  ).bind(member.memberCode, failed).run();
}

function memberMe(member) {
  return json({ ok: true, member: publicMember(member) });
}

async function memberReservations(member, env) {
  const monthKey = currentJstMonthKey();
  const quotaLimit = effectiveMonthlyQuota(member, monthKey);
  const now = new Date();
  const [rows, monthlyRows] = await Promise.all([
    env.RESERVATIONS_DB.prepare(
      `select r.id as id, r.session_id as sessionId, r.member_code as memberCode, r.display_name as displayName,
        r.member_type as memberType, r.monthly_quota as monthlyQuota, r.status as status, r.created_by as createdBy,
        r.created_at as createdAt, r.cancelled_at as cancelledAt,
        r.reservation_kind as reservationKind, r.capacity_units as capacityUnits, r.price_yen as priceYen,
        r.quota_exempt as quotaExempt, r.quota_exempt_reason as quotaExemptReason,
        r.guest_name as guestName, r.guest_resident as guestResident, r.guest_count as guestCount,
        o.trainer_id as trainerId, o.trainer_label as trainerLabel
       from reservations r
       left join session_trainer_overrides o on o.session_id = r.session_id
       where r.member_code = ?1
         and r.status = 'confirmed'
         and r.session_id >= ?2
       order by r.session_id, r.created_at`,
    ).bind(member.memberCode, `${currentJstDateKey()}-00`).all(),
    env.RESERVATIONS_DB.prepare(
      `select r.id as id, r.session_id as sessionId, r.member_code as memberCode, r.display_name as displayName,
        r.member_type as memberType, r.monthly_quota as monthlyQuota, r.status as status, r.created_by as createdBy,
        r.created_at as createdAt, r.cancelled_at as cancelledAt,
        r.reservation_kind as reservationKind, r.capacity_units as capacityUnits, r.price_yen as priceYen,
        r.quota_exempt as quotaExempt, r.quota_exempt_reason as quotaExemptReason,
        r.guest_name as guestName, r.guest_resident as guestResident, r.guest_count as guestCount,
        o.trainer_id as trainerId, o.trainer_label as trainerLabel
       from reservations r
       left join session_trainer_overrides o on o.session_id = r.session_id
       where r.member_code = ?1
         and r.status = 'confirmed'
         and substr(r.session_id, 1, 7) = ?2
       order by r.session_id, r.created_at`,
    ).bind(member.memberCode, monthKey).all(),
  ]);
  const monthlyReservations = monthlyRows.results || [];
  const used = monthlyReservations.filter((reservation) => !reservation.quotaExempt).length;
  return json({
    ok: true,
    reservations: rows.results || [],
    monthlyReservations,
    monthlySummary: {
      monthKey,
      quotaLimit,
      used,
      past: monthlyReservations.filter((reservation) => {
        const date = sessionDate(reservation.sessionId);
        return date && date < now;
      }).length,
      upcoming: monthlyReservations.filter((reservation) => {
        const date = sessionDate(reservation.sessionId);
        return date && date >= now;
      }).length,
      remaining: quotaLimit === null ? null : Math.max(0, quotaLimit - used),
    },
  });
}

async function memberHistory(request, member, env) {
  const url = new URL(request.url);
  const months = normalizeInteger(url.searchParams.get('months'), 1, 3);
  const monthKey = currentJstMonthKey();
  const fromMonthKey = months > 1 ? addMonthsToMonthKey(monthKey, -(months - 1)) : monthKey;
  const rowLimit = months > 1 ? 180 : 60;
  const rows = await env.RESERVATIONS_DB.prepare(
    `select r.id as id, r.session_id as sessionId, r.member_code as memberCode, r.display_name as displayName,
      r.member_type as memberType, r.monthly_quota as monthlyQuota, r.status as status, r.created_by as createdBy,
      r.created_at as createdAt, r.cancelled_at as cancelledAt,
      r.reservation_kind as reservationKind, r.capacity_units as capacityUnits, r.price_yen as priceYen,
      r.quota_exempt as quotaExempt, r.quota_exempt_reason as quotaExemptReason,
      r.guest_name as guestName, r.guest_resident as guestResident, r.guest_count as guestCount,
      o.trainer_id as trainerId, o.trainer_label as trainerLabel
     from reservations r
     left join session_trainer_overrides o on o.session_id = r.session_id
       where r.member_code = ?1
         and r.status = 'confirmed'
         and r.session_id >= ?2
       and r.session_id <= ?3
     order by r.session_id desc, r.created_at desc
     limit ?4`,
  ).bind(member.memberCode, `${fromMonthKey}-01-00`, currentJstHourKey(), rowLimit).all();

  return json({
    ok: true,
    fromMonthKey,
    monthKey,
    months,
    reservations: rows.results || [],
  });
}

async function updateProfile(request, member, env) {
  const input = await readJson(request);
  const displayName = normalizeName(input.displayName || member.displayName);
  const memberKana = normalizeName(input.memberKana);
  const phoneLast4 = normalizeDigits(input.phoneLast4, 4);
  const birthMmdd = normalizeDigits(input.birthMmdd, 4);
  if (!displayName) throw new Error('INVALID_NAME');
  if (phoneLast4 && phoneLast4.length !== 4) throw new Error('INVALID_PHONE_LAST4');
  if (birthMmdd && birthMmdd.length !== 4) throw new Error('INVALID_BIRTH_MMDD');

  await env.RESERVATIONS_DB.batch([
    env.RESERVATIONS_DB.prepare(
    `update members
     set display_name = ?2, member_kana = ?3, phone_last4 = ?4, birth_mmdd = ?5, updated_at = datetime('now')
     where member_code = ?1 and active = 1 and status = 'active'`,
    ).bind(member.memberCode, displayName, memberKana || null, phoneLast4 || null, birthMmdd || null),
    env.RESERVATIONS_DB.prepare(
      `update reservations
       set display_name = ?2
       where member_code = ?1`,
    ).bind(member.memberCode, displayName),
  ]);

  return json({
    ok: true,
    member: publicMember({
      ...member,
      displayName,
      memberKana: memberKana || null,
      phoneLast4: phoneLast4 || null,
      birthMmdd: birthMmdd || null,
    }),
  });
}

async function availability(request, member, env) {
  const url = new URL(request.url);
  const weekStart = parseDateKey(url.searchParams.get('weekStart')) || startOfWeek(new Date());
  const reservations = await env.RESERVATIONS_DB.prepare(
    `select session_id as sessionId, coalesce(sum(coalesce(capacity_units, 1)), 0) as units
     from reservations
     where status = 'confirmed' and session_id between ?1 and ?2
     group by session_id`,
  ).bind(
    `${toDateKey(weekStart)}-00`,
    `${toDateKey(addDays(weekStart, 6))}-23`,
  ).all();
  const counts = Object.fromEntries((reservations.results || []).map((row) => [row.sessionId, Number(row.units || 0)]));
  const memberReservationsRows = await env.RESERVATIONS_DB.prepare(
    `select session_id as sessionId
     from reservations
     where member_code = ?1 and status = 'confirmed' and session_id between ?2 and ?3`,
  ).bind(member.memberCode, `${toDateKey(weekStart)}-00`, `${toDateKey(addDays(weekStart, 6))}-23`).all();
  const own = new Set((memberReservationsRows.results || []).map((row) => row.sessionId));
  const closures = await env.RESERVATIONS_DB.prepare(
    `select date_key as dateKey, period, reason
     from business_closures
     where date_key between ?1 and ?2`,
  ).bind(toDateKey(weekStart), toDateKey(addDays(weekStart, 6))).all();
  const closureMap = buildClosureMap(closures.results || []);
  const overrides = await env.RESERVATIONS_DB.prepare(
    `select session_id as sessionId, trainer_id as trainerId, trainer_label as trainerLabel
     from session_trainer_overrides
     where session_id between ?1 and ?2`,
  ).bind(
    `${toDateKey(weekStart)}-00`,
    `${toDateKey(addDays(weekStart, 6))}-23`,
  ).all();
  const trainerMap = Object.fromEntries((overrides.results || []).map((row) => [row.sessionId, row]));

  const slots = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(weekStart, dayIndex);
    for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
      const sessionId = `${toDateKey(date)}-${pad(hour)}`;
      const units = counts[sessionId] || 0;
      const remaining = Math.max(0, CAPACITY - units);
      const bookable = isBeforeBookDeadline(sessionId, 'regular');
      const personalBookable = isBeforeBookDeadline(sessionId, 'personal');
      const closure = closureForSlot(date, hour, closureMap);
      const trainer = trainerMap[sessionId] || trainerForHour(hour);
      slots.push({
        sessionId,
        date: toDateKey(date),
        hour,
        trainerId: trainer.trainerId,
        trainerLabel: trainer.trainerLabel,
        remaining,
        closed: Boolean(closure),
        closedReason: closure ? closure.reason : '',
        available: !closure && bookable && remaining > 0 && !own.has(sessionId),
        personalAvailable: !closure && personalBookable && remaining === CAPACITY && !own.has(sessionId),
        ownReservation: own.has(sessionId),
      });
    }
  }
  return json({ ok: true, weekStart: toDateKey(weekStart), slots });
}

function trainerForHour(hour) {
  if (Number(hour) < 12) return { trainerId: 'nariai-satoru', trainerLabel: '担当: SATORU成合' };
  return { trainerId: 'matsushima-izaya', trainerLabel: '担当: 松島勲也' };
}

async function book(request, member, env) {
  const input = await readJson(request);
  const reservation = await createMemberReservation(env, member, String(input.sessionId || ''), '', normalizeReservationKind(input.reservationKind), input);
  await recordEventSafe(env, {
    reservationId: reservation.id,
    memberCode: member.memberCode,
    eventType: 'book',
    toSessionId: reservation.sessionId,
    actorType: 'member_web',
    actorId: member.memberCode,
  });
  return json({ ok: true, reservation });
}

async function cancel(request, member, env) {
  const input = await readJson(request);
  const id = String(input.id || '');
  const reservation = await getOwnConfirmedReservation(env, member, id);
  if (!reservation) throw new Error('RESERVATION_NOT_FOUND');
  if (isSameJstDate(reservation.sessionId)) throw new Error('SAME_DAY_CANCEL_NOT_ALLOWED');
  if (!isBeforeDeadline(reservation.sessionId)) throw new Error('DEADLINE_PASSED');

  const result = await env.RESERVATIONS_DB.prepare(
    "update reservations set status = 'cancelled', cancelled_at = datetime('now') where id = ?1 and member_code = ?2 and status = 'confirmed'",
  ).bind(id, member.memberCode).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('RESERVATION_NOT_FOUND');
  await recordEventSafe(env, {
    reservationId: id,
    memberCode: member.memberCode,
    eventType: 'cancel',
    fromSessionId: reservation.sessionId,
    actorType: 'member_web',
    actorId: member.memberCode,
  });
  return json({ ok: true });
}

async function change(request, member, env) {
  const input = await readJson(request);
  const id = String(input.id || '');
  const toSessionId = String(input.toSessionId || '');
  const current = await getOwnConfirmedReservation(env, member, id);
  if (!current) throw new Error('RESERVATION_NOT_FOUND');
  if (!isBeforeDeadline(current.sessionId)) throw new Error('DEADLINE_PASSED');
  const next = await createMemberReservation(env, member, toSessionId, id, normalizeReservationKind(current.reservationKind));
  const result = await env.RESERVATIONS_DB.prepare(
    "update reservations set status = 'cancelled', cancelled_at = datetime('now') where id = ?1 and member_code = ?2 and status = 'confirmed'",
  ).bind(id, member.memberCode).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('RESERVATION_NOT_FOUND');
  await recordEventSafe(env, {
    reservationId: next.id,
    memberCode: member.memberCode,
    eventType: 'change',
    fromSessionId: current.sessionId,
    toSessionId: next.sessionId,
    actorType: 'member_web',
    actorId: member.memberCode,
  });
  return json({ ok: true, reservation: next });
}

async function createMemberReservation(env, member, sessionId, excludeReservationId = '', reservationKind = 'regular', options = {}) {
  if (member.memberStatus !== 'active') throw new Error('MEMBER_NOT_ACTIVE');
  if (!isValidSessionId(sessionId)) throw new Error('INVALID_SESSION');
  const session = parseSession(sessionId);
  if (session.hour < START_HOUR || session.hour >= END_HOUR) throw new Error('INVALID_SESSION');
  if (await isSessionClosed(env, sessionId)) throw new Error('SESSION_CLOSED');
  const referralGuestNames = normalizeGuestNames(options.guestNames || options.guestName);
  const referralGuestCount = reservationKind === 'referral' ? referralGuestNames.length : 0;
  const capacityUnits = reservationKind === 'personal' ? CAPACITY : reservationKind === 'referral' ? 1 + referralGuestCount : 1;
  const priceYen = reservationKind === 'personal' ? 3000 : null;
  const quotaExempt = reservationKind === 'referral' ? 1 : 0;
  const quotaExemptReason = reservationKind === 'referral' ? 'referral_guest' : null;
  const guestResident = reservationKind === 'referral' ? String(options.guestResident || '').trim() : '';
  if (reservationKind === 'referral') {
    if (referralGuestCount < 1 || referralGuestCount > 2) throw new Error('REFERRAL_GUEST_NAME_REQUIRED');
    if (guestResident !== 'local') throw new Error('REFERRAL_GUEST_MUST_BE_LOCAL');
  }
  if (!isBeforeBookDeadline(sessionId, reservationKind)) {
    throw new Error(reservationKind === 'personal' ? 'PERSONAL_BOOK_DEADLINE_PASSED' : 'BOOK_DEADLINE_PASSED');
  }
  const quotaLimit = effectiveMonthlyQuota(member, session.monthKey);
  if (!quotaExempt && quotaLimit !== null) {
    const used = await monthlyUsage(env, member.memberCode, session.monthKey, excludeReservationId);
    if (used >= quotaLimit) throw new Error('QUOTA_EXCEEDED');
  }
  const duplicate = await env.RESERVATIONS_DB.prepare(
    `select id from reservations
     where session_id = ?1 and member_code = ?2 and status = 'confirmed' and id <> ?3
     limit 1`,
  ).bind(sessionId, member.memberCode, excludeReservationId || '').first();
  if (duplicate) throw new Error('ALREADY_BOOKED');

  const reservation = {
    id: crypto.randomUUID(),
    sessionId,
    memberCode: member.memberCode,
    displayName: member.displayName,
    memberType: member.memberType,
    monthlyQuota: member.monthlyQuota,
    status: 'confirmed',
    createdBy: 'member',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    reservationKind,
    capacityUnits,
    priceYen,
    quotaExempt,
    quotaExemptReason,
    guestName: referralGuestNames.join('、'),
    guestResident,
    guestCount: referralGuestCount,
  };
  const result = await env.RESERVATIONS_DB.prepare(
    `insert into reservations(id, session_id, member_code, display_name, member_type, monthly_quota, status, created_by, created_at, reservation_kind, capacity_units, price_yen, quota_exempt, quota_exempt_reason, guest_name, guest_resident, guest_count)
     select ?1, ?2, ?3, ?4, ?5, ?6, 'confirmed', 'member', datetime('now'), ?7, ?8, ?9, ?16, ?17, ?18, ?19, ?20
     where (
       select coalesce(sum(coalesce(capacity_units, 1)), 0)
       from reservations
       where session_id = ?2 and status = 'confirmed' and id <> ?10
     ) + ?8 <= ?11
     and not exists (
       select 1 from business_closures
       where date_key = ?12 and (period = 'full' or period = ?13)
     )
     and (
       ?16 = 1
       or ?14 is null
       or (
         select count(*)
         from reservations
         where member_code = ?3
           and status = 'confirmed'
           and substr(session_id, 1, 7) = ?15
           and id <> ?10
           and coalesce(quota_exempt, 0) = 0
      ) + 1 <= ?14
     )`,
  ).bind(
    reservation.id,
    reservation.sessionId,
    reservation.memberCode,
    reservation.displayName,
    reservation.memberType,
    reservation.monthlyQuota,
    reservation.reservationKind,
    reservation.capacityUnits,
    reservation.priceYen,
    excludeReservationId || '',
    CAPACITY,
    session.dateKey,
    session.hour < 12 ? 'morning' : 'afternoon',
    quotaLimit,
    session.monthKey,
    reservation.quotaExempt || 0,
    reservation.quotaExemptReason || null,
    reservation.guestName || null,
    reservation.guestResident || null,
    reservation.guestCount || null,
  ).run();
  if (Number(result?.meta?.changes || 0) !== 1) {
    if (await isSessionClosed(env, sessionId)) throw new Error('SESSION_CLOSED');
    throw new Error('SESSION_FULL');
  }
  return reservation;
}

async function getOwnConfirmedReservation(env, member, id) {
  if (!id) return null;
  return env.RESERVATIONS_DB.prepare(
    `select id, session_id as sessionId, reservation_kind as reservationKind, capacity_units as capacityUnits
     from reservations
     where id = ?1 and member_code = ?2 and status = 'confirmed'
     limit 1`,
  ).bind(id, member.memberCode).first();
}

async function monthlyUsage(env, memberCode, monthKey, excludeReservationId = '') {
  const row = await env.RESERVATIONS_DB.prepare(
    `select count(*) as count
     from reservations
     where member_code = ?1 and status = 'confirmed'
       and substr(session_id, 1, 7) = ?2 and id <> ?3
       and coalesce(quota_exempt, 0) = 0`,
  ).bind(memberCode, monthKey, excludeReservationId || '').first();
  return Number(row?.count || 0);
}

async function recordEvent(env, event) {
  await env.RESERVATIONS_DB.prepare(
    `insert into reservation_events(id, reservation_id, member_code, event_type, from_session_id, to_session_id, actor_type, actor_id, note)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  ).bind(
    crypto.randomUUID(),
    event.reservationId || null,
    event.memberCode || null,
    event.eventType,
    event.fromSessionId || null,
    event.toSessionId || null,
    event.actorType,
    event.actorId || null,
    event.note || null,
  ).run();
}

async function recordEventSafe(env, event) {
  try {
    await recordEvent(env, event);
  } catch (_) {
    // Event logging is audit-only; never turn a completed reservation into a user-facing failure.
  }
}

function publicMember(member) {
  return {
    memberCode: member.memberCode,
    displayName: member.displayName,
    memberKana: member.memberKana || '',
    memberType: member.memberType,
    monthlyQuota: member.monthlyQuota,
    quotaExtra: normalizeInteger(member.quotaExtra, 0, 99),
    quotaExtraMonth: normalizeMonthKey(member.quotaExtraMonth),
    phoneLast4: member.phoneLast4 || '',
    birthMmdd: member.birthMmdd || '',
  };
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeGuestNames(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeName).filter(Boolean).slice(0, 2);
}

function normalizeReservationKind(value) {
  const kind = String(value || 'regular');
  return ['regular', 'personal', 'referral'].includes(kind) ? kind : 'regular';
}

function effectiveMonthlyQuota(member, monthKey = currentJstMonthKey()) {
  if (member.monthlyQuota === null || member.monthlyQuota === undefined) return null;
  const extra = normalizeMonthKey(member.quotaExtraMonth) === monthKey ? normalizeInteger(member.quotaExtra, 0, 99) : 0;
  return Number(member.monthlyQuota || 0) + extra;
}

function isActiveMember(member) {
  if (!member || member.memberStatus !== 'active') return false;
  return !normalizeDateKey(member.pauseOn) || normalizeDateKey(member.pauseOn) > currentJstDateKey();
}

function isBeforeDeadline(sessionId) {
  const date = sessionDate(sessionId);
  if (!date) return false;
  return date.getTime() - Date.now() >= CHANGE_DEADLINE_HOURS * 60 * 60 * 1000;
}

function isBeforeBookDeadline(sessionId, reservationKind = 'regular') {
  const date = sessionDate(sessionId);
  const hours = reservationKind === 'personal' ? PERSONAL_BOOK_DEADLINE_HOURS : BOOK_DEADLINE_HOURS;
  return Boolean(date && date.getTime() - Date.now() >= hours * 60 * 60 * 1000);
}

function isSameJstDate(sessionId) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-\d{2}$/.exec(sessionId);
  return Boolean(match && `${match[1]}-${match[2]}-${match[3]}` === currentJstDateKey());
}

function sessionDate(sessionId) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(sessionId);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]) - 9));
}

function parseSession(sessionId) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(sessionId);
  if (!match) throw new Error('INVALID_SESSION');
  return { dateKey: `${match[1]}-${match[2]}-${match[3]}`, monthKey: `${match[1]}-${match[2]}`, hour: Number(match[4]) };
}

function isValidSessionId(sessionId) {
  return /^\d{4}-\d{2}-\d{2}-\d{2}$/.test(sessionId);
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function buildClosureMap(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.dateKey)) map.set(row.dateKey, []);
    map.get(row.dateKey).push(row);
  }
  return map;
}

function closureForSlot(date, hour, closureMap) {
  if (date.getDay() === 0) {
    return { reason: '毎週日曜は予約不可' };
  }
  if (isFirstSaturdayMorning(date, hour)) {
    return { reason: '第一土曜午前は予約不可' };
  }
  const dateKey = toDateKey(date);
  const period = hour < 12 ? 'morning' : 'afternoon';
  const closures = closureMap.get(dateKey) || [];
  return closures.find((closure) => closure.period === 'full' || closure.period === period) || null;
}

async function isSessionClosed(env, sessionId) {
  const session = parseSession(sessionId);
  const [year, month, day] = session.dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getDay() === 0) return true;
  if (isFirstSaturdayMorning(date, session.hour)) return true;
  const row = await env.RESERVATIONS_DB.prepare(
    `select id from business_closures
     where date_key = ?1 and (period = 'full' or period = ?2)
     limit 1`,
  ).bind(session.dateKey, session.hour < 12 ? 'morning' : 'afternoon').first();
  return Boolean(row);
}

function isFirstSaturdayMorning(date, hour) {
  return hour < 12 && date.getDay() === 6 && date.getDate() <= 7;
}

function normalizeToken(value) {
  return String(value || '').trim().slice(0, 128);
}

function normalizeMemberCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 24);
}

function normalizeDigits(value, maxLength) {
  return String(value || '').replace(/[^\d]/g, '').slice(0, maxLength);
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeMonthKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : '';
}

function normalizeInteger(value, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const prefix = `${name}=`;
  for (const part of cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return '';
}

function sessionCookie(sessionToken) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function currentJstDateKey() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

function currentJstMonthKey() {
  return currentJstDateKey().slice(0, 7);
}

function addMonthsToMonthKey(monthKey, diff) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) return currentJstMonthKey();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + diff, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentJstHourKey() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}-${String(jst.getUTCHours()).padStart(2, '0')}`;
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    throw new Error('INVALID_JSON');
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      'pragma': 'no-cache',
      ...headers,
    },
  });
}
