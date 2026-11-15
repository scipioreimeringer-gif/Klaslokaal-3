import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {HttpError} from './ai';

export type StudentCtx = {id: string; name: string; subject: string; level: string; lesson_language: string; curriculum_subject: string | null; teacher_id: string; user_id: string | null};

/** Load the student row the caller may access (RLS) and the caller's role in it. */
export async function studentAccess(db: SupabaseClient, userId: string, studentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new HttpError(400, 'Ongeldige leerling');
  const {data, error} = await db.from('students').select('id,name,subject,level,lesson_language,curriculum_subject,teacher_id,user_id').eq('id', studentId).maybeSingle();
  if (error || !data) throw new HttpError(403, 'Geen toegang tot deze leerling');
  const s = data as StudentCtx;
  const {data: isTeacher} = await db.rpc('is_student_teacher', {sid: studentId});
  const role: 'teacher' | 'student' | null = isTeacher ? 'teacher' : s.user_id === userId ? 'student' : null;
  if (!role) throw new HttpError(403, 'Geen toegang tot deze leerling');
  return {student: s, role};
}

/** Subject code for learning paths: explicit setting, else lesson language, else subject name. */
export function subjectCode(s: Pick<StudentCtx, 'curriculum_subject' | 'lesson_language' | 'subject'>) {
  if (s.curriculum_subject) return s.curriculum_subject;
  if (/portug/i.test(s.subject || '')) return 'pt';
  if (/nederl|dutch|nt2/i.test(s.subject || '')) return 'nl';
  return s.lesson_language || 'nl';
}

export const stripHtml = (h: string) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();

/** Canvas text of all pages (typed text only; handwriting on the whiteboard is not read). */
export async function canvasText(db: SupabaseClient, studentId: string, maxChars = 12000) {
  const {data} = await db.from('classroom_states').select('canvas').eq('student_id', studentId).maybeSingle();
  const pages = ((data?.canvas as {pages?: {title: string; html: string}[]} | null)?.pages) || [];
  return pages.map(p => `## ${p.title}\n${stripHtml(p.html)}`).join('\n\n').slice(0, maxChars);
}

export async function goalsFor(db: SupabaseClient, subject: string) {
  const {data} = await db.from('curriculum_goals').select('id,code,level,skill,title').eq('subject', subject).order('level').order('sort');
  return (data || []) as {id: string; code: string | null; level: string; skill: string; title: string}[];
}
