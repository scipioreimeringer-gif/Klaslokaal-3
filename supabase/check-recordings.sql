-- Read-only check (changes nothing): recordings and AI reports of one student, e.g. Esther Rodrigues on 22 Nov 2026.
-- Shows per recording whether the audio file exists in storage, whether both gave AI consent, and the report state.
select s.name, r.lesson_date, r.created_at, round(r.duration_seconds / 60.0) as minutes, r.size_bytes,
       (select count(*) from storage.objects o where o.bucket_id = 'recordings' and o.name = r.storage_path) as audio_in_storage,
       r.ai_consent_teacher_at is not null as ai_consent_teacher, r.ai_consent_student_at is not null as ai_consent_student,
       a.status as report_status, a.stage, a.error, a.published_at
from public.lesson_recordings r
join public.students s on s.id = r.student_id
left join public.lesson_analyses a on a.recording_id = r.id and not coalesce(a.is_test, false)
where s.name ilike '%esther%'
order by r.created_at desc;

-- No row for 22 November = no recording was saved for that lesson (only attendance): then no report can be made.
-- ai_consent_* false = recorded without consent for an AI report: Esther and you can give it afterwards in the lesson
-- ("Toestemming geven voor AI-verslag", needs v56.sql); the report is then made automatically.
