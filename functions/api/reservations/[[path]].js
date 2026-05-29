const CAPACITY = 6;
const START_HOUR = 7;
const END_HOUR = 18;

const TYPE_QUOTA = {
  prime: null,
  semi8: 8,
  semi4: 4,
  semi2: 2,
};

const MEMBER_STATUSES = new Set(['active', 'paused']);
const RESERVATION_KIND = new Set(['regular', 'personal', 'referral']);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/reservations\/?/, '').replace(/\/$/, '') || 'bootstrap';

  const auth = authorize(request, env);
  if (!auth.ok) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  if (!env.RESERVATIONS_DB) {
    return json({ ok: false, error: 'D1_NOT_CONFIGURED' }, 503);
  }

  try {
    if (request.method === 'GET' && path === 'bootstrap') return await bootstrap(env);
    if (request.method === 'GET' && path === 'member-history') return await memberHistory(url, env);
    if (request.method === 'POST' && path === 'member') return await upsertMember(request, env);
    if (request.method === 'POST' && path === 'member-status') return await updateMemberStatus(request, env);
    if (request.method === 'POST' && path === 'member-delete') return await deleteMember(request, env);
    if (request.method === 'POST' && path === 'member-access') return await saveMemberAccess(request, env);
    if (request.method === 'POST' && path === 'member-pin-reset') return await resetMemberPin(request, env);
    if (request.method === 'POST' && path === 'book') return await bookReservation(request, env);
    if (request.method === 'POST' && path === 'cancel') return await cancelReservation(request, env);
    if (request.method === 'POST' && path === 'line-booking-approve') return await approveLineBookingRequest(request, env);
    if (request.method === 'POST' && path === 'line-booking-cancel') return await cancelLineBookingRequest(request, env);
    if (request.method === 'POST' && path === 'memo') return await saveMemo(request, env);
    if (request.method === 'POST' && path === 'business-closure') return await saveBusinessClosure(request, env);
    if (request.method === 'POST' && path === 'business-closure-delete') return await deleteBusinessClosure(request, env);
    if (request.method === 'POST' && path === 'trainer-override') return await saveTrainerOverride(request, env);
    if (request.method === 'POST' && path === 'trainer-override-delete') return await deleteTrainerOverride(request, env);
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message || 'SERVER_ERROR' }, 400);
  }
}

async function memberHistory(url, env) {
  const memberCode = normalizeMemberCode(url.searchParams.get('memberCode'));
  const months = normalizeInteger(url.searchParams.get('months'), 1, 3);
  const monthKey = normalizeMonthKey(url.searchParams.get('month')) || currentJstMonthKey();
  const fromMonthKey = months > 1 ? addMonthsToMonthKey(monthKey, -(months - 1)) : monthKey;
  const rowLimit = months > 1 ? 180 : 60;
  if (!memberCode) throw new Error('INVALID_MEMBER');

  const [member, rows] = await Promise.all([
    env.RESERVATIONS_DB.prepare(
      `select member_code as memberCode, display_name as displayName, member_kana as memberKana, member_type as memberType,
       monthly_quota as monthlyQuota, quota_extra as quotaExtra, quota_extra_month as quotaExtraMonth,
       active, status as memberStatus
       from members where member_code = ?1 and active = 1`,
    ).bind(memberCode).first(),
    env.RESERVATIONS_DB.prepare(
      `select id, session_id as sessionId, member_code as memberCode, display_name as displayName,
       member_type as memberType, monthly_quota as monthlyQuota, status, created_by as createdBy,
       created_at as createdAt, cancelled_at as cancelledAt,
       reservation_kind as reservationKind, capacity_units as capacityUnits, price_yen as priceYen,
       quota_exempt as quotaExempt, quota_exempt_reason as quotaExemptReason,
       guest_name as guestName, guest_resident as guestResident, guest_count as guestCount
       from reservations
       where member_code = ?1
         and status = 'confirmed'
         and session_id >= ?2
         and session_id <= ?3
       order by session_id desc, created_at desc
       limit ?4`,
    ).bind(memberCode, `${fromMonthKey}-01-00`, currentJstHourKey(), rowLimit).all(),
  ]);
  if (!member) throw new Error('MEMBER_NOT_FOUND');

  return json({
    ok: true,
    member: normalizeMemberRow(member),
    monthKey,
    fromMonthKey,
    months,
    reservations: rows.results || [],
    summary: {
      used: (rows.results || []).filter((row) => !row.quotaExempt).length,
      quotaLimit: effectiveMonthlyQuota(member, monthKey),
    },
  });
}

