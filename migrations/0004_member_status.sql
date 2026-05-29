alter table members add column status text not null default 'active';

update members
set status = case when active = 1 then 'active' else 'deleted' end
where status not in ('active', 'paused', 'deleted') or active = 0;

create index if not exists members_status_idx
  on members(status, active);
