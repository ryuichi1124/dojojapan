create table if not exists line_booking_requests (
  id text primary key,
  line_user_id text not null,
  plan text not null check (plan in ('trial', 'visitor')),
  visitor_visit text check (visitor_visit in ('', 'first', 'repeat')),
  resident text check (resident in ('', 'local', 'visitor')),
  display_name text not null,
  people integer not null default 1,
  preferred_date text not null,
  preferred_date_key text,
  preferred_time text not null,
  session_id text,
  rental text not null default 'undecided',
  summary_text text not null default '',
  price_yen integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled')),
  reservation_id text,
  staff_note text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  approved_at text,
  cancelled_at text
);

create index if not exists line_booking_requests_status_created_idx
  on line_booking_requests(status, created_at);

create index if not exists line_booking_requests_session_status_idx
  on line_booking_requests(session_id, status);
