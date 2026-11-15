// Shape of an AI lesson analysis (draft) and the teacher-approved final version.
export type AnalysisVocab = {term: string; translation: string; example: string; kind: 'word' | 'expression'};
export type CorrectionCategory = 'grammar' | 'conjugation' | 'word_order' | 'word_choice' | 'pronunciation' | 'other';
export type Correction = {original: string; corrected: string; explanation: string; category?: CorrectionCategory; certainty?: 'certain' | 'uncertain'};
export type AnalysisDoc = {
  summary: string;                                   // 100–150 words
  covered: string[];
  practiced: string[];
  needs_attention: string[];
  next_lesson: string;
  vocabulary: AnalysisVocab[];
  grammar: {topic: string; explanation: string}[];
  corrections: Correction[];                         // only sentences the STUDENT actually said
  recurring_errors?: {pattern: string; occurrences: number}[];
  informal_notes?: string[];                         // informal speech that is NOT an error
  pronunciation?: {word: string; note: string}[];    // always tentative (speech-to-text is not a pronunciation test)
  homework_suggestion?: string;
  exercises: {type: string; prompt: string}[];
  goal_suggestions: {goal_code: string; evidence: string}[];  // AI suggestions: teacher confirms; never "mastered"
  source_quality: 'good' | 'partial' | 'poor';
  quality_note: string;
  speakers_separated?: boolean;
  student_speaking_seconds?: number | null;          // measured from the student track, null when not separated
};
export type AnalysisStatus = 'queued' | 'processing' | 'ready' | 'approved' | 'failed';
export const STATUS_LABEL: Record<AnalysisStatus, string> = {queued: 'In wachtrij', processing: 'In verwerking', ready: 'Klaar voor controle', approved: 'Goedgekeurd', failed: 'Verwerking mislukt'};
export const CATEGORY_LABEL: Record<CorrectionCategory, string> = {grammar: 'Grammatica', conjugation: 'Werkwoordsvervoeging', word_order: 'Zinsbouw', word_choice: 'Woordkeuze', pronunciation: 'Uitspraak (onzeker)', other: 'Overig'};
