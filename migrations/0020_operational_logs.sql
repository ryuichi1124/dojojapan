create table if not exists operational_logs (
  id text primary key,
  area text not null check (area in ('admin', 'member')),
  actor_type text not null,
  actor_id text,
  operation text not null,
  status text not null check (status in ('success', 'error')),
  member_code text,
  reservation_id text,
  session_id text,
  error_code text,
  metadata_json text,
  user_agent text,
  created_at text not null default (datetime('now'))
);

create index if not exists operational_logs_created_idx
  on operational_logs(created_at);

create index if not exists operational_logs_member_idx
  on operational_logs(member_code, created_at);

create index if not exists operational_logs_area_operation_idx
  on operational_logs(area, operation, created_at);
