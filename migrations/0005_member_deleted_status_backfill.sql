update members
set status = 'deleted'
where active = 0 and status <> 'deleted';
