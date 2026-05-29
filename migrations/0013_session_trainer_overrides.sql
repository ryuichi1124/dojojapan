create table if not exists session_trainer_overrides (
  session_id text primary key,
  trainer_id text not null,
  trainer_label text not null,
  updated_at text not null default (datetime('now'))
);

