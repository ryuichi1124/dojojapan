create table members_revenue_migration (
  member_code text primary key,
  display_name text not null,
  member_type text not null check (member_type in ('prime', 'semi8', 'semi4', 'semi2', 'special')),
  monthly_quota integer,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  booking_token text,
  pin_hash text,
  pin_salt text,
  phone_last4 text,
  birth_mmdd text,
  token_revoked_at text,
  pin_updated_at text,
  auth_locked_until text,
  failed_auth_count integer not null default 0,
  status text not null default 'active',
  quota_extra integer not null default 0,
  quota_extra_month text,
  pause_on text,
  member_kana text,
  monthly_fee_yen integer
);

insert into members_revenue_migration(
  member_code, display_name, member_type, monthly_quota, active, created_at, updated_at,
  booking_token, pin_hash, pin_salt, phone_last4, birth_mmdd, token_revoked_at, pin_updated_at,
  auth_locked_until, failed_auth_count, status, quota_extra, quota_extra_month, pause_on,
  member_kana, monthly_fee_yen
)
select
  member_code, display_name, member_type, monthly_quota, active, created_at, updated_at,
  booking_token, pin_hash, pin_salt, phone_last4, birth_mmdd, token_revoked_at, pin_updated_at,
  auth_locked_until, failed_auth_count, status, quota_extra, quota_extra_month, pause_on,
  member_kana,
  case member_type
    when 'prime' then 33000
    when 'semi8' then 19000
    when 'semi4' then 15000
    when 'semi2' then 10000
    else null
  end
from members;

drop table members;
alter table members_revenue_migration rename to members;

create unique index if not exists members_booking_token_idx
  on members(booking_token)
  where booking_token is not null;

create index if not exists members_status_idx
  on members(status, active);

create table reservations_revenue_migration (
  id text primary key,
  session_id text not null,
  member_code text,
  display_name text not null,
  member_type text not null check (member_type in ('prime', 'semi8', 'semi4', 'semi2', 'special', 'manual')),
  monthly_quota integer,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by text not null default 'staff' check (created_by in ('staff', 'member')),
  created_at text not null default (datetime('now')),
  cancelled_at text,
  reservation_kind text not null default 'regular',
  capacity_units integer not null default 1,
  price_yen integer,
  line_booking_request_id text,
  quota_exempt integer not null default 0,
  quota_exempt_reason text,
  guest_name text,
  guest_resident text,
  guest_count integer not null default 1,
  billing_category text not null default 'member',
  rental_yen integer not null default 0
);

insert into reservations_revenue_migration(
  id, session_id, member_code, display_name, member_type, monthly_quota, status, created_by,
  created_at, cancelled_at, reservation_kind, capacity_units, price_yen, line_booking_request_id,
  quota_exempt, quota_exempt_reason, guest_name, guest_resident, guest_count, billing_category,
  rental_yen
)
select
  id, session_id, member_code, display_name, member_type, monthly_quota, status, created_by,
  created_at, cancelled_at, reservation_kind, capacity_units, price_yen, line_booking_request_id,
  quota_exempt, quota_exempt_reason, guest_name, guest_resident, guest_count,
  case
    when reservation_kind = 'personal' then 'personal'
    when line_booking_request_id is not null and coalesce(price_yen, 0) = 0 then 'trial'
    when line_booking_request_id is not null and coalesce(price_yen, 0) >= 5000 then 'visitor_repeat'
    when line_booking_request_id is not null then 'visitor_first'
    when member_code = 'MANUAL' then 'manual'
    else 'member'
  end,
  0
from reservations;

drop table reservations;
alter table reservations_revenue_migration rename to reservations;

create unique index if not exists reservations_active_member_session_idx
  on reservations(session_id, member_code)
  where status = 'confirmed' and member_code is not null and member_code <> 'MANUAL';

create index if not exists reservations_session_status_idx
  on reservations(session_id, status);

create index if not exists reservations_member_status_idx
  on reservations(member_code, status);

create index if not exists reservations_session_capacity_idx
  on reservations(session_id, status, reservation_kind);

create unique index if not exists reservations_line_booking_request_idx
  on reservations(line_booking_request_id)
  where line_booking_request_id is not null;

create index if not exists reservations_member_quota_usage_idx
  on reservations(member_code, status, session_id, quota_exempt);

create index if not exists reservations_revenue_month_idx
  on reservations(status, session_id, billing_category);
