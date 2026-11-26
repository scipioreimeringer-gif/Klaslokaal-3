-- =====================================================================
-- TeachyRooms v72 — importing external lesson audio (WAV pieces) for re-analysis.
--
-- Run ONCE in the Supabase SQL Editor. NON-DESTRUCTIVE and idempotent: it only ADDS audio types to the private
-- "recordings" bucket. Size limit, privacy and policies stay exactly the same; no rows or files are touched.
-- =====================================================================
update storage.buckets
   set allowed_mime_types = (select array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['audio/wav','audio/x-wav','audio/wave','audio/mpeg','audio/mp4'])))
 where id = 'recordings';