function authorize(request, env) {
  if (!env.RESERVATION_ADMIN_USER || !env.RESERVATION_ADMIN_PASSWORD) return { ok: false };

  const credentials = getCredentials(request);
  return {
    ok: Boolean(
      credentials &&
        credentials.username === env.RESERVATION_ADMIN_USER &&
        credentials.password === env.RESERVATION_ADMIN_PASSWORD,
    ),
  };
}

function getCredentials(request) {
  const headerCredentials = {
    username: request.headers.get('x-admin-user') || '',
    password: request.headers.get('x-admin-password') || '',
  };
  if (headerCredentials.username || headerCredentials.password) return headerCredentials;
  return parseBasicAuth(request.headers.get('authorization') || '');
}

function parseBasicAuth(value) {
  const match = /^Basic\s+(.+)$/i.exec(value);
  if (!match) return null;

  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch (_) {
    return null;
  }
}

async function bootstrap(env) {
  const [members, reservations, lineBookingRequests, memos, ngPairs, businessClosures, trainerOverrides, activeSessions] = await Promise.all([
    env.RESERVATIONS_DB.prepare(
      `select member_code as memberCode, display_name as displayName, member_kana as memberKana, member_type as memberType,
       monthly_quota as monthlyQuota, quota_extra as quotaExtra, quota_extra_month as quotaExtraMonth,
       active, status as memberStatus, booking_token as bookingToken,
       phone_last4 as phoneLast4, birth_mmdd as birthMmdd, pause_on as pauseOn, token_revoked_at as tokenRevokedAt,
       pin_updated_at as pinUpdatedAt
       from members order by member_code`,
    ).all(),
    env.RESERVATIONS_DB.prepare(
      `select id, session_id as sessionId, member_code as memberCode, display_name as displayName,
       member_type as memberType, monthly_quota as monthlyQuota, status, created_by as createdBy,
       created_at as createdAt, cancelled_at as cancelledAt,
       reservation_kind as reservationKind, capacity_units as capacityUnits, price_yen as priceYen,
       quota_exempt as quotaExempt, quota_exempt_reason as quotaExemptReason,
       guest_name as guestName, guest_resident as guestResident, guest_count as guestCount
       from reservations
       where status = 'confirmed' and session_id >= ?1
       order by session_id, created_at`,
    ).bind(`${currentJstMonthKey()}-01-00`).all(),
    listPendingLineBookingRequests(env),
    env.RESERVATIONS_DB.prepare(
      'select session_id as sessionId, memo from session_memos',
    ).all(),
    env.RESERVATIONS_DB.prepare(
      'select member_code as memberCode, ng_member_code as ngMemberCode, note from member_ng_pairs order by member_code, ng_member_code',
    ).all(),
    env.RESERVATIONS_DB.prepare(
      'select id, date_key as dateKey, period, reason, created_at as createdAt, updated_at as updatedAt from business_closures order by date_key desc, created_at desc',
    ).all(),
    env.RESERVATIONS_DB.prepare(
      'select session_id as sessionId, trainer_id as trainerId, trainer_label as trainerLabel, updated_at as updatedAt from session_trainer_overrides',
    ).all(),
    env.RESERVATIONS_DB.prepare(
      `select member_code as memberCode, count(*) as activeSessionCount, max(created_at) as lastAuthenticatedAt
       from member_sessions
       where revoked_at is null and expires_at > datetime('now')
       group by member_code`,
    ).all(),
  ]);
  const ngByMember = new Map();
  for (const pair of ngPairs.results || []) {
    if (!ngByMember.has(pair.memberCode)) ngByMember.set(pair.memberCode, []);
    ngByMember.get(pair.memberCode).push(pair.ngMemberCode);
  }
  const sessionByMember = new Map();
  for (const session of activeSessions.results || []) {
    sessionByMember.set(session.memberCode, session);
  }

  return json({
    ok: true,
    members: members.results.map((member) => normalizeMemberRow({
      ...member,
      ngMemberCodes: ngByMember.get(member.memberCode) || [],
      activeSessionCount: Number(sessionByMember.get(member.memberCode)?.activeSessionCount || 0),
      lastAuthenticatedAt: sessionByMember.get(member.memberCode)?.lastAuthenticatedAt || null,
    })),
    reservations: reservations.results,
    lineBookingRequests,
    sessionMemos: Object.fromEntries(memos.results.map((row) => [row.sessionId, row.memo])),
    ngPairs: ngPairs.results || [],
    businessClosures: businessClosures.results || [],
    trainerOverrides: trainerOverrides.results || [],
  });
}

