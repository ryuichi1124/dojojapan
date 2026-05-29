create table if not exists members (
  member_code text primary key,
  display_name text not null,
  member_type text not null check (member_type in ('prime', 'semi8', 'semi4', 'semi2')),
  monthly_quota integer,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists reservations (
  id text primary key,
  session_id text not null,
  member_code text,
  display_name text not null,
  member_type text not null check (member_type in ('prime', 'semi8', 'semi4', 'semi2', 'manual')),
  monthly_quota integer,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by text not null default 'staff' check (created_by in ('staff', 'member')),
  created_at text not null default (datetime('now')),
  cancelled_at text
);

create unique index if not exists reservations_active_member_session_idx
  on reservations(session_id, member_code)
  where status = 'confirmed' and member_code is not null and member_code <> 'MANUAL';

create index if not exists reservations_session_status_idx
  on reservations(session_id, status);

create index if not exists reservations_member_status_idx
  on reservations(member_code, status);

create table if not exists session_memos (
  session_id text primary key,
  memo text not null default '',
  updated_at text not null default (datetime('now'))
);

insert or ignore into members(member_code, display_name, member_type, monthly_quota) values
  ('DJ-001', '山田 太郎', 'semi8', 8),
  ('DJ-002', '佐藤 花子', 'prime', null),
  ('DJ-003', '鈴木 一郎', 'prime', null),
  ('DJ-004', '高橋 健太', 'semi4', 4),
  ('DJ-005', '田中 美咲', 'semi2', 2),
  ('DJ-006', '中村 翔', 'prime', null),
  ('DJ-007', '伊藤 亮', 'semi8', 8),
  ('DJ-008', '渡辺 葵', 'prime', null),
  ('DJ-009', '小林 大輔', 'semi4', 4),
  ('DJ-010', '加藤 真央', 'semi2', 2);
