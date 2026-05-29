alter table reservations add column reservation_kind text not null default 'regular';
alter table reservations add column capacity_units integer not null default 1;
alter table reservations add column price_yen integer;

create index if not exists reservations_session_capacity_idx
  on reservations(session_id, status, reservation_kind);
