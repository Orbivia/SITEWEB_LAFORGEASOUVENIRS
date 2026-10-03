-- A finalization waiting on the capsule lock must not predate the digest cursor.
create or replace function la_suite_internal.memory_ready() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' or new.media_path is distinct from old.media_path or new.video_path is distinct from old.video_path or new.delivery_at is distinct from old.delivery_at then new.notification_ready_at=greatest(clock_timestamp(),new.delivery_at);end if;return new;
end $$;
revoke all on function la_suite_internal.memory_ready() from public,anon,authenticated;
