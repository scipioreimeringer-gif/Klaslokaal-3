// v61: payment administration — pure helpers (unit-tested). Amounts are kept PER CURRENCY (never added across
// currencies); money received is kept apart from the value of lessons actually given.
export type PayStatus = 'open' | 'reported' | 'paid' | 'na';
export type BillLesson = {id: string; student_id: string; starts_at: string; ends_at: string; status: string; payment_status?: PayStatus | null;
  price_cents?: number | null; currency?: string | null; payment_confirmed_at?: string | null};
export type BillPackage = {id: string; student_id?: string; lessons_total: number; used: number; remaining: number; price_cents: number | null; currency: string; paid_at: string | null};
export type Money = Record<string, number>;   // currency → cents

const add = (m: Money, cur: string | null | undefined, cents: number | null | undefined) => { if (!cur || cents == null) return; m[cur] = (m[cur] || 0) + cents; };
export const inMonth = (iso: string | null | undefined, month: string) => !!iso && iso.slice(0, 7) === month;   // month = 'YYYY-MM'
export const given = (l: BillLesson, now: number) => l.status === 'completed' || l.status === 'no_show_student' || (l.status === 'scheduled' && Date.parse(l.ends_at) <= now);

export function summary(lessons: BillLesson[], packages: BillPackage[], month: string, now = Date.now()) {
  const received: Money = {}, outstanding: Money = {}, givenValue: Money = {};
  let lessonsGiven = 0;
  for (const l of lessons) {
    if (l.payment_status === 'paid' && inMonth(l.payment_confirmed_at, month)) add(received, l.currency, l.price_cents);
    if ((l.payment_status === 'open' || l.payment_status === 'reported') && given(l, now)) add(outstanding, l.currency, l.price_cents);
    if (given(l, now) && inMonth(l.starts_at, month)) { lessonsGiven++; add(givenValue, l.currency, l.price_cents); }
  }
  for (const p of packages) if (inMonth(p.paid_at, month)) add(received, p.currency, p.price_cents);
  return {received, outstanding, givenValue, lessonsGiven, prepaidLeft: packages.reduce((n, p) => n + Math.max(0, p.remaining), 0)};
}

export function fmtMoney(m: Money, locale = 'nl-NL') {
  const parts = Object.entries(m).filter(([, v]) => v).map(([cur, cents]) => { try { return new Intl.NumberFormat(locale, {style: 'currency', currency: cur}).format(cents / 100); } catch { return `${(cents / 100).toFixed(2)} ${cur}`; } });
  return parts.length ? parts.join(' + ') : '—';
}
export const fmtPrice = (cents: number | null | undefined, cur: string | null | undefined, locale = 'nl-NL') => cents == null || !cur ? '' : fmtMoney({[cur]: cents}, locale);
export const PAY_LABEL: Record<PayStatus, string> = {open: 'Openstaand', reported: 'Betaling gemeld', paid: 'Betaald', na: 'Niet van toepassing'};
