create table if not exists member_sessions (
  id text primary key,
  member_code text not null,
  session_token_hash text not null unique,
  created_at text not null default (datetime('now')),
  expires_at text not null,
  revoked_at text,
  user_agent text,
  foreign key(member_code) references members(member_code)
);

create index if not exists member_sessions_member_idx
  on member_sessions(member_code, revoked_at, expires_at);
