alter table reservations add column quota_exempt integer not null default 0;
alter table reservations add column quota_exempt_reason text;
alter table reservations add column guest_name text;
alter table reservations add column guest_resident text;
alter table reservations add column guest_count integer not null default 1;

create index if not exists reservations_member_quota_usage_idx
  on reservations(member_code, status, session_id, quota_exempt);
