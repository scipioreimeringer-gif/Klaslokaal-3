-- =====================================================================
-- TeachyRooms v64 — Dutch grammar curriculum from the teacher's PDF "NT2-Grammaticaleerlijn: van A0 tot C1"
-- (68 topics incl. the continuous lines) + the status "Extra oefenen".
--
-- Run ONCE in the Supabase SQL Editor (after v63.sql). NON-DESTRUCTIVE: inserts/updates ONLY the standard goals with
-- codes nt2-*; the existing Dutch and all Portuguese goals and every student's progress stay as they are (older
-- Dutch standard goals are simply no longer shown in the Dutch learning line). The status rule is WIDENED with
-- 'review' (Extra oefenen). Generated from lib/curriculum/nt2.ts (stable ids). Idempotent.
-- =====================================================================
alter table public.student_goal_progress drop constraint if exists student_goal_progress_status_check;
alter table public.student_goal_progress add constraint student_goal_progress_status_check check (status in ('not_started','in_progress','covered','review','mastered'));

insert into public.curriculum_goals(code, subject, level, skill, title, description, sort) values
  ('nt2-a1-01', 'nl', 'A1', 'grammatica', 'Uitspraak en spelling', '• Alfabet, klinkers kort/lang (man–maan, bos–boos)
• Tweeklanken: ui, eu, oe, ij/ei, au/ou
• De g/ch, de "stomme e" (sjwa)
• Open en gesloten lettergrepen (basis voor spelling van werkwoorden en meervoud)
Didactiek: De open/gesloten lettergreepregel komt terug bij bijna elk later onderwerp (lopen–loopt, maken–maakt).', 1000),
  ('nt2-a1-02', 'nl', 'A1', 'grammatica', 'Persoonlijke voornaamwoorden', '• ik, jij/je, u, hij, zij/ze, het, wij/we, jullie, zij/ze
• Verschil jij/je en zij/ze (beklemtoond/onbeklemtoond)
• u vs. jij (formeel/informeel)', 1001),
  ('nt2-a1-03', 'nl', 'A1', 'grammatica', 'Tegenwoordige tijd (presens) — regelmatige werkwoorden', '• Stam + regels: ik werk, jij werkt, hij werkt, wij werken
• Inversie: werk jij? (geen -t!)
• Spelling: stamregels (leven → ik leef, maken → ik maak)', 1002),
  ('nt2-a1-04', 'nl', 'A1', 'grammatica', 'Zijn, hebben, gaan, komen, doen (onregelmatig presens)', '• Onregelmatige vormen van zijn, hebben, gaan, komen, doen', 1003),
  ('nt2-a1-05', 'nl', 'A1', 'grammatica', 'Lidwoorden: de, het, een', '• Geen sluitende regels — leer woorden mét lidwoord aan
• Vuistregels: verkleinwoorden = het, meervoud = de, personen meestal de
Didactiek: de/het blijft tot en met B2 lastig. Corrigeer mild, train met chunks.', 1004),
  ('nt2-a1-06', 'nl', 'A1', 'grammatica', 'Meervoud', '• -en (boek → boeken) en -s (tafel → tafels)
• Spellingsveranderingen: maan → manen, bus → bussen, huis → huizen, brief → brieven', 1005),
  ('nt2-a1-07', 'nl', 'A1', 'grammatica', 'Zinsbouw hoofdzin', '• Basis: onderwerp – persoonsvorm – rest
• Inversie: persoonsvorm op plaats 2 blijft (Morgen ga ik naar school.)
• Het kernprincipe van de Nederlandse zin — vroeg aanleren, eindeloos herhalen', 1006),
  ('nt2-a1-08', 'nl', 'A1', 'grammatica', 'Vraagzinnen', '• Ja/nee-vragen (inversie): Werk je vandaag?
• Vraagwoorden: wie, wat, waar, wanneer, waarom, hoe, welke, hoeveel', 1007),
  ('nt2-a1-09', 'nl', 'A1', 'grammatica', 'Ontkenning: niet en geen', '• geen + onbepaald zelfstandig naamwoord (Ik heb geen auto.)
• niet in andere gevallen + plaats van niet in de zin
Didactiek: Veelgemaakte fout: "Ik heb niet een auto." Oefen het contrast expliciet.', 1008),
  ('nt2-a1-10', 'nl', 'A1', 'grammatica', 'Bezittelijke voornaamwoorden', '• mijn, jouw/je, uw, zijn, haar, ons/onze, jullie, hun
• ons/onze (het-woord/de-woord)', 1009),
  ('nt2-a1-11', 'nl', 'A1', 'grammatica', 'Aanwijzende voornaamwoorden', '• deze/die (de-woorden), dit/dat (het-woorden)', 1010),
  ('nt2-a1-12', 'nl', 'A1', 'grammatica', 'Modale werkwoorden (presens)', '• kunnen, willen, moeten, mogen, zullen
• Zinsbouw: modaal op plaats 2, infinitief achteraan (Ik wil morgen zwemmen.)
• De tangconstructie begint hier — visualiseer met een zinsschema', 1011),
  ('nt2-a1-13', 'nl', 'A1', 'grammatica', 'Getallen, tijd, dagen, data', '• Klok kijken (kwart over, half — "half drie" = 2:30!)', 1012),
  ('nt2-a1-14', 'nl', 'A1', 'grammatica', 'Er + zijn (plaats/existentie)', '• Er is een probleem. / Er zijn veel mensen.', 1013),
  ('nt2-a1-15', 'nl', 'A1', 'grammatica', 'Het adjectief (basis)', '• Buigings-e: de grote man, een grote man, het grote huis, MAAR: een groot huis
• Predicatief zonder -e: het huis is groot
Didactiek: Veelgemaakte fout: "een grote huis". De uitzondering (een + het-woord = geen -e) verdient een eigen les.', 1014),
  ('nt2-a1-16', 'nl', 'A1', 'grammatica', 'Gaan + infinitief (toekomst)', '• Ik ga morgen werken.', 1015),
  ('nt2-a1-17', 'nl', 'A1', 'grammatica', 'Graag / niet graag', '• Ik drink graag koffie. (i.p.v. "ik houd van" overal)', 1016),
  ('nt2-a2-01', 'nl', 'A2', 'grammatica', 'Perfectum (voltooid tegenwoordige tijd)', '• hebben/zijn + voltooid deelwoord
• Regelmatig: ge + stam + t/d (''t kofschip / soft ketchup)
• Onregelmatige deelwoorden (frequentielijst aanleren)
• Wanneer zijn: beweging met richting, verandering van toestand, blijven/zijn/worden/gaan/komen
• Geen ge- bij be-, ge-, er-, her-, ont-, ver- (betaald, vergeten)
Didactiek: Verdeel over meerdere lessen: eerst hebben + regelmatig, dan onregelmatig, dan zijn-werkwoorden.', 1017),
  ('nt2-a2-02', 'nl', 'A2', 'grammatica', 'Scheidbare werkwoorden', '• opbellen: ik bel op / ik heb opgebeld / ik wil opbellen
• Klemtoonverschil scheidbaar/onscheidbaar (vóórkomen vs. voorkómen — pas later)', 1018),
  ('nt2-a2-03', 'nl', 'A2', 'grammatica', 'Imperfectum (verleden tijd) — introductie', '• Regelmatig: stam + te(n)/de(n)
• Frequente onregelmatige: was/waren, had/hadden, ging, kwam, deed, zei, kon, moest, wilde/wou
• Gebruik perfectum vs. imperfectum: perfectum voor losse gebeurtenissen, imperfectum voor beschrijving/gewoonte/reeks
Didactiek: Veelgemaakte fout (vooral bij Engels-/Spaanstaligen): imperfectum waar het Nederlands perfectum kiest.', 1019),
  ('nt2-a2-04', 'nl', 'A2', 'grammatica', 'Bijzinnen — introductie', '• omdat, als, dat, of: persoonsvorm naar het einde
• Contrast omdat/want (bijzin vs. hoofdzin!)
• Bijzin vooraan → inversie in hoofdzin (Als het regent, blijf ik thuis.)', 1020),
  ('nt2-a2-05', 'nl', 'A2', 'grammatica', 'Reflexieve werkwoorden', '• zich wassen, zich voelen, zich vergissen
• me/je/zich/ons/je/zich', 1021),
  ('nt2-a2-06', 'nl', 'A2', 'grammatica', 'Om … te + infinitief', '• Ik ga naar de winkel om brood te kopen.', 1022),
  ('nt2-a2-07', 'nl', 'A2', 'grammatica', 'Comparatief en superlatief', '• groter (dan), grootst
• Onregelmatig: goed–beter–best, veel–meer–meest, graag–liever–liefst', 1023),
  ('nt2-a2-08', 'nl', 'A2', 'grammatica', 'Imperatief', '• Kom! Komt u binnen! Laten we gaan!', 1024),
  ('nt2-a2-09', 'nl', 'A2', 'grammatica', 'Woordvolgorde: tijd – manier – plaats', '• Ik ga morgen met de trein naar Amsterdam.', 1025),
  ('nt2-a2-10', 'nl', 'A2', 'grammatica', 'Toekomst: zullen vs. gaan vs. presens', '• Presens + tijdsbepaling is het meest gebruikelijk (Ik werk morgen.)', 1026),
  ('nt2-a2-11', 'nl', 'A2', 'grammatica', 'Verkleinwoorden', '• -je, -tje, -pje, -etje, -kje (+ altijd het-woord!)', 1027),
  ('nt2-a2-12', 'nl', 'A2', 'grammatica', 'Voorzetsels (vaste combinaties, fase 1)', '• Plaats en tijd: in, op, aan, bij, naast, tussen, om, over
• Vaste combinaties beginnen te verzamelen (wachten op, kijken naar)', 1028),
  ('nt2-a2-13', 'nl', 'A2', 'grammatica', 'Willen/kunnen/moeten in het imperfectum', '• wilde/wou, kon, moest, mocht, zou', 1029),
  ('nt2-a2-14', 'nl', 'A2', 'grammatica', 'Er — uitbreiding', '• Er + onbepaald onderwerp (Er loopt een man op straat.)', 1030),
  ('nt2-b1-01', 'nl', 'B1', 'grammatica', 'Alle voegwoorden en bijzinnen', '• Tijd: toen, als, wanneer, terwijl, voordat, nadat, zodra, totdat, sinds
• toen vs. als vs. wanneer (klassieke fout!)
• Reden/gevolg: omdat, doordat, zodat
• Tegenstelling: hoewel, terwijl
• Voorwaarde: als, tenzij, mits
• Indirecte vraag: of, + vraagwoorden', 1031),
  ('nt2-b1-02', 'nl', 'B1', 'grammatica', 'Relatieve bijzinnen (betrekkelijke voornaamwoorden)', '• die/dat (de man die…, het boek dat…)
• wie na voorzetsel (de man met wie ik werk)
• waar + voorzetsel voor zaken (het boek waarover we spraken / waar we over spraken)', 1032),
  ('nt2-b1-03', 'nl', 'B1', 'grammatica', 'Passief (lijdende vorm)', '• worden + voltooid deelwoord (presens/imperfectum): De brief wordt geschreven.
• zijn + voltooid deelwoord (perfectum!): De brief is geschreven.
• door + handelende persoon
• Er wordt gebeld. (onpersoonlijk passief)
Didactiek: Veelgemaakte fout: "De brief is geworden geschreven." Het perfectum-passief zonder geworden expliciet behandelen.', 1033),
  ('nt2-b1-04', 'nl', 'B1', 'grammatica', 'Er — alle functies', '• Plaats (= daar): Ik woon er al jaren.
• Presentatief: Er staat een fiets voor de deur.
• Kwantitatief: Ik heb er drie.
• Prepositioneel: Denk je eraan? / Ik denk er niet aan.
• In passief: Er wordt gelachen.
Didactiek: Berucht — spreid over meerdere lessen.', 1034),
  ('nt2-b1-05', 'nl', 'B1', 'grammatica', 'Zou(den): conditionalis en beleefdheid', '• Hypothese: Als ik rijk was, zou ik reizen.
• Beleefd verzoek: Zou u mij kunnen helpen?
• Advies: Je zou meer moeten slapen.
• Gerucht: Hij zou ziek zijn.', 1035),
  ('nt2-b1-06', 'nl', 'B1', 'grammatica', 'Plusquamperfectum', '• had/was + voltooid deelwoord
• Combinatie met nadat: Nadat hij had gegeten, ging hij weg.', 1036),
  ('nt2-b1-07', 'nl', 'B1', 'grammatica', 'Infinitiefconstructies', '• te + infinitief na bepaalde werkwoorden (proberen, beloven, vergeten, hoeven, staan/zitten/liggen te)
• aan het + infinitief (Ik ben aan het koken.)
• zonder te: modalen, gaan, komen, blijven, laten, zien, horen', 1037),
  ('nt2-b1-08', 'nl', 'B1', 'grammatica', 'Laten', '• laten + infinitief (Ik laat mijn haar knippen. / Laat me met rust.)', 1038),
  ('nt2-b1-09', 'nl', 'B1', 'grammatica', 'Hoeven', '• niet/geen hoeven te (Je hoeft niet te komen.) — als negatie van moeten', 1039),
  ('nt2-b1-10', 'nl', 'B1', 'grammatica', 'Indirecte rede', '• Hij zegt dat hij ziek is. / Hij vroeg of ik kwam. / Ze vroeg waar ik woonde.
• Verschuiving van tijden en voornaamwoorden', 1040),
  ('nt2-b1-11', 'nl', 'B1', 'grammatica', 'Werkwoorden met vast voorzetsel', '• denken aan, wachten op, houden van, zich interesseren voor…
• Combineren met er/daar/waar + voorzetsel (Waar denk je aan? Daar denk ik nooit aan.)
Didactiek: Doorlopende leerlijn.', 1041),
  ('nt2-b1-12', 'nl', 'B1', 'grammatica', 'Woordvorming', '• Substantieven: -heid, -ing, -te, -er, -ist
• Adjectieven: -ig, -lijk, -loos, on-
• Helpt enorm bij leesvaardigheid Staatsexamen', 1042),
  ('nt2-b1-13', 'nl', 'B1', 'grammatica', 'Volgorde in het werkwoordelijk eindveld', '• …dat hij heeft gewerkt / gewerkt heeft (beide goed)
• …dat hij moet kunnen komen (volgorde bij meerdere infinitieven)', 1043),
  ('nt2-b1-14', 'nl', 'B1', 'grammatica', 'Signaalwoorden en tekstopbouw (voor lezen/schrijven)', '• ten eerste, bovendien, daarom, echter, toch, namelijk, immers, dus', 1044),
  ('nt2-b2-01', 'nl', 'B2', 'grammatica', 'Complexe zinsbouw', '• Meerdere bijzinnen in één zin, ingebedde bijzinnen
• Beknopte bijzinnen: Om gezond te blijven, sport hij dagelijks. / Door hard te werken…
• na te hebben gegeten, zonder iets te zeggen, in plaats van te klagen', 1045),
  ('nt2-b2-02', 'nl', 'B2', 'grammatica', 'Deelwoordconstructies', '• Tegenwoordig deelwoord: al doende, spelende kinderen, lachend liep hij weg
• Voltooid deelwoord als bepaling: de gestolen fiets, eenmaal aangekomen…', 1046),
  ('nt2-b2-03', 'nl', 'B2', 'grammatica', 'Nominalisatie (formeel schrijven)', '• het + infinitief (het roken van sigaretten), -ing-vormen
• Cruciaal voor Staatsexamen II schrijfvaardigheid en zakelijke teksten', 1047),
  ('nt2-b2-04', 'nl', 'B2', 'grammatica', 'Partikels en modale bijwoorden', '• wel, toch, maar, eens, even, nou, hoor, zeker, misschien
• Kom eens even hier. / Dat is wél waar. / Doe maar rustig aan.
• Vooral receptief trainen, daarna productief in dialogen
Didactiek: Typisch Nederlands, moeilijk.', 1048),
  ('nt2-b2-05', 'nl', 'B2', 'grammatica', 'Register: formeel vs. informeel', '• u-vormen, indirecte formuleringen, aanhef/afsluiting brieven en mails
• spreektaal vs. schrijftaal (die/deze i.p.v. hij, tevens/ook, echter/maar)', 1049),
  ('nt2-b2-06', 'nl', 'B2', 'grammatica', 'Passief — verdieping', '• Passief met modalen: Het rapport moet worden geschreven.
• Alternatieven voor passief: men, je, ze', 1050),
  ('nt2-b2-07', 'nl', 'B2', 'grammatica', 'Verwijswoorden en samenhang', '• Correct verwijzen (hij/zij/het/deze/dat/dit/daar), ook naar hele zinnen
• dit/dat als verwijzing naar voorafgaande informatie', 1051),
  ('nt2-b2-08', 'nl', 'B2', 'grammatica', 'Vaste verbindingen en collocaties', '• een besluit nemen, in aanmerking komen, van mening zijn, op de hoogte stellen
• Idiomatische uitdrukkingen (frequente selectie)', 1052),
  ('nt2-b2-09', 'nl', 'B2', 'grammatica', 'Voorwaardelijke en irrealisconstructies — verdieping', '• Als hij dat had geweten, zou hij niet zijn gekomen. / …was hij niet gekomen.
• Mocht u vragen hebben, … (formeel)', 1053),
  ('nt2-b2-10', 'nl', 'B2', 'grammatica', 'Woordvolgorde — finesses', '• Plaats van het middenveld: pronomen vóór nomen, bepaalde vóór onbepaalde elementen
• Achteropplaatsing (extrapositie): Ik heb geprobeerd om te bellen.', 1054),
  ('nt2-b2-11', 'nl', 'B2', 'grammatica', 'Interpunctie en spelling — verdieping', '• Samenstellingen aan elkaar (langetermijnplanning!)
• Werkwoordspelling d/t/dt volledig beheersen (word/wordt, gebeurd/gebeurt)', 1055),
  ('nt2-c1-01', 'nl', 'C1', 'grammatica', 'Stilistische variatie', '• Parafraseren, synoniemen, registers wisselen', 1056),
  ('nt2-c1-02', 'nl', 'C1', 'grammatica', 'Complexe verbindingswoorden', '• desalniettemin, daarentegen, dientengevolge, met dien verstande dat', 1057),
  ('nt2-c1-03', 'nl', 'C1', 'grammatica', 'Ironie, understatement, impliciete betekenis', '• Ironie, understatement, impliciete betekenis', 1058),
  ('nt2-c1-04', 'nl', 'C1', 'grammatica', 'Regionale en informele variatie', '• Regionale en informele variatie begrijpen (spreektaal, verkleinwoorden als nuance)', 1059),
  ('nt2-c1-05', 'nl', 'C1', 'grammatica', 'Genrekennis', '• Beleidstekst, opiniestuk, wetenschappelijke tekst', 1060),
  ('nt2-c1-06', 'nl', 'C1', 'grammatica', 'Resterende de/het-twijfels en subtiele partikelbetekenissen', '• Resterende de/het-twijfels en uitzonderingen, subtiele partikelbetekenissen', 1061),
  ('nt2-dl-01', 'nl', '-', 'grammatica', 'De/het — doorlopend', '• Verzamelen in chunks, nooit "af"', 1062),
  ('nt2-dl-02', 'nl', '-', 'grammatica', 'Werkwoorden met vast voorzetsel — doorlopend', '• Lijst per niveau uitbreiden', 1063),
  ('nt2-dl-03', 'nl', '-', 'grammatica', 'Onregelmatige werkwoorden — doorlopend', '• Frequentiegestuurd', 1064),
  ('nt2-dl-04', 'nl', '-', 'grammatica', 'Uitspraak — doorlopend', '• Klinkerlengte, g, sjwa, zinsintonatie', 1065),
  ('nt2-dl-05', 'nl', '-', 'grammatica', 'Woordvolgorde — doorlopend', '• Het zinsschema (eerste plaats – PV – middenveld – eindveld) als vast visueel anker in élke les', 1066),
  ('nt2-dl-06', 'nl', '-', 'grammatica', 'Er — doorlopend', '• Herhalen, herhalen, herhalen', 1067)
on conflict (code) do update set level = excluded.level, title = excluded.title, description = excluded.description, sort = excluded.sort;
