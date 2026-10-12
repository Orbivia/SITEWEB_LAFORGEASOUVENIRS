-- Keep the database font choices aligned with the customization UI.
BEGIN;
ALTER TABLE public.capsules DROP CONSTRAINT capsules_qr_font_check;
ALTER TABLE public.capsules ADD CONSTRAINT capsules_qr_font_check CHECK (qr_font = ANY (ARRAY['elegant','classic','modern','romantic','editorial','refined','contemporary','signature','heritage','literary','friendly','clear']::text[]));
COMMIT;
