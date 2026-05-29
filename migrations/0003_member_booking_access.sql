alter table members add column booking_token text;
alter table members add column pin_hash text;
alter table members add column pin_salt text;
alter table members add column phone_last4 text;
alter table members add column birth_mmdd text;
alter table members add column token_revoked_at text;
alter table members add column pin_updated_at text;
alter table members add column auth_locked_until text;
alter table members add column failed_auth_count integer not null default 0;

create unique index if not exists members_booking_token_idx
  on members(booking_token)
  where booking_token is not null;

create table if not exists reservation_events (
  id text primary key,
  reservation_id text,
  member_code text,
  event_type text not null,
  from_session_id text,
  to_session_id text,
  actor_type text not null,
  actor_id text,
  created_at text not null default (datetime('now')),
  note text
);

create index if not exists reservation_events_member_idx
  on reservation_events(member_code, created_at);
