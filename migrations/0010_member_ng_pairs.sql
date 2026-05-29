create table if not exists member_ng_pairs (
  member_code text not null,
  ng_member_code text not null,
  note text,
  created_at text not null default (datetime('now')),
  primary key (member_code, ng_member_code),
  foreign key (member_code) references members(member_code),
  foreign key (ng_member_code) references members(member_code)
);

create index if not exists member_ng_pairs_ng_member_idx
  on member_ng_pairs(ng_member_code);