async function upsertMember(request, env) {
  const input = await readJson(request);
  const memberCode = normalizeMemberCode(input.memberCode);
  const displayName = normalizeName(input.displayName);
  const memberKana = normalizeName(input.memberKana);
  const memberType = String(input.memberType || '');
  const memberStatus = normalizeMemberStatus(input.memberStatus || input.status || 'active');
  const quotaExtra = normalizeInteger(input.quotaExtra, 0, 99);
  const quotaExtraMonth = quotaExtra > 0 ? normalizeMonthKey(input.quotaExtraMonth) || currentJstMonthKey() : null;
  const phoneLast4 = normalizeDigits(input.phoneLast4, 4);
  const birthMmdd = normalizeDigits(input.birthMmdd, 4);
  const pauseOn = normalizeDateKey(input.pauseOn);
  const ngMemberCodes = normalizeMemberCodeList(input.ngMemberCodes).filter((code) => code !== memberCode);
  if (!memberCode || !displayName || !(memberType in TYPE_QUOTA) || !memberStatus) throw new Error('INVALID_MEMBER');

  const monthlyQuota = TYPE_QUOTA[memberType];
  const statements = [
    env.RESERVATIONS_DB.prepare(
      `insert into members(member_code, display_name, member_kana, member_type, monthly_quota, quota_extra, quota_extra_month, active, status, phone_last4, birth_mmdd, pause_on, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10, ?11, datetime('now'))
       on conflict(member_code) do update set
         display_name = excluded.display_name,
         member_kana = excluded.member_kana,
         member_type = excluded.member_type,
         monthly_quota = excluded.monthly_quota,
         quota_extra = excluded.quota_extra,
         quota_extra_month = excluded.quota_extra_month,
         status = excluded.status,
         phone_last4 = excluded.phone_last4,
         birth_mmdd = excluded.birth_mmdd,
         pause_on = excluded.pause_on,
         active = 1,
         updated_at = datetime('now')`,
    ).bind(memberCode, displayName, memberKana || null, memberType, monthlyQuota, quotaExtra, quotaExtraMonth, memberStatus, phoneLast4 || null, birthMmdd || null, pauseOn || null),
    env.RESERVATIONS_DB.prepare(
      `update reservations
       set display_name = ?2, member_type = ?3, monthly_quota = ?4
       where member_code = ?1`,
    ).bind(memberCode, displayName, memberType, monthlyQuota),
    env.RESERVATIONS_DB.prepare(
      'delete from member_ng_pairs where member_code = ?1',
    ).bind(memberCode),
  ];
  for (const ngMemberCode of ngMemberCodes) {
    statements.push(
      env.RESERVATIONS_DB.prepare(
        `insert or ignore into member_ng_pairs(member_code, ng_member_code)
         select ?1, ?2
         where exists (select 1 from members where member_code = ?2 and active = 1)`,
      ).bind(memberCode, ngMemberCode),
    );
  }
  await env.RESERVATIONS_DB.batch(statements);

  return json({ ok: true });
}

async function updateMemberStatus(request, env) {
  const input = await readJson(request);
  const memberCode = normalizeMemberCode(input.memberCode);
  const memberStatus = normalizeMemberStatus(input.memberStatus || input.status);
  if (!memberCode || !memberStatus) throw new Error('INVALID_MEMBER');

  const result = await env.RESERVATIONS_DB.prepare(
    `update members
     set status = ?2, active = 1, pause_on = case when ?2 = 'active' then null else pause_on end, updated_at = datetime('now')
     where member_code = ?1 and active = 1`,
  ).bind(memberCode, memberStatus).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('MEMBER_NOT_FOUND');

  return json({ ok: true, memberCode, memberStatus, active: true });
}

async function deleteMember(request, env) {
  const input = await readJson(request);
  const memberCode = normalizeMemberCode(input.memberCode);
  if (!memberCode) throw new Error('INVALID_MEMBER');

  const result = await env.RESERVATIONS_DB.prepare(
    `update members
     set active = 0, status = 'deleted', token_revoked_at = datetime('now'),
       auth_locked_until = null, updated_at = datetime('now')
     where member_code = ?1 and active = 1`,
  ).bind(memberCode).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('MEMBER_NOT_FOUND');
  await revokeMemberSessions(env, memberCode);

  return json({ ok: true, memberCode, memberStatus: 'deleted', active: false });
}

