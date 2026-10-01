create or replace function la_suite_internal.daily_backup() returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.capsules where (la_suite_internal.capsule_state(id)->>'state')<>'expired') and not exists(select 1 from la_suite_internal.backups where automatic and created_at>now()-interval '20 hours') and not exists(select 1 from la_suite_internal.backups where scope_id is null and state in ('queued','running','restoring')) then
  begin
   perform public.admin_backend('queue','{"automatic":true}'::jsonb);
  exception when others then
   insert into la_suite_internal.backups(label,state,error,automatic,finished_at) values('Toutes les capsules','failed','Sauvegarde automatique interrompue. Vérifiez les fichiers de vos capsules et relancez une sauvegarde.',true,now());
  end;
 end if;
end $$;
