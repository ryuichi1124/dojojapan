update reservations
set guest_count = 0
where reservation_kind <> 'referral'
  and coalesce(guest_count, 0) <> 0;
