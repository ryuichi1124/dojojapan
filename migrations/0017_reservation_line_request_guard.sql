alter table reservations add column line_booking_request_id text;

create unique index if not exists reservations_line_booking_request_idx
  on reservations(line_booking_request_id)
  where line_booking_request_id is not null and status = 'confirmed';
