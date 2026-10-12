DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint
 WHERE conrelid='public.capsules'::regclass AND conname='capsules_welcome_config_valid';
 definition := replace(definition,
 'ARRAY[''elegant''::text, ''classic''::text, ''modern''::text, ''romantic''::text, ''editorial''::text, ''refined''::text, ''contemporary''::text, ''signature''::text]',
 'ARRAY[''elegant''::text, ''classic''::text, ''modern''::text, ''romantic''::text, ''editorial''::text, ''refined''::text, ''contemporary''::text, ''signature''::text, ''heritage''::text, ''literary''::text, ''friendly''::text, ''clear''::text]');
 IF position('''heritage''' in definition)=0 THEN RAISE EXCEPTION 'Expected font validation not found'; END IF;
 ALTER TABLE public.capsules DROP CONSTRAINT capsules_welcome_config_valid;
 EXECUTE 'ALTER TABLE public.capsules ADD CONSTRAINT capsules_welcome_config_valid ' || definition;
END $migration$;
