export type BankLevel = 'A1' | 'A2' | 'B1' | 'B2';
/** Thematic categories (v38). Words: life … family; word types: verb, adjective; abstract; and the fixed phrases. */
export type BankCat = 'life' | 'food' | 'work' | 'travel' | 'hobby' | 'family' | 'verb' | 'adjective' | 'abstract' | 'expression' | 'saying' | 'proverb';
/** Per level and category: one item per line, "term | forbidden, forbidden, forbidden | meaning". */
export type BankData = Partial<Record<BankLevel, Partial<Record<BankCat, string>>>>;
export type BankItem = {id: string; lang: string; term: string; level: BankLevel; cat: BankCat; meaning: string; taboo: string[]};
