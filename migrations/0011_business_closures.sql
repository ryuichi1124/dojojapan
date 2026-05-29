create table if not exists business_closures (
  id text primary key,
  date_key text not null,
  period text not null check (period in ('morning', 'afternoon', 'full')),
  reason text not null default '',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists business_closures_date_idx
  on business_closures(date_key);