async function saveMemberAccess(request, env) {
  const input = await readJson(request);
  const memberCode = normalizeMemberCode(input.memberCode);
  const phoneLast4 = normalizeDigits(input.phoneLast4, 4);
  const birthMmdd = normalizeDigits(input.birthMmdd, 4);
  if (!memberCode) throw new Error('INVALID_MEMBER');

  const member = await env.RESERVATIONS_DB.prepare(
    "select member_code as memberCode, booking_token as bookingToken from members where member_code = ?1 and active = 1 and status = 'active'",
  ).bind(memberCode).first();
  if (!member) throw new Error('MEMBER_NOT_FOUND');

  const bookingToken = input.regenerateToken || !member.bookingToken ? randomToken() : member.bookingToken;
  await env.RESERVATIONS_DB.prepare(
    `update members
     set booking_token = ?2, phone_last4 = ?3, birth_mmdd = ?4,
       token_revoked_at = null, updated_at = datetime('now')
     where member_code = ?1`,
  ).bind(memberCode, bookingToken, phoneLast4 || null, birthMmdd || null).run();

  return json({ ok: true, memberCode, bookingToken, phoneLast4, birthMmdd });
}

async function resetMemberPin(request, env) {
  const input = await readJson(request);
  const memberCode = normalizeMemberCode(input.memberCode);
  const pin = normalizeDigits(input.pin, 6);
  if (!memberCode || pin.length < 4) throw new Error('INVALID_PIN');

  const member = await env.RESERVATIONS_DB.prepare(
    "select member_code as memberCode, booking_token as bookingToken from members where member_code = ?1 and active = 1 and status = 'active'",
  ).bind(memberCode).first();
  if (!member) throw new Error('MEMBER_NOT_FOUND');

  const salt = randomToken(16);
  const pinHash = await hashPin(pin, salt);
  const bookingToken = member.bookingToken || randomToken();
  await env.RESERVATIONS_DB.prepare(
    `update members
     set booking_token = ?2, pin_hash = ?3, pin_salt = ?4, pin_updated_at = datetime('now'),
       failed_auth_count = 0, auth_locked_until = null, token_revoked_at = null, updated_at = datetime('now')
     where member_code = ?1`,
  ).bind(memberCode, bookingToken, pinHash, salt).run();
  await revokeMemberSessions(env, memberCode);

  return json({ ok: true, memberCode, bookingToken });
}

async function revokeMemberSessions(env, memberCode) {
  await env.RESERVATIONS_DB.prepare(
    "update member_sessions set revoked_at = datetime('now') where member_code = ?1 and revoked_at is null",
  ).bind(memberCode).run();
}

