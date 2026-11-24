// v64: the Dutch grammar curriculum from "NT2-Grammaticaleerlijn: van A0 tot C1" (the teacher's PDF), as structured
// data with STABLE ids (nt2-<level>-<nn>). Only Dutch; the Portuguese curriculum is not touched. The PDF ends at C1:
// nothing here is presented as a C2 topic. `keys` link a topic to the error/topic categories of the AI memory.
export type Nt2Topic = {code: string; level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | '-'; stage: string; n: number; title: string; sub: string[]; note?: string; keys?: string[]; big?: boolean};

const T = (level: Nt2Topic['level'], stage: string, n: number, title: string, sub: string[], extra: Partial<Nt2Topic> = {}): Nt2Topic =>
  ({code: `nt2-${level === '-' ? 'dl' : level.toLowerCase()}-${String(n).padStart(2, '0')}`, level, stage, n, title, sub, ...extra});
const A1 = 'A0 → A1', A2 = 'A1 → A2', B1 = 'A2 → B1', B2 = 'B1 → B2', C1 = 'B2 → C1', DL = 'Doorlopende leerlijnen';

export const NT2: Nt2Topic[] = [
  T('A1', A1, 1, 'Uitspraak en spelling', ['Alfabet, klinkers kort/lang (man–maan, bos–boos)', 'Tweeklanken: ui, eu, oe, ij/ei, au/ou', 'De g/ch, de "stomme e" (sjwa)', 'Open en gesloten lettergrepen (basis voor spelling van werkwoorden en meervoud)'], {note: 'De open/gesloten lettergreepregel komt terug bij bijna elk later onderwerp (lopen–loopt, maken–maakt).', keys: ['spelling', 'pronunciation']}),
  T('A1', A1, 2, 'Persoonlijke voornaamwoorden', ['ik, jij/je, u, hij, zij/ze, het, wij/we, jullie, zij/ze', 'Verschil jij/je en zij/ze (beklemtoond/onbeklemtoond)', 'u vs. jij (formeel/informeel)'], {keys: ['pronouns']}),
  T('A1', A1, 3, 'Tegenwoordige tijd (presens) — regelmatige werkwoorden', ['Stam + regels: ik werk, jij werkt, hij werkt, wij werken', 'Inversie: werk jij? (geen -t!)', 'Spelling: stamregels (leven → ik leef, maken → ik maak)'], {keys: ['present_tense', 'conjugation']}),
  T('A1', A1, 4, 'Zijn, hebben, gaan, komen, doen (onregelmatig presens)', ['Onregelmatige vormen van zijn, hebben, gaan, komen, doen'], {keys: ['present_tense', 'conjugation']}),
  T('A1', A1, 5, 'Lidwoorden: de, het, een', ['Geen sluitende regels — leer woorden mét lidwoord aan', 'Vuistregels: verkleinwoorden = het, meervoud = de, personen meestal de'], {note: 'de/het blijft tot en met B2 lastig. Corrigeer mild, train met chunks.', keys: ['articles', 'gender']}),
  T('A1', A1, 6, 'Meervoud', ['-en (boek → boeken) en -s (tafel → tafels)', 'Spellingsveranderingen: maan → manen, bus → bussen, huis → huizen, brief → brieven'], {keys: ['plural']}),
  T('A1', A1, 7, 'Zinsbouw hoofdzin', ['Basis: onderwerp – persoonsvorm – rest', 'Inversie: persoonsvorm op plaats 2 blijft (Morgen ga ik naar school.)', 'Het kernprincipe van de Nederlandse zin — vroeg aanleren, eindeloos herhalen'], {keys: ['word_order', 'inversion', 'sentence_structure']}),
  T('A1', A1, 8, 'Vraagzinnen', ['Ja/nee-vragen (inversie): Werk je vandaag?', 'Vraagwoorden: wie, wat, waar, wanneer, waarom, hoe, welke, hoeveel'], {keys: ['questions', 'inversion']}),
  T('A1', A1, 9, 'Ontkenning: niet en geen', ['geen + onbepaald zelfstandig naamwoord (Ik heb geen auto.)', 'niet in andere gevallen + plaats van niet in de zin'], {note: 'Veelgemaakte fout: "Ik heb niet een auto." Oefen het contrast expliciet.', keys: ['negation']}),
  T('A1', A1, 10, 'Bezittelijke voornaamwoorden', ['mijn, jouw/je, uw, zijn, haar, ons/onze, jullie, hun', 'ons/onze (het-woord/de-woord)'], {keys: ['possessives', 'pronouns']}),
  T('A1', A1, 11, 'Aanwijzende voornaamwoorden', ['deze/die (de-woorden), dit/dat (het-woorden)'], {keys: ['demonstratives']}),
  T('A1', A1, 12, 'Modale werkwoorden (presens)', ['kunnen, willen, moeten, mogen, zullen', 'Zinsbouw: modaal op plaats 2, infinitief achteraan (Ik wil morgen zwemmen.)', 'De tangconstructie begint hier — visualiseer met een zinsschema'], {keys: ['modal_verbs', 'word_order']}),
  T('A1', A1, 13, 'Getallen, tijd, dagen, data', ['Klok kijken (kwart over, half — "half drie" = 2:30!)'], {keys: ['numbers', 'time']}),
  T('A1', A1, 14, 'Er + zijn (plaats/existentie)', ['Er is een probleem. / Er zijn veel mensen.'], {keys: ['er']}),
  T('A1', A1, 15, 'Het adjectief (basis)', ['Buigings-e: de grote man, een grote man, het grote huis, MAAR: een groot huis', 'Predicatief zonder -e: het huis is groot'], {note: 'Veelgemaakte fout: "een grote huis". De uitzondering (een + het-woord = geen -e) verdient een eigen les.', keys: ['adjectives']}),
  T('A1', A1, 16, 'Gaan + infinitief (toekomst)', ['Ik ga morgen werken.'], {keys: ['future']}),
  T('A1', A1, 17, 'Graag / niet graag', ['Ik drink graag koffie. (i.p.v. "ik houd van" overal)'], {keys: ['graag']}),

  T('A2', A2, 1, 'Perfectum (voltooid tegenwoordige tijd)', ['hebben/zijn + voltooid deelwoord', "Regelmatig: ge + stam + t/d ('t kofschip / soft ketchup)", 'Onregelmatige deelwoorden (frequentielijst aanleren)', 'Wanneer zijn: beweging met richting, verandering van toestand, blijven/zijn/worden/gaan/komen', 'Geen ge- bij be-, ge-, er-, her-, ont-, ver- (betaald, vergeten)'], {note: 'Verdeel over meerdere lessen: eerst hebben + regelmatig, dan onregelmatig, dan zijn-werkwoorden.', keys: ['auxiliary', 'participle', 'perfect'], big: true}),
  T('A2', A2, 2, 'Scheidbare werkwoorden', ['opbellen: ik bel op / ik heb opgebeld / ik wil opbellen', 'Klemtoonverschil scheidbaar/onscheidbaar (vóórkomen vs. voorkómen — pas later)'], {keys: ['separable_verbs']}),
  T('A2', A2, 3, 'Imperfectum (verleden tijd) — introductie', ['Regelmatig: stam + te(n)/de(n)', 'Frequente onregelmatige: was/waren, had/hadden, ging, kwam, deed, zei, kon, moest, wilde/wou', 'Gebruik perfectum vs. imperfectum: perfectum voor losse gebeurtenissen, imperfectum voor beschrijving/gewoonte/reeks'], {note: 'Veelgemaakte fout (vooral bij Engels-/Spaanstaligen): imperfectum waar het Nederlands perfectum kiest.', keys: ['past_tense']}),
  T('A2', A2, 4, 'Bijzinnen — introductie', ['omdat, als, dat, of: persoonsvorm naar het einde', 'Contrast omdat/want (bijzin vs. hoofdzin!)', 'Bijzin vooraan → inversie in hoofdzin (Als het regent, blijf ik thuis.)'], {keys: ['subordinate_clause', 'word_order'], big: true}),
  T('A2', A2, 5, 'Reflexieve werkwoorden', ['zich wassen, zich voelen, zich vergissen', 'me/je/zich/ons/je/zich'], {keys: ['reflexive']}),
  T('A2', A2, 6, 'Om … te + infinitief', ['Ik ga naar de winkel om brood te kopen.'], {keys: ['infinitive']}),
  T('A2', A2, 7, 'Comparatief en superlatief', ['groter (dan), grootst', 'Onregelmatig: goed–beter–best, veel–meer–meest, graag–liever–liefst'], {keys: ['comparison', 'adjectives']}),
  T('A2', A2, 8, 'Imperatief', ['Kom! Komt u binnen! Laten we gaan!'], {keys: ['imperative']}),
  T('A2', A2, 9, 'Woordvolgorde: tijd – manier – plaats', ['Ik ga morgen met de trein naar Amsterdam.'], {keys: ['word_order']}),
  T('A2', A2, 10, 'Toekomst: zullen vs. gaan vs. presens', ['Presens + tijdsbepaling is het meest gebruikelijk (Ik werk morgen.)'], {keys: ['future']}),
  T('A2', A2, 11, 'Verkleinwoorden', ['-je, -tje, -pje, -etje, -kje (+ altijd het-woord!)'], {keys: ['diminutive']}),
  T('A2', A2, 12, 'Voorzetsels (vaste combinaties, fase 1)', ['Plaats en tijd: in, op, aan, bij, naast, tussen, om, over', 'Vaste combinaties beginnen te verzamelen (wachten op, kijken naar)'], {keys: ['prepositions']}),
  T('A2', A2, 13, 'Willen/kunnen/moeten in het imperfectum', ['wilde/wou, kon, moest, mocht, zou'], {keys: ['modal_verbs', 'past_tense']}),
  T('A2', A2, 14, 'Er — uitbreiding', ['Er + onbepaald onderwerp (Er loopt een man op straat.)'], {keys: ['er']}),

  T('B1', B1, 1, 'Alle voegwoorden en bijzinnen', ['Tijd: toen, als, wanneer, terwijl, voordat, nadat, zodra, totdat, sinds', 'toen vs. als vs. wanneer (klassieke fout!)', 'Reden/gevolg: omdat, doordat, zodat', 'Tegenstelling: hoewel, terwijl', 'Voorwaarde: als, tenzij, mits', 'Indirecte vraag: of, + vraagwoorden'], {keys: ['subordinate_clause', 'conjunctions'], big: true}),
  T('B1', B1, 2, 'Relatieve bijzinnen (betrekkelijke voornaamwoorden)', ['die/dat (de man die…, het boek dat…)', 'wie na voorzetsel (de man met wie ik werk)', 'waar + voorzetsel voor zaken (het boek waarover we spraken / waar we over spraken)'], {keys: ['relative_clause']}),
  T('B1', B1, 3, 'Passief (lijdende vorm)', ['worden + voltooid deelwoord (presens/imperfectum): De brief wordt geschreven.', 'zijn + voltooid deelwoord (perfectum!): De brief is geschreven.', 'door + handelende persoon', 'Er wordt gebeld. (onpersoonlijk passief)'], {note: 'Veelgemaakte fout: "De brief is geworden geschreven." Het perfectum-passief zonder geworden expliciet behandelen.', keys: ['passive']}),
  T('B1', B1, 4, 'Er — alle functies', ['Plaats (= daar): Ik woon er al jaren.', 'Presentatief: Er staat een fiets voor de deur.', 'Kwantitatief: Ik heb er drie.', 'Prepositioneel: Denk je eraan? / Ik denk er niet aan.', 'In passief: Er wordt gelachen.'], {note: 'Berucht — spreid over meerdere lessen.', keys: ['er'], big: true}),
  T('B1', B1, 5, 'Zou(den): conditionalis en beleefdheid', ['Hypothese: Als ik rijk was, zou ik reizen.', 'Beleefd verzoek: Zou u mij kunnen helpen?', 'Advies: Je zou meer moeten slapen.', 'Gerucht: Hij zou ziek zijn.'], {keys: ['conditional']}),
  T('B1', B1, 6, 'Plusquamperfectum', ['had/was + voltooid deelwoord', 'Combinatie met nadat: Nadat hij had gegeten, ging hij weg.'], {keys: ['pluperfect']}),
  T('B1', B1, 7, 'Infinitiefconstructies', ['te + infinitief na bepaalde werkwoorden (proberen, beloven, vergeten, hoeven, staan/zitten/liggen te)', 'aan het + infinitief (Ik ben aan het koken.)', 'zonder te: modalen, gaan, komen, blijven, laten, zien, horen'], {keys: ['infinitive']}),
  T('B1', B1, 8, 'Laten', ['laten + infinitief (Ik laat mijn haar knippen. / Laat me met rust.)'], {keys: ['infinitive']}),
  T('B1', B1, 9, 'Hoeven', ['niet/geen hoeven te (Je hoeft niet te komen.) — als negatie van moeten'], {keys: ['negation', 'modal_verbs']}),
  T('B1', B1, 10, 'Indirecte rede', ['Hij zegt dat hij ziek is. / Hij vroeg of ik kwam. / Ze vroeg waar ik woonde.', 'Verschuiving van tijden en voornaamwoorden'], {keys: ['reported_speech']}),
  T('B1', B1, 11, 'Werkwoorden met vast voorzetsel', ['denken aan, wachten op, houden van, zich interesseren voor…', 'Combineren met er/daar/waar + voorzetsel (Waar denk je aan? Daar denk ik nooit aan.)'], {note: 'Doorlopende leerlijn.', keys: ['prepositions', 'er']}),
  T('B1', B1, 12, 'Woordvorming', ['Substantieven: -heid, -ing, -te, -er, -ist', 'Adjectieven: -ig, -lijk, -loos, on-', 'Helpt enorm bij leesvaardigheid Staatsexamen'], {keys: ['word_formation']}),
  T('B1', B1, 13, 'Volgorde in het werkwoordelijk eindveld', ['…dat hij heeft gewerkt / gewerkt heeft (beide goed)', '…dat hij moet kunnen komen (volgorde bij meerdere infinitieven)'], {keys: ['word_order', 'verb_cluster']}),
  T('B1', B1, 14, 'Signaalwoorden en tekstopbouw (voor lezen/schrijven)', ['ten eerste, bovendien, daarom, echter, toch, namelijk, immers, dus'], {keys: ['connectors']}),

  T('B2', B2, 1, 'Complexe zinsbouw', ['Meerdere bijzinnen in één zin, ingebedde bijzinnen', 'Beknopte bijzinnen: Om gezond te blijven, sport hij dagelijks. / Door hard te werken…', 'na te hebben gegeten, zonder iets te zeggen, in plaats van te klagen'], {keys: ['sentence_structure', 'subordinate_clause']}),
  T('B2', B2, 2, 'Deelwoordconstructies', ['Tegenwoordig deelwoord: al doende, spelende kinderen, lachend liep hij weg', 'Voltooid deelwoord als bepaling: de gestolen fiets, eenmaal aangekomen…'], {keys: ['participle']}),
  T('B2', B2, 3, 'Nominalisatie (formeel schrijven)', ['het + infinitief (het roken van sigaretten), -ing-vormen', 'Cruciaal voor Staatsexamen II schrijfvaardigheid en zakelijke teksten'], {keys: ['nominalisation']}),
  T('B2', B2, 4, 'Partikels en modale bijwoorden', ['wel, toch, maar, eens, even, nou, hoor, zeker, misschien', 'Kom eens even hier. / Dat is wél waar. / Doe maar rustig aan.', 'Vooral receptief trainen, daarna productief in dialogen'], {note: 'Typisch Nederlands, moeilijk.', keys: ['particles']}),
  T('B2', B2, 5, 'Register: formeel vs. informeel', ['u-vormen, indirecte formuleringen, aanhef/afsluiting brieven en mails', 'spreektaal vs. schrijftaal (die/deze i.p.v. hij, tevens/ook, echter/maar)'], {keys: ['register']}),
  T('B2', B2, 6, 'Passief — verdieping', ['Passief met modalen: Het rapport moet worden geschreven.', 'Alternatieven voor passief: men, je, ze'], {keys: ['passive']}),
  T('B2', B2, 7, 'Verwijswoorden en samenhang', ['Correct verwijzen (hij/zij/het/deze/dat/dit/daar), ook naar hele zinnen', 'dit/dat als verwijzing naar voorafgaande informatie'], {keys: ['pronouns', 'reference']}),
  T('B2', B2, 8, 'Vaste verbindingen en collocaties', ['een besluit nemen, in aanmerking komen, van mening zijn, op de hoogte stellen', 'Idiomatische uitdrukkingen (frequente selectie)'], {keys: ['word_choice', 'collocations']}),
  T('B2', B2, 9, 'Voorwaardelijke en irrealisconstructies — verdieping', ['Als hij dat had geweten, zou hij niet zijn gekomen. / …was hij niet gekomen.', 'Mocht u vragen hebben, … (formeel)'], {keys: ['conditional']}),
  T('B2', B2, 10, 'Woordvolgorde — finesses', ['Plaats van het middenveld: pronomen vóór nomen, bepaalde vóór onbepaalde elementen', 'Achteropplaatsing (extrapositie): Ik heb geprobeerd om te bellen.'], {keys: ['word_order']}),
  T('B2', B2, 11, 'Interpunctie en spelling — verdieping', ['Samenstellingen aan elkaar (langetermijnplanning!)', 'Werkwoordspelling d/t/dt volledig beheersen (word/wordt, gebeurd/gebeurt)'], {keys: ['spelling']}),

  T('C1', C1, 1, 'Stilistische variatie', ['Parafraseren, synoniemen, registers wisselen'], {keys: ['register', 'word_choice']}),
  T('C1', C1, 2, 'Complexe verbindingswoorden', ['desalniettemin, daarentegen, dientengevolge, met dien verstande dat'], {keys: ['connectors']}),
  T('C1', C1, 3, 'Ironie, understatement, impliciete betekenis', ['Ironie, understatement, impliciete betekenis']),
  T('C1', C1, 4, 'Regionale en informele variatie', ['Regionale en informele variatie begrijpen (spreektaal, verkleinwoorden als nuance)']),
  T('C1', C1, 5, 'Genrekennis', ['Beleidstekst, opiniestuk, wetenschappelijke tekst']),
  T('C1', C1, 6, 'Resterende de/het-twijfels en subtiele partikelbetekenissen', ['Resterende de/het-twijfels en uitzonderingen, subtiele partikelbetekenissen'], {keys: ['articles', 'particles']}),

  T('-', DL, 1, 'De/het — doorlopend', ['Verzamelen in chunks, nooit "af"'], {keys: ['articles', 'gender']}),
  T('-', DL, 2, 'Werkwoorden met vast voorzetsel — doorlopend', ['Lijst per niveau uitbreiden'], {keys: ['prepositions']}),
  T('-', DL, 3, 'Onregelmatige werkwoorden — doorlopend', ['Frequentiegestuurd'], {keys: ['participle', 'past_tense']}),
  T('-', DL, 4, 'Uitspraak — doorlopend', ['Klinkerlengte, g, sjwa, zinsintonatie'], {keys: ['pronunciation']}),
  T('-', DL, 5, 'Woordvolgorde — doorlopend', ['Het zinsschema (eerste plaats – PV – middenveld – eindveld) als vast visueel anker in élke les'], {keys: ['word_order', 'inversion']}),
  T('-', DL, 6, 'Er — doorlopend', ['Herhalen, herhalen, herhalen'], {keys: ['er']}),
];
export const NT2_BY_CODE = new Map(NT2.map(t => [t.code, t]));
export const NT2_STAGES = [A1, A2, B1, B2, C1, DL];
/** Description stored in curriculum_goals: the subtopics as bullets + the didactic note (from the PDF). */
export const nt2Description = (t: Nt2Topic) => [...t.sub.map(s => '• ' + s), ...(t.note ? ['Didactiek: ' + t.note] : [])].join('\n');
