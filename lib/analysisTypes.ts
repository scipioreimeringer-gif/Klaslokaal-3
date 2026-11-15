// Shape of an AI lesson analysis (draft) and the teacher-approved final version.
export type AnalysisVocab = {term: string; translation: string; example: string; kind: 'word' | 'expression'};
export type AnalysisDoc = {
  summary: string;                                   // 100–150 words
  covered: string[];                                 // what was covered
  practiced: string[];                               // what the student practised
  needs_attention: string[];
  next_lesson: string;
  vocabulary: AnalysisVocab[];
  grammar: {topic: string; explanation: string}[];
  corrections: {original: string; corrected: string; explanation: string}[];
  exercises: {type: string; prompt: string}[];
  goal_suggestions: {goal_code: string; evidence: string}[];  // AI suggestions: teacher confirms; never "mastered"
  source_quality: 'good' | 'partial' | 'poor';
  quality_note: string;
};
export type AnalysisStatus = 'queued' | 'processing' | 'ready' | 'approved' | 'failed';
export const STATUS_LABEL: Record<AnalysisStatus, string> = {queued: 'In wachtrij', processing: 'In verwerking', ready: 'Klaar voor controle', approved: 'Goedgekeurd', failed: 'Verwerking mislukt'};