async function bookReservation(request, env) {
  const input = await readJson(request);
  const sessionId = String(input.sessionId || '');
  if (!isValidSessionId(sessionId)) throw new Error('INVALID_SESSION');
  const session = parseSession(sessionId);
  if (session.hour < START_HOUR || session.hour >= END_HOUR) throw new Error('INVALID_SESSION');
  if (await isSessionClosed(env, sessionId)) throw new Error('SESSION_CLOSED');
  const reservationKind = normalizeReservationKind(input.reservationKind);
  const referralGuestNames = normalizeGuestNames(input.guestNames || input.guestName);
  const referralGuestCount = reservationKind === 'referral' ? referralGuestNames.length : 0;
  const capacityUnits = reservationKind === 'personal' ? CAPACITY : reservationKind === 'referral' ? 1 + referralGuestCount : 1;
  const priceYen = reservationKind === 'personal' ? 3000 : null;
  const quotaExempt = reservationKind === 'referral' ? 1 : 0;
  const quotaExemptReason = reservationKind === 'referral' ? 'referral_guest' : null;
  const guestResident = reservationKind === 'referral' ? String(input.guestResident || '').trim() : '';
  if (reservationKind === 'referral') {
    if (referralGuestCount < 1 || referralGuestCount > 2) throw new Error('REFERRAL_GUEST_NAME_REQUIRED');
    if (guestResident !== 'local') throw new Error('REFERRAL_GUEST_MUST_BE_LOCAL');
  }
  let quotaLimit = null;
  let bookingMemberCode = null;

  let reservation;

  if (input.memberCode) {
    const memberCode = normalizeMemberCode(input.memberCode);
    bookingMemberCode = memberCode;
    const member = await env.RESERVATIONS_DB.prepare(
      'select member_code as memberCode, display_name as displayName, member_type as memberType, monthly_quota as monthlyQuota, quota_extra as quotaExtra, quota_extra_month as quotaExtraMonth, pause_on as pauseOn, active, status as memberStatus from members where member_code = ?1',
    ).bind(memberCode).first();
    if (!member || !member.active) throw new Error('MEMBER_NOT_FOUND');
    if (effectiveMemberStatus(member) !== 'active') throw new Error('MEMBER_NOT_ACTIVE');
    if (session.hour >= 18 && member.memberType !== 'prime') throw new Error('PRIME_ONLY');
    quotaLimit = effectiveMonthlyQuota(member, session.monthKey);
    if (!quotaExempt && quotaLimit !== null) {
      const used = await monthlyUsage(env, memberCode, session.monthKey);
      if (used >= quotaLimit) throw new Error('QUOTA_EXCEEDED');
    }
    const duplicate = await env.RESERVATIONS_DB.prepare(
      "select id from reservations where session_id = ?1 and member_code = ?2 and status = 'confirmed' limit 1",
    ).bind(sessionId, memberCode).first();
    if (duplicate) throw new Error('ALREADY_BOOKED');

    reservation = {
      id: crypto.randomUUID(),
      sessionId,
      memberCode,
      displayName: member.displayName,
      memberType: member.memberType,
      monthlyQuota: member.monthlyQuota,
      status: 'confirmed',
      createdBy: 'staff',
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
  } else {
    if (reservationKind === 'personal' || reservationKind === 'referral') throw new Error('MEMBER_REQUIRED');
    const displayName = normalizeName(input.displayName);
    if (!displayName) throw new Error('INVALID_NAME');
    reservation = {
      id: crypto.randomUUID(),
      sessionId,
      memberCode: 'MANUAL',
      displayName,
      memberType: 'manual',
      monthlyQuota: null,
      status: 'confirmed',
      createdBy: 'staff',
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      reservationKind: 'regular',
      capacityUnits: 1,
      priceYen: null,
    };
  }

  const result = await env.RESERVATIONS_DB.prepare(
      `insert into reservations(id, session_id, member_code, display_name, member_type, monthly_quota, status, created_by, created_at, reservation_kind, capacity_units, price_yen, quota_exempt, quota_exempt_reason, guest_name, guest_resident, guest_count)
     select ?1, ?2, ?3, ?4, ?5, ?6, 'confirmed', 'staff', datetime('now'), ?7, ?8, ?9, ?16, ?17, ?18, ?19, ?20
     where (
       select coalesce(sum(coalesce(capacity_units, 1)), 0)
       from reservations
       where session_id = ?2 and status = 'confirmed'
     ) + ?8 <= ?10
     and not exists (
       select 1 from business_closures
       where date_key = ?11 and (period = 'full' or period = ?12)
     )
     and (
       ?16 = 1
       or ?13 is null
       or ?14 is null
       or (
         select count(*)
         from reservations
         where member_code = ?14
           and status = 'confirmed'
           and substr(session_id, 1, 7) = ?15
           and coalesce(quota_exempt, 0) = 0
       ) + 1 <= ?13
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
    CAPACITY,
    session.dateKey,
    closurePeriodForHour(session.hour),
    quotaLimit,
    bookingMemberCode,
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

  return json({ ok: true, reservation });
}

async function cancelReservation(request, env) {
  const input = await readJson(request);
  const id = String(input.id || '');
  if (!id) throw new Error('INVALID_RESERVATION');
  const reservation = await env.RESERVATIONS_DB.prepare(
    "select id, session_id as sessionId from reservations where id = ?1 and status = 'confirmed'",
  ).bind(id).first();
  if (!reservation) throw new Error('RESERVATION_NOT_FOUND');

  const isPastSession = reservation.sessionId <= currentJstHourKey();
  if (isPastSession) {
    await env.RESERVATIONS_DB.prepare(
      "delete from reservations where id = ?1 and status = 'confirmed'",
    ).bind(id).run();
    return json({ ok: true, deleted: true });
  }

  await env.RESERVATIONS_DB.prepare(
    "update reservations set status = 'cancelled', cancelled_at = datetime('now') where id = ?1 and status = 'confirmed'",
  ).bind(id).run();
  return json({ ok: true, deleted: false });
}

async function listPendingLineBookingRequests(env) {
  const db = lineBookingDb(env);
  const rows = await db.prepare(
    `select id, line_user_id as lineUserId, line_display_name as lineDisplayName, plan, visitor_visit as visitorVisit, resident,
       display_name as displayName, people, preferred_date as preferredDate,
       preferred_date_key as preferredDateKey, preferred_time as preferredTime,
       session_id as sessionId, rental, summary_text as summaryText, price_yen as priceYen,
       status, reservation_id as reservationId, staff_note as staffNote,
       created_at as createdAt, updated_at as updatedAt, approved_at as approvedAt, cancelled_at as cancelledAt
     from line_booking_requests
     where status = 'pending'
     order by created_at desc
     limit 50`,
  ).all();
  return rows.results || [];
}

async function approveLineBookingRequest(request, env) {
  const input = await readJson(request);
  const id = normalizeRequestId(input.id);
  if (!id) throw new Error('INVALID_LINE_BOOKING');

  const lineRequest = await getLineBookingRequest(env, id);
  if (!lineRequest || lineRequest.status !== 'pending') throw new Error('LINE_BOOKING_NOT_FOUND');
  if (!isValidSessionId(lineRequest.sessionId || '')) throw new Error('LINE_BOOKING_NEEDS_MANUAL_CONFIRM');

  const session = parseSession(lineRequest.sessionId);
  if (session.hour < START_HOUR || session.hour >= END_HOUR) throw new Error('INVALID_SESSION');
  if (await isSessionClosed(env, lineRequest.sessionId)) throw new Error('SESSION_CLOSED');

  const capacityUnits = Math.min(CAPACITY, Math.max(1, Number(lineRequest.people || 1)));
  const reservation = {
    id: crypto.randomUUID(),
    sessionId: lineRequest.sessionId,
    memberCode: 'MANUAL',
    displayName: lineBookingReservationName(lineRequest),
    memberType: 'manual',
    monthlyQuota: null,
    status: 'confirmed',
    createdBy: 'staff',
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    reservationKind: 'regular',
    capacityUnits,
    priceYen: Number(lineRequest.priceYen || 0) || null,
  };

  let result;
  try {
    result = await env.RESERVATIONS_DB.prepare(
      `insert into reservations(id, session_id, member_code, display_name, member_type, monthly_quota, status, created_by, created_at, reservation_kind, capacity_units, price_yen, line_booking_request_id)
     select ?1, ?2, ?3, ?4, ?5, null, 'confirmed', 'staff', datetime('now'), 'regular', ?6, ?7, ?11
     where (
       select coalesce(sum(coalesce(capacity_units, 1)), 0)
       from reservations
       where session_id = ?2 and status = 'confirmed'
     ) + ?6 <= ?8
     and not exists (
       select 1 from business_closures
       where date_key = ?9 and (period = 'full' or period = ?10)
     )`,
    ).bind(
      reservation.id,
      reservation.sessionId,
      reservation.memberCode,
      reservation.displayName,
      reservation.memberType,
      reservation.capacityUnits,
      reservation.priceYen,
      CAPACITY,
      session.dateKey,
      closurePeriodForHour(session.hour),
      id,
    ).run();
  } catch (error) {
    if (/unique|constraint/i.test(error?.message || '')) throw new Error('LINE_BOOKING_ALREADY_APPROVED');
    throw error;
  }

  if (Number(result?.meta?.changes || 0) !== 1) {
    if (await isSessionClosed(env, lineRequest.sessionId)) throw new Error('SESSION_CLOSED');
    throw new Error('SESSION_FULL');
  }

  await lineBookingDb(env).prepare(
    `update line_booking_requests
     set status = 'approved', reservation_id = ?2, approved_at = datetime('now'), updated_at = datetime('now')
     where id = ?1 and status = 'pending'`,
  ).bind(id, reservation.id).run();

  return json({
    ok: true,
    request: { ...lineRequest, status: 'approved', reservationId: reservation.id },
    reservation,
    lineMessage: lineBookingStatusMessage(lineRequest, 'approved'),
  });
}

async function cancelLineBookingRequest(request, env) {
  const input = await readJson(request);
  const id = normalizeRequestId(input.id);
  const staffNote = normalizeName(input.staffNote || input.note).slice(0, 200);
  if (!id) throw new Error('INVALID_LINE_BOOKING');

  const lineRequest = await getLineBookingRequest(env, id);
  if (!lineRequest || lineRequest.status !== 'pending') throw new Error('LINE_BOOKING_NOT_FOUND');

  await lineBookingDb(env).prepare(
    `update line_booking_requests
     set status = 'cancelled', staff_note = ?2, cancelled_at = datetime('now'), updated_at = datetime('now')
     where id = ?1 and status = 'pending'`,
  ).bind(id, staffNote || null).run();

  return json({
    ok: true,
    request: { ...lineRequest, status: 'cancelled', staffNote },
    lineMessage: lineBookingStatusMessage(lineRequest, 'cancelled'),
  });
}

async function getLineBookingRequest(env, id) {
  return await lineBookingDb(env).prepare(
    `select id, line_user_id as lineUserId, line_display_name as lineDisplayName, plan, visitor_visit as visitorVisit, resident,
       display_name as displayName, people, preferred_date as preferredDate,
       preferred_date_key as preferredDateKey, preferred_time as preferredTime,
       session_id as sessionId, rental, summary_text as summaryText, price_yen as priceYen,
       status, reservation_id as reservationId, staff_note as staffNote,
       created_at as createdAt, updated_at as updatedAt, approved_at as approvedAt, cancelled_at as cancelledAt
     from line_booking_requests
     where id = ?1
     limit 1`,
  ).bind(id).first();
}

function lineBookingDb(env) {
  return env.LINE_BOOKINGS_DB || env.RESERVATIONS_DB;
}

function lineBookingReservationName(request) {
  const label = request.plan === 'trial'
    ? '初回体験'
    : request.visitorVisit === 'repeat' ? 'ビジター2回目以降' : 'ビジター1回目';
  return `${request.displayName}（${label}）`.slice(0, 80);
}

function lineBookingStatusMessage(request, status) {
  return status === 'approved'
    ? `ご予約を確定しました。\n\n${lineBookingUserSummary(request)}\n\nご来館をお待ちしております。`
    : `恐れ入ります。下記の仮予約はキャンセルとなりました。\n\n${lineBookingUserSummary(request)}\n\n別日程をご希望の場合は、LINEでそのままご相談ください。`;
}

function lineBookingUserSummary(request) {
  return [
    `お名前: ${request.displayName}`,
    `内容: ${lineBookingPlanLabel(request)}`,
    `人数: ${request.people}名`,
    `日時: ${request.preferredDate} ${request.preferredTime}`,
  ].join('\n');
}

function lineBookingPlanLabel(request) {
  if (request.plan === 'trial') return '初回無料体験';
  if (request.visitorVisit === 'repeat') return 'ビジター2回目以降';
  return 'ビジター1回目';
}

async function saveMemo(request, env) {
  const input = await readJson(request);
  const sessionId = String(input.sessionId || '');
  const memo = String(input.memo || '').slice(0, 500);
  if (!isValidSessionId(sessionId)) throw new Error('INVALID_SESSION');
  await env.RESERVATIONS_DB.prepare(
    `insert into session_memos(session_id, memo, updated_at)
     values (?1, ?2, datetime('now'))
     on conflict(session_id) do update set memo = excluded.memo, updated_at = datetime('now')`,
  ).bind(sessionId, memo).run();
  return json({ ok: true });
}

async function saveBusinessClosure(request, env) {
  const input = await readJson(request);
  const dateKey = normalizeDateKey(input.dateKey || input.date);
  const period = normalizeClosurePeriod(input.period);
  const reason = String(input.reason || '').trim().slice(0, 120);
  if (!dateKey || !period) throw new Error('INVALID_CLOSURE');

  const id = `${dateKey}-${period}`;
  await env.RESERVATIONS_DB.prepare(
    `insert into business_closures(id, date_key, period, reason, updated_at)
     values (?1, ?2, ?3, ?4, datetime('now'))
     on conflict(id) do update set reason = excluded.reason, updated_at = datetime('now')`,
  ).bind(id, dateKey, period, reason).run();
  return json({ ok: true, closure: { id, dateKey, period, reason } });
}

async function deleteBusinessClosure(request, env) {
  const input = await readJson(request);
  const id = String(input.id || '').trim();
  if (!id) throw new Error('INVALID_CLOSURE');
  await env.RESERVATIONS_DB.prepare(
    'delete from business_closures where id = ?1',
  ).bind(id).run();
  return json({ ok: true, id });
}

async function saveTrainerOverride(request, env) {
  const input = await readJson(request);
  const sessionId = String(input.sessionId || '');
  const trainerLabel = normalizeName(input.trainerLabel || input.label).slice(0, 40);
  const trainerId = String(input.trainerId || slugTrainerLabel(trainerLabel)).trim().slice(0, 60);
  if (!isValidSessionId(sessionId) || !trainerLabel) throw new Error('INVALID_TRAINER');
  await env.RESERVATIONS_DB.prepare(
    `insert into session_trainer_overrides(session_id, trainer_id, trainer_label, updated_at)
     values (?1, ?2, ?3, datetime('now'))
     on conflict(session_id) do update set
       trainer_id = excluded.trainer_id,
       trainer_label = excluded.trainer_label,
       updated_at = datetime('now')`,
  ).bind(sessionId, trainerId, trainerLabel).run();
  return json({ ok: true, override: { sessionId, trainerId, trainerLabel } });
}

async function deleteTrainerOverride(request, env) {
  const input = await readJson(request);
  const sessionId = String(input.sessionId || '');
  if (!isValidSessionId(sessionId)) throw new Error('INVALID_TRAINER');
  await env.RESERVATIONS_DB.prepare(
    'delete from session_trainer_overrides where session_id = ?1',
  ).bind(sessionId).run();
  return json({ ok: true, sessionId });
}

async function isSessionClosed(env, sessionId) {
  if (isRecurringSunday(sessionId)) return true;
  if (isRecurringFirstSaturdayMorning(sessionId)) return true;
  const session = parseSession(sessionId);
  const row = await env.RESERVATIONS_DB.prepare(
    `select id from business_closures
     where date_key = ?1 and (period = 'full' or period = ?2)
     limit 1`,
  ).bind(session.dateKey, closurePeriodForHour(session.hour)).first();
  return Boolean(row);
}

async function confirmedUnits(env, sessionId) {
  const row = await env.RESERVATIONS_DB.prepare(
    "select coalesce(sum(coalesce(capacity_units, 1)), 0) as units from reservations where session_id = ?1 and status = 'confirmed'",
  ).bind(sessionId).first();
  return Number(row?.units || 0);
}

async function monthlyUsage(env, memberCode, monthKey) {
  const row = await env.RESERVATIONS_DB.prepare(
    "select count(*) as count from reservations where member_code = ?1 and status = 'confirmed' and substr(session_id, 1, 7) = ?2 and coalesce(quota_exempt, 0) = 0",
  ).bind(memberCode, monthKey).first();
  return Number(row?.count || 0);
}

function parseSession(sessionId) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(sessionId);
  if (!match) throw new Error('INVALID_SESSION');
  return {
    dateKey: `${match[1]}-${match[2]}-${match[3]}`,
    monthKey: `${match[1]}-${match[2]}`,
    hour: Number(match[4]),
  };
}

function isValidSessionId(sessionId) {
  return /^\d{4}-\d{2}-\d{2}-\d{2}$/.test(sessionId);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    throw new Error('INVALID_JSON');
  }
}

function normalizeMemberCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 24);
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeGuestNames(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeName).filter(Boolean).slice(0, 2);
}

function normalizeRequestId(value) {
  return String(value || '').trim().slice(0, 80);
}

function slugTrainerLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9一-龠ぁ-んァ-ヶー]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';
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

function normalizeMemberStatus(value) {
  const status = String(value || '').trim();
  return MEMBER_STATUSES.has(status) ? status : '';
}

function normalizeReservationKind(value) {
  const kind = String(value || 'regular').trim();
  return RESERVATION_KIND.has(kind) ? kind : 'regular';
}

function normalizeClosurePeriod(value) {
  const period = String(value || '').trim();
  return ['morning', 'afternoon', 'full'].includes(period) ? period : '';
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

function normalizeMemberRow(member) {
  const active = Boolean(member.active);
  const memberStatus = active ? effectiveMemberStatus(member) : 'deleted';
  return {
    ...member,
    quotaExtra: normalizeInteger(member.quotaExtra, 0, 99),
    quotaExtraMonth: normalizeMonthKey(member.quotaExtraMonth),
    pauseOn: normalizeDateKey(member.pauseOn),
    ngMemberCodes: Array.isArray(member.ngMemberCodes) ? member.ngMemberCodes.map(normalizeMemberCode).filter(Boolean) : [],
    active,
    memberStatus,
  };
}

function normalizeMemberCodeList(value) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(normalizeMemberCode).filter(Boolean))).slice(0, 50);
  return Array.from(new Set(String(value || '').split(/[\s,、，]+/).map(normalizeMemberCode).filter(Boolean))).slice(0, 50);
}

function effectiveMonthlyQuota(member, monthKey = currentJstMonthKey()) {
  if (member.monthlyQuota === null || member.monthlyQuota === undefined) return null;
  const extra = normalizeMonthKey(member.quotaExtraMonth) === monthKey ? normalizeInteger(member.quotaExtra, 0, 99) : 0;
  return Number(member.monthlyQuota || 0) + extra;
}

function effectiveMemberStatus(member) {
  if (member.memberStatus === 'paused') return 'paused';
  if (normalizeDateKey(member.pauseOn) && normalizeDateKey(member.pauseOn) <= currentJstDateKey()) return 'paused';
  return member.memberStatus || 'active';
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

function randomToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      'pragma': 'no-cache',
    },
  });
}
