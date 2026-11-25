-- =====================================================================
-- TeachyRooms v68 — Brazilian Portuguese grammar curriculum A0 → C1 (+ continuous lines) and lesson topics.
--
-- Run ONCE in the Supabase SQL Editor (after v64/v65). NON-DESTRUCTIVE and idempotent:
-- 1. inserts/updates ONLY the standard goals with codes ptbr-* (generated from lib/curriculum/ptbr.ts, stable ids);
--    the older Portuguese goals (pt-*), own topics and the Dutch curriculum stay exactly as they are.
-- 2. carries existing Portuguese progress over to the matching new topic, ONLY where the new topic has no progress
--    yet (on conflict do nothing): no teacher assessment is ever overwritten; the old rows stay stored.
-- 3. lesson_goals (v34) gets an optional note/observation and sub-topics (columns with defaults).
-- =====================================================================
insert into public.curriculum_goals(code, subject, level, skill, title, description, sort) values
  ('ptbr-a1-01', 'pt', 'A1', 'grammatica', 'Uitspraak en spelling', '• Alfabet
• Open en gesloten klinkers (é/ê, ó/ô)
• Nasale klinkers en tweeklanken (ã, õe, ão, em)
• Uitspraak van ão, lh, nh, r, rr, s, ç, te/ti, de/di
• Woordklemtoon en basisaccenten (´ ^ ~)
• Verschillen tussen spelling en uitspraak
Voorbeeld: O pão está quente.
Voorbeeld: A filha do vizinho trabalha muito.
Voorbeeld: Tia, você tem tempo à tarde?
Veelgemaakte fout: pão uitgesproken als "pau"
Veelgemaakte fout: lh als l+h (fi-lha)
Veelgemaakte fout: te/de niet als tsje/dzje in het Braziliaans
Didactiek: Nasale klanken en lh/nh steeds kort herhalen; uitspraak blijft een doorlopende leerlijn.', 2000),
  ('ptbr-a1-02', 'pt', 'A1', 'grammatica', 'Persoonlijke voornaamwoorden', '• eu, você, ele, ela, nós, a gente, vocês, eles, elas
• Gebruik van você en a gente in Brazilië
• Regionaal gebruik van tu
• Correcte persoonsvervoeging
Voorbeeld: A gente vai ao cinema hoje.
Voorbeeld: Vocês moram em São Paulo?
Voorbeeld: Ela trabalha num hospital.
Veelgemaakte fout: a gente vamos (a gente + 3e persoon enkelvoud: a gente vai)
Veelgemaakte fout: você vervoegen als tu (você vais)', 2001),
  ('ptbr-a1-03', 'pt', 'A1', 'grammatica', 'Ser en estar', '• Identiteit, beroep en eigenschappen (ser)
• Toestand en locatie (estar)
• Verschillen in betekenis (Ele é chato / Ele está chato)
Voorbeeld: Sou professor.
Voorbeeld: Estou cansado.
Voorbeeld: Estou em casa.
Voorbeeld: A festa é no sábado.
Veelgemaakte fout: Sou cansado (toestand → estou)
Veelgemaakte fout: Estou professor (beroep → sou)
Didactiek: Doorlopend contrast; begin met vaste combinaties (sou de…, estou com fome).', 2002),
  ('ptbr-a1-04', 'pt', 'A1', 'grammatica', 'Ter en haver', '• Bezit en leeftijd (Tenho 30 anos.)
• Ter + zelfstandig naamwoord (ter fome, ter medo)
• Existentieel: tem / há (er is, er zijn)
• Informeel ter versus formeel haver
Voorbeeld: Tenho dois irmãos.
Voorbeeld: Tem um mercado perto daqui.
Voorbeeld: Há muitas pessoas na praia.
Veelgemaakte fout: Sou 30 anos (leeftijd → tenho)
Veelgemaakte fout: Hão muitas pessoas (haver = er is: altijd enkelvoud)', 2003),
  ('ptbr-a1-05', 'pt', 'A1', 'grammatica', 'Regelmatige tegenwoordige tijd', '• Werkwoorden op -ar, -er en -ir
• Persoonsvervoegingen
• Gewoontes en dagelijkse activiteiten
Voorbeeld: Eu trabalho de segunda a sexta.
Voorbeeld: Nós comemos às sete.
Voorbeeld: Eles abrem a loja às nove.
Veelgemaakte fout: eu trabalha (eu → -o)
Veelgemaakte fout: nós comem (nós → -emos)', 2004),
  ('ptbr-a1-06', 'pt', 'A1', 'grammatica', 'Onregelmatige werkwoorden', '• ser, estar, ter, ir, fazer, poder, querer, saber, dizer, vir, ver
• Frequente onregelmatige vormen (faço, posso, sei, digo, venho, vejo)
Voorbeeld: Eu faço o jantar todo dia.
Voorbeeld: Você sabe onde fica a estação?
Voorbeeld: Eu venho de Amsterdã.
Veelgemaakte fout: eu fazo (→ faço)
Veelgemaakte fout: eu sabo (→ sei)
Veelgemaakte fout: eu podo (→ posso)', 2005),
  ('ptbr-a1-07', 'pt', 'A1', 'grammatica', 'Lidwoorden en meervoud', '• o, a, os, as
• um, uma, uns, umas
• Regelmatige en frequente onregelmatige meervouden (-ão → -ões/-ães/-ãos, -l → -is)
Voorbeeld: Os meninos estão na escola.
Voorbeeld: Comprei uns pães.
Voorbeeld: Os hotéis estão cheios.
Veelgemaakte fout: os pãos (→ os pães)
Veelgemaakte fout: os hotels (→ os hotéis)', 2006),
  ('ptbr-a1-08', 'pt', 'A1', 'grammatica', 'Mannelijk en vrouwelijk', '• Grammaticaal geslacht
• Overeenkomst zelfstandig naamwoord, lidwoord en adjectief
• Veelvoorkomende uitzonderingen (o problema, o dia, a mão)
Voorbeeld: O problema é sério.
Voorbeeld: A mão está fria.
Voorbeeld: As casas são bonitas.
Veelgemaakte fout: a problema (→ o problema)
Veelgemaakte fout: as casas bonitos (→ bonitas)', 2007),
  ('ptbr-a1-09', 'pt', 'A1', 'grammatica', 'Vraagzinnen en ontkenning', '• o que, quem, onde, quando, como, por quê, quanto, qual
• não, nunca, nada in eenvoudige zinnen
• Ja/nee-vragen (intonatie)
Voorbeeld: Onde você mora?
Voorbeeld: Por que você não veio?
Voorbeeld: Eu não comi nada.
Veelgemaakte fout: Eu como não carne (não vóór het werkwoord)
Veelgemaakte fout: por que / por quê / porque door elkaar', 2008),
  ('ptbr-a1-10', 'pt', 'A1', 'grammatica', 'Voorzetsels en samentrekkingen', '• de, em, a, com, para, por
• do, da, no, na, ao, à
• Informele vormen pra en pro herkennen
Voorbeeld: Eu moro no Rio.
Voorbeeld: Ela gosta da música brasileira.
Voorbeeld: Vou pro trabalho de ônibus.
Veelgemaakte fout: em o Rio (→ no Rio)
Veelgemaakte fout: eu gosto de a música (→ da)', 2009),
  ('ptbr-a1-11', 'pt', 'A1', 'grammatica', 'Bezittelijke voornaamwoorden', '• meu, minha, seu, sua, nosso, nossa
• dele en dela om dubbelzinnigheid te vermijden
Voorbeeld: Minha mãe mora em Recife.
Voorbeeld: O carro dele é novo.
Voorbeeld: Nossa casa fica perto.
Veelgemaakte fout: meu mãe (→ minha mãe: geslacht van het bezit)
Veelgemaakte fout: seu carro = van hem/haar/u: dubbelzinnig → o carro dele', 2010),
  ('ptbr-a1-12', 'pt', 'A1', 'grammatica', 'Aanwijzende voornaamwoorden', '• este, esse, aquele
• isto, isso, aquilo
• Gangbaar Braziliaans spreektaalgebruik (esse/isso ook voor dichtbij)
Voorbeeld: Esse livro é muito bom.
Voorbeeld: O que é isso?
Voorbeeld: Aquela casa ali é da minha tia.
Veelgemaakte fout: esse casa (→ essa casa)
Veelgemaakte fout: isto livro (isto/isso/aquilo staan alleen)', 2011),
  ('ptbr-a1-13', 'pt', 'A1', 'grammatica', 'Bijvoeglijke naamwoorden', '• Geslacht en meervoud
• Positie (meestal na het zelfstandig naamwoord)
• Basisbeschrijvingen
Voorbeeld: Tenho um carro vermelho.
Voorbeeld: Ela é uma pessoa simpática.
Voorbeeld: Os dias estão quentes.
Veelgemaakte fout: um vermelho carro (→ um carro vermelho)
Veelgemaakte fout: as pessoas simpático (→ simpáticas)', 2012),
  ('ptbr-a1-14', 'pt', 'A1', 'grammatica', 'Getallen, tijd en data', '• Leeftijd, prijzen, kloktijden en afspraken
• Dagen en maanden
Voorbeeld: São três e meia.
Voorbeeld: Custa vinte e cinco reais.
Voorbeeld: Minha aula é na segunda-feira, dia 5 de maio.
Veelgemaakte fout: É três horas (→ São três horas)
Veelgemaakte fout: dois mulheres (→ duas mulheres)', 2013),
  ('ptbr-a1-15', 'pt', 'A1', 'grammatica', 'Modale werkwoorden', '• poder, querer, precisar de + zn., precisar + infinitief, dever, ter que
• Verzoeken, verplichtingen en wensen
Voorbeeld: Você pode me ajudar?
Voorbeeld: Preciso de um café.
Voorbeeld: Tenho que trabalhar amanhã.
Veelgemaakte fout: preciso de trabalhar (+ infinitief zonder de)
Veelgemaakte fout: preciso um café (+ zn. met de)', 2014),
  ('ptbr-a1-16', 'pt', 'A1', 'grammatica', 'Ir + infinitief', '• Nabije toekomst
• Vou trabalhar amanhã.
• Vamos viajar.
Voorbeeld: Vou trabalhar amanhã.
Voorbeeld: Vamos viajar em julho.
Voorbeeld: Ela vai estudar à noite.
Veelgemaakte fout: vou a trabalhar (geen a)
Veelgemaakte fout: eu vai (→ eu vou)', 2015),
  ('ptbr-a1-17', 'pt', 'A1', 'grammatica', 'Estar + gerúndio', '• Handelingen die bezig zijn
• Estou estudando.
• Regelmatige en frequente onregelmatige vormen (fazendo, vindo, pondo)
Voorbeeld: Estou estudando agora.
Voorbeeld: Ela está falando ao telefone.
Voorbeeld: Estava chovendo quando saí.
Veelgemaakte fout: estou a estudar (Europees Portugees; Braziliaans: estudando)
Veelgemaakte fout: estou estuda (→ estudando)', 2016),
  ('ptbr-a2-01', 'pt', 'A2', 'grammatica', 'Pretérito perfeito regulier', '• Regelmatige verleden tijden op -ar, -er en -ir
• Afgeronde gebeurtenissen
• trabalhei, comi, abri
Voorbeeld: Ontem eu trabalhei até tarde.
Voorbeeld: Nós comemos pizza no sábado.
Voorbeeld: Ela abriu a janela.
Veelgemaakte fout: eu trabalhou (eu → -ei)
Veelgemaakte fout: nós comeu (→ comemos)', 2017),
  ('ptbr-a2-02', 'pt', 'A2', 'grammatica', 'Pretérito perfeito onregelmatig', '• fui, fiz, tive, estive, pude, quis, soube, disse, vim, vi, dei, trouxe
Voorbeeld: Fui ao médico ontem.
Voorbeeld: Ela disse a verdade.
Voorbeeld: Eles trouxeram o bolo.
Veelgemaakte fout: eu fazi (→ fiz)
Veelgemaakte fout: eu tivi (→ tive)
Veelgemaakte fout: ele veio / eu vim door elkaar', 2018),
  ('ptbr-a2-03', 'pt', 'A2', 'grammatica', 'Pretérito imperfeito', '• Gewoontes en beschrijvingen in het verleden
• trabalhava, comia, morava
• era, estava, tinha, ia, fazia
Voorbeeld: Quando eu era criança, morava no interior.
Voorbeeld: Todo verão a gente ia à praia.
Voorbeeld: Estava frio e chovia.
Veelgemaakte fout: Quando eu fui criança… (beschrijving → era)
Veelgemaakte fout: eu morei lá todo ano (gewoonte → morava)', 2019),
  ('ptbr-a2-04', 'pt', 'A2', 'grammatica', 'Perfeito versus imperfeito', '• Afgeronde gebeurtenissen
• Achtergrondinformatie
• Gewoontes
• Onderbroken handelingen
Voorbeeld: Eu estava dormindo quando você ligou.
Voorbeeld: Ontem fui ao cinema; o filme era ótimo.
Voorbeeld: Enquanto eu cozinhava, o telefone tocou.
Veelgemaakte fout: Eu dormi quando você ligou (bezig → estava dormindo)
Veelgemaakte fout: Ontem eu ia ao cinema (afgerond → fui)
Didactiek: Groot onderwerp; steeds tijdlijnen en verhalen gebruiken.', 2020),
  ('ptbr-a2-05', 'pt', 'A2', 'grammatica', 'Reflexieve werkwoorden', '• levantar-se, sentir-se, lembrar-se, chamar-se
• Gangbare Braziliaanse plaatsing (me levanto, me chamo)
Voorbeeld: Eu me levanto às seis.
Voorbeeld: Como você se chama?
Voorbeeld: Você se lembra dela?
Veelgemaakte fout: Eu levanto-me (Europese plaatsing; Braziliaans spreektaal: me levanto)
Veelgemaakte fout: Eu se chamo (→ me chamo)', 2021),
  ('ptbr-a2-06', 'pt', 'A2', 'grammatica', 'Vergrotende en overtreffende trap', '• mais … do que, menos … do que, tão … quanto
• melhor, pior, maior, menor
• muito en -íssimo
Voorbeeld: O Rio é maior do que Niterói.
Voorbeeld: Ela é tão alta quanto o irmão.
Voorbeeld: O bolo está gostosíssimo.
Veelgemaakte fout: mais bom (→ melhor)
Veelgemaakte fout: mais grande (→ maior)', 2022),
  ('ptbr-a2-07', 'pt', 'A2', 'grammatica', 'Directe en indirecte objecten', '• me, te, nos, o, a, os, as, lhe, lhes
• Eenvoudige communicatieve situaties
• Spreektaal (eu vi ele) versus standaard schrijftaal (eu o vi)
Voorbeeld: Eu te ligo amanhã.
Voorbeeld: Você me ajuda?
Voorbeeld: Eu o vi ontem. (formeel) / Eu vi ele ontem. (spreektaal)
Veelgemaakte fout: Eu ligo te amanhã (Braziliaans: te vóór het werkwoord)
Veelgemaakte fout: spreektaal "vi ele" ten onrechte als fout aanrekenen', 2023),
  ('ptbr-a2-08', 'pt', 'A2', 'grammatica', 'Gebiedende wijs', '• Bevestigende en ontkennende bevelen
• Instructies, verzoeken en adviezen
• Braziliaanse omgangsvormen (por favor, pode…?)
Voorbeeld: Fala mais devagar, por favor.
Voorbeeld: Não esqueça a chave!
Voorbeeld: Vire à direita na segunda rua.
Veelgemaakte fout: Não fala isso (formeel: não fale; spreektaal komt voor)
Veelgemaakte fout: te bevelend: pode + infinitief is beleefder', 2024),
  ('ptbr-a2-09', 'pt', 'A2', 'grammatica', 'Toekomende tijd', '• ir + infinitief verder oefenen
• Futuro do presente herkennen en gebruiken waar passend (farei, terá)
• Verschil spreektaal en schrijftaal
Voorbeeld: Amanhã vou ligar para você.
Voorbeeld: A reunião terá início às nove. (formeel)
Voorbeeld: Eu farei o possível.
Veelgemaakte fout: futuro do presente in een informeel gesprek (klinkt stijf)
Veelgemaakte fout: eu vou ir (spreektaal; standaard: eu vou)', 2025),
  ('ptbr-a2-10', 'pt', 'A2', 'grammatica', 'Por versus para', '• Reden, bestemming, doel, duur en middel
• Veelvoorkomende vaste combinaties (por favor, por isso, para sempre)
Voorbeeld: Obrigado pela ajuda.
Voorbeeld: Este presente é para você.
Voorbeeld: Passei pelo parque.
Veelgemaakte fout: Obrigado para a ajuda (reden → por/pela)
Veelgemaakte fout: Estudo por aprender (doel → para)
Didactiek: Doorlopende leerlijn.', 2026),
  ('ptbr-a2-11', 'pt', 'A2', 'grammatica', 'Tijdsaanduidingen', '• desde, há, faz, durante, até, ainda, já, nunca
• Moro aqui há dois anos.
• Faz três meses que estudo português.
Voorbeeld: Moro aqui há dois anos.
Voorbeeld: Faz três meses que estudo português.
Voorbeeld: Ainda não terminei.
Veelgemaakte fout: Moro aqui desde dois anos (duur → há)
Veelgemaakte fout: Fazem três meses (faz: altijd enkelvoud)', 2027),
  ('ptbr-a2-12', 'pt', 'A2', 'grammatica', 'Voegwoorden en eenvoudige bijzinnen', '• porque, que, quando, se, mas, então, enquanto
• Oorzaak, tijd en tegenstelling
Voorbeeld: Não fui porque estava doente.
Voorbeeld: Quando chego em casa, tomo banho.
Voorbeeld: Ela estuda enquanto o filho dorme.
Veelgemaakte fout: por que / porque verwisselen in antwoorden
Veelgemaakte fout: enquanto en quando door elkaar', 2028),
  ('ptbr-a2-13', 'pt', 'A2', 'grammatica', 'Onbepaalde voornaamwoorden', '• alguém, ninguém, algo, nada, tudo, todo, algum, nenhum
• Dubbele ontkenning (não vi ninguém)
Voorbeeld: Não vi ninguém.
Voorbeeld: Alguém ligou para você.
Voorbeeld: Tudo bem?
Veelgemaakte fout: Vi ninguém (→ não vi ninguém)
Veelgemaakte fout: todo e tudo door elkaar', 2029),
  ('ptbr-a2-14', 'pt', 'A2', 'grammatica', 'Uitgebreide voorzetsels', '• antes de, depois de, perto de, longe de, dentro de, sem, sobre
• Frequente werkwoorden met vaste voorzetsels
Voorbeeld: Moro perto da praia.
Voorbeeld: Depois do almoço vou dormir.
Voorbeeld: Saí sem guarda-chuva.
Veelgemaakte fout: perto a praia (→ perto da praia)
Veelgemaakte fout: antes de o jantar (→ antes do jantar)', 2030),
  ('ptbr-b1-01', 'pt', 'B1', 'grammatica', 'Presente do subjuntivo', '• Wensen, twijfel, noodzaak en onzekerheid
• Espero que você venha.
• Quero que você faça isso.
• Verschil indicativo en subjuntivo
Voorbeeld: Espero que você venha amanhã.
Voorbeeld: Quero que você faça isso hoje.
Voorbeeld: Talvez eles tenham razão.
Veelgemaakte fout: Espero que você vem (→ venha)
Veelgemaakte fout: Acho que ele venha (zekerheid → indicativo: vem)
Didactiek: Groot onderwerp; contrast met de indicativo steeds expliciet maken.', 2031),
  ('ptbr-b1-02', 'pt', 'B1', 'grammatica', 'Futuro do subjuntivo', '• Toekomstige gebeurtenissen afhankelijk van een voorwaarde
• Quando eu tiver tempo…
• Se você quiser…
• Quando eu for ao Brasil…
Voorbeeld: Quando eu tiver tempo, te ligo.
Voorbeeld: Se você quiser, a gente sai.
Voorbeeld: Quando eu for ao Brasil, vou visitar Salvador.
Veelgemaakte fout: Quando eu tenho tempo… (toekomst → tiver)
Veelgemaakte fout: Se você quer… (→ quiser)', 2032),
  ('ptbr-b1-03', 'pt', 'B1', 'grammatica', 'Imperfeito do subjuntivo', '• Hypothetische situaties
• Wensen en afhankelijkheid van verleden tijden
• Se eu tivesse dinheiro…
Voorbeeld: Se eu tivesse dinheiro, viajaria mais.
Voorbeeld: Ela queria que eu fosse com ela.
Voorbeeld: Seria bom se vocês viessem.
Veelgemaakte fout: Se eu tinha dinheiro… (standaard: tivesse)
Veelgemaakte fout: Ela queria que eu vou (→ fosse)', 2033),
  ('ptbr-b1-04', 'pt', 'B1', 'grammatica', 'Futuro do pretérito', '• gostaria, poderia, faria, teria
• Beleefdheid, advies en hypothetische situaties
Voorbeeld: Eu gostaria de um café, por favor.
Voorbeeld: Você poderia me ajudar?
Voorbeeld: No seu lugar, eu falaria com ele.
Veelgemaakte fout: Eu gostava de um café (spreektaal kan; beleefd: gostaria)
Veelgemaakte fout: eu faria / eu fazeria (→ faria)', 2034),
  ('ptbr-b1-05', 'pt', 'B1', 'grammatica', 'Voorwaardelijke zinnen', '• Reële en hypothetische voorwaarden
• Se eu tiver tempo, vou viajar.
• Se eu tivesse tempo, viajaria.
Voorbeeld: Se eu tiver tempo, vou viajar.
Voorbeeld: Se eu tivesse tempo, viajaria.
Voorbeeld: Se chover, a gente fica em casa.
Veelgemaakte fout: Se eu teria tempo… (na se nooit futuro do pretérito)
Veelgemaakte fout: tijden van de twee delen niet op elkaar afgestemd', 2035),
  ('ptbr-b1-06', 'pt', 'B1', 'grammatica', 'Betrekkelijke voornaamwoorden', '• que, quem, onde, o qual, cujo
• Eenvoudige en complexere relatieve bijzinnen
Voorbeeld: A mulher que mora ali é médica.
Voorbeeld: A cidade onde nasci é pequena.
Voorbeeld: O autor cujo livro li é brasileiro.
Veelgemaakte fout: O livro que eu te falei (standaard: de que eu te falei)
Veelgemaakte fout: cujo o livro (→ cujo livro)', 2036),
  ('ptbr-b1-07', 'pt', 'B1', 'grammatica', 'Objectvoornaamwoorden', '• Direct en indirect gebruik
• Ênclise en próclise herkennen
• Gangbare gesproken Braziliaanse constructies
Voorbeeld: Não me diga isso!
Voorbeeld: Ela me deu um presente.
Voorbeeld: Encontrei-o no centro. (formeel)
Veelgemaakte fout: Me diga no begin van een formele tekst (formeel: Diga-me)
Veelgemaakte fout: lhe als lijdend voorwerp in de standaardtaal', 2037),
  ('ptbr-b1-08', 'pt', 'B1', 'grammatica', 'Persoonlijke infinitief', '• Para eu fazer.
• Para nós fazermos.
• Antes de vocês chegarem.
Voorbeeld: Trouxe o livro para você ler.
Voorbeeld: É melhor nós sairmos cedo.
Voorbeeld: Antes de vocês chegarem, vou limpar a casa.
Veelgemaakte fout: para mim fazer (standaard: para eu fazer)
Veelgemaakte fout: antes de vocês chegar (→ chegarem)', 2038),
  ('ptbr-b1-09', 'pt', 'B1', 'grammatica', 'Passieve constructies', '• ser + particípio
• estar + particípio
• Passief met se (Vendem-se casas.)
• Handeling versus resultaat
Voorbeeld: A casa foi construída em 1950.
Voorbeeld: A loja está fechada.
Voorbeeld: Vendem-se apartamentos.
Veelgemaakte fout: A casa foi construído (overeenkomst: construída)
Veelgemaakte fout: Vende-se casas (standaard: vendem-se)', 2039),
  ('ptbr-b1-10', 'pt', 'B1', 'grammatica', 'Indirecte rede', '• Ele disse que estava cansado.
• Ela perguntou se eu queria sair.
• Veranderingen in tijden en voornaamwoorden
Voorbeeld: Ele disse que estava cansado.
Voorbeeld: Ela perguntou se eu queria sair.
Voorbeeld: Eles disseram que viriam amanhã.
Veelgemaakte fout: Ele disse que está cansado (tijd verschuift meestal: estava)
Veelgemaakte fout: Ela perguntou que eu queria (ja/nee-vraag → se)', 2040),
  ('ptbr-b1-11', 'pt', 'B1', 'grammatica', 'Voltooid verleden tijd', '• tinha/havia + particípio
• Gebeurtenissen vóór een andere gebeurtenis
• Quando cheguei, ele já tinha saído.
Voorbeeld: Quando cheguei, ele já tinha saído.
Voorbeeld: Eu nunca tinha visto o mar.
Voorbeeld: Ela havia terminado o trabalho. (formeel)
Veelgemaakte fout: Quando cheguei, ele já saiu (eerder → tinha saído)
Veelgemaakte fout: tinha saido (accent: saído)', 2041),
  ('ptbr-b1-12', 'pt', 'B1', 'grammatica', 'Werkwoorden met vaste voorzetsels', '• gostar de, precisar de, pensar em, acreditar em, depender de
Voorbeeld: Penso muito em você.
Voorbeeld: Depende do tempo.
Voorbeeld: Acredito em você.
Veelgemaakte fout: Penso de você (→ penso em você)
Veelgemaakte fout: Gosto chocolate (→ gosto de chocolate)', 2042),
  ('ptbr-b1-13', 'pt', 'B1', 'grammatica', 'Verbindingswoorden', '• apesar de, porém, portanto, além disso, mesmo assim, por isso
• Samenhang tussen zinnen
Voorbeeld: Estava chovendo; mesmo assim, saímos.
Voorbeeld: Apesar do frio, fomos à praia.
Voorbeeld: Ele estudou muito, por isso passou.
Veelgemaakte fout: apesar que (→ apesar de / embora)
Veelgemaakte fout: porém aan het begin van informele spreektaal (klinkt formeel)', 2043),
  ('ptbr-b1-14', 'pt', 'B1', 'grammatica', 'Aspectuele constructies', '• acabar de
• começar a
• deixar de
• voltar a
• continuar + gerúndio
• ter + particípio bij herhaalde of voortgaande gebeurtenissen
Voorbeeld: Acabei de chegar.
Voorbeeld: Ela deixou de fumar.
Voorbeeld: Tenho trabalhado muito ultimamente.
Veelgemaakte fout: Acabei chegar (→ acabei de chegar)
Veelgemaakte fout: Tenho trabalhado = "ik heb gewerkt" (betekent: de laatste tijd steeds)', 2044),
  ('ptbr-b1-15', 'pt', 'B1', 'grammatica', 'Spreektaal en schrijftaal', '• a gente versus nós
• pra versus para
• tá versus está
• Gangbaar Braziliaans taalgebruik herkennen zonder informele taal onterecht als fout te markeren
Voorbeeld: A gente tá indo pra casa. (spreektaal)
Voorbeeld: Nós estamos indo para casa. (schrijftaal)
Voorbeeld: Cadê você?
Veelgemaakte fout: spreektaal in een formele e-mail
Veelgemaakte fout: gangbare spreektaal als grammaticale fout corrigeren
Didactiek: Belangrijk voor de AI-analyse: informele vormen zijn geen fout.', 2045),
  ('ptbr-b2-01', 'pt', 'B2', 'grammatica', 'Samengestelde subjuntivovormen', '• tenha feito
• tivesse feito
• tiver feito
Voorbeeld: Espero que você tenha gostado.
Voorbeeld: Se eu tivesse sabido, teria vindo.
Voorbeeld: Quando você tiver terminado, me avise.
Veelgemaakte fout: Espero que você gostou (→ tenha gostado)
Veelgemaakte fout: Se eu teria sabido (→ tivesse sabido)', 2046),
  ('ptbr-b2-02', 'pt', 'B2', 'grammatica', 'Complexe voorwaardelijke zinnen', '• Se eu tivesse estudado, teria passado.
• Irreële situaties in het verleden
• Gecombineerde voorwaarden
Voorbeeld: Se eu tivesse estudado, teria passado.
Voorbeeld: Se você tivesse chegado cedo, agora estaria descansado.
Voorbeeld: Caso não chova, sairemos.
Veelgemaakte fout: Se eu estudava, passava (spreektaal; standaard: tivesse estudado, teria passado)
Veelgemaakte fout: Caso não chove (→ chova)', 2047),
  ('ptbr-b2-03', 'pt', 'B2', 'grammatica', 'Persoonlijke infinitief: verdieping', '• Complexere onderwerpen en infinitiefconstructies
• Verschil met de onpersoonlijke infinitief
Voorbeeld: É importante os alunos participarem.
Voorbeeld: Ao saírem, apaguem a luz.
Voorbeeld: Pedi para eles esperarem.
Veelgemaakte fout: É importante os alunos participar (→ participarem)
Veelgemaakte fout: persoonlijke infinitief waar het onderwerp al duidelijk is (overbodig)', 2048),
  ('ptbr-b2-04', 'pt', 'B2', 'grammatica', 'Plaatsing van objectvoornaamwoorden', '• Próclise
• Ênclise
• Mesóclise (vooral receptief)
• Gesproken versus formeel geschreven Braziliaans Portugees
Voorbeeld: Não me lembro.
Voorbeeld: Informo-lhe que a reunião foi adiada. (formeel)
Voorbeeld: Far-se-á uma revisão. (zeer formeel)
Veelgemaakte fout: Me informaram… aan het begin van een formele tekst
Veelgemaakte fout: mesóclise in een gewoon gesprek', 2049),
  ('ptbr-b2-05', 'pt', 'B2', 'grammatica', 'Complexe bijzinnen', '• embora, ainda que, caso, desde que, contanto que
• Indicativo versus subjuntivo afhankelijk van betekenis
Voorbeeld: Embora esteja cansada, ela vai à festa.
Voorbeeld: Pode sair, desde que volte cedo.
Voorbeeld: Desde que mudei, estou mais feliz.
Veelgemaakte fout: Embora está cansada (→ esteja)
Veelgemaakte fout: desde que = sinds (indicativo) / mits (subjuntivo) door elkaar', 2050),
  ('ptbr-b2-06', 'pt', 'B2', 'grammatica', 'Nominalisatie', '• Werkwoorden en adjectieven omzetten naar zelfstandige naamwoorden
• Formele en professionele teksten
Voorbeeld: A empresa anunciou a contratação de novos funcionários.
Voorbeeld: A falta de chuva preocupa.
Voorbeeld: A melhoria do serviço é urgente.
Veelgemaakte fout: te veel nominalisaties in spreektaal (stijf)
Veelgemaakte fout: verkeerd achtervoegsel (contratamento → contratação)', 2051),
  ('ptbr-b2-07', 'pt', 'B2', 'grammatica', 'Register', '• Formeel en informeel taalgebruik
• Professionele e-mails
• Beleefde verzoeken
• Contextafhankelijke aanspreekvormen (o senhor, a senhora, você)
Voorbeeld: Prezada Sra. Lima, gostaria de confirmar a reunião.
Voorbeeld: Poderia me enviar o relatório?
Voorbeeld: E aí, beleza? (informeel)
Veelgemaakte fout: "E aí" in een zakelijke e-mail
Veelgemaakte fout: você tegen een oudere klant waar o senhor verwacht wordt', 2052),
  ('ptbr-b2-08', 'pt', 'B2', 'grammatica', 'Regência verbal en nominal', '• Gevorderde vaste voorzetselcombinaties
• Standaardtaal versus gangbaar Braziliaans (assistir ao filme / assistir o filme)
Voorbeeld: Assisti ao jogo ontem. (standaard)
Voorbeeld: Ela tem medo de avião.
Voorbeeld: Prefiro café a chá.
Veelgemaakte fout: Prefiro mais café do que chá (→ prefiro café a chá)
Veelgemaakte fout: Obedecer as regras (standaard: às regras)', 2053),
  ('ptbr-b2-09', 'pt', 'B2', 'grammatica', 'Crase', '• à en às
• Verplichte, verboden en optionele gevallen
• à medida que, às vezes, à noite
Voorbeeld: Vou à farmácia.
Voorbeeld: Às vezes saio à noite.
Voorbeeld: Chegamos às oito.
Veelgemaakte fout: Vou à Paris (geen lidwoord bij Paris: a Paris)
Veelgemaakte fout: à pé (geen crase voor mannelijk woord: a pé)', 2054),
  ('ptbr-b2-10', 'pt', 'B2', 'grammatica', 'Overeenkomst', '• Complexere onderwerp-werkwoordovereenkomst
• Overeenkomst binnen naamwoordgroepen
• Collectieve zelfstandige naamwoorden
• Uitzonderingen en veelgemaakte fouten
Voorbeeld: A maioria dos alunos chegou cedo.
Voorbeeld: Fazia dois anos que não nos víamos.
Voorbeeld: Seguem anexos os documentos.
Veelgemaakte fout: Houveram problemas (→ houve)
Veelgemaakte fout: Segue anexo os documentos (→ seguem anexos)', 2055),
  ('ptbr-b2-11', 'pt', 'B2', 'grammatica', 'Idiomen en vaste woordcombinaties', '• Expressões idiomáticas
• Collocaties
• Contextafhankelijke betekenis
Voorbeeld: Ele pisou na bola com a gente.
Voorbeeld: Vamos dar um jeito.
Voorbeeld: Tomar uma decisão.
Veelgemaakte fout: letterlijk vertalen (fazer uma decisão → tomar uma decisão)
Veelgemaakte fout: idioom in het verkeerde register', 2056),
  ('ptbr-b2-12', 'pt', 'B2', 'grammatica', 'Argumentatie en tekstsamenhang', '• Meningen onderbouwen
• Tegenargumenten formuleren
• Complexere tekststructuren en verbindingswoorden
Voorbeeld: Por um lado…, por outro lado…
Voorbeeld: Embora haja vantagens, os riscos são grandes.
Voorbeeld: Em suma, a proposta é viável.
Veelgemaakte fout: steeds dezelfde verbindingswoorden
Veelgemaakte fout: mening zonder onderbouwing', 2057),
  ('ptbr-c1-01', 'pt', 'C1', 'grammatica', 'Stilistische variatie', '• Parafraseren
• Synoniemen
• Zinsvariatie
• Registerkeuze
Voorbeeld: Em outras palavras, o projeto foi adiado.
Voorbeeld: A proposta, ainda que ousada, merece atenção.
Veelgemaakte fout: herhaling van dezelfde woorden
Veelgemaakte fout: register wisselt binnen één tekst', 2058),
  ('ptbr-c1-02', 'pt', 'C1', 'grammatica', 'Subtiele werkwoordstijden', '• Complexe verschillen tussen indicativo en subjuntivo
• Tijd, aspect en modaliteit
Voorbeeld: Caso ele tivesse aceitado, teríamos fechado o acordo.
Voorbeeld: Talvez ele já tenha saído.
Veelgemaakte fout: indicativo bij twijfel (talvez ele já saiu)
Veelgemaakte fout: aspect van tenho feito verkeerd gebruikt', 2059),
  ('ptbr-c1-03', 'pt', 'C1', 'grammatica', 'Geavanceerde verbindingswoorden', '• não obstante, contudo, todavia, ao passo que, por conseguinte e afins
Voorbeeld: Os custos subiram; contudo, o lucro aumentou.
Voorbeeld: Ele prefere o campo, ao passo que ela gosta da cidade.
Veelgemaakte fout: contudo en portanto verwisselen (tegenstelling ↔ gevolg)
Veelgemaakte fout: formele verbindingswoorden in spreektaal', 2060),
  ('ptbr-c1-04', 'pt', 'C1', 'grammatica', 'Ironie en impliciete betekenis', '• Sarcasme
• Understatement
• Contextafhankelijke interpretatie
• Indirecte communicatie
Voorbeeld: Que maravilha, mais uma reunião! (ironisch)
Voorbeeld: Não é bem assim… (beleefd oneens)
Veelgemaakte fout: ironie letterlijk opvatten
Veelgemaakte fout: te direct zijn waar indirecte beleefdheid verwacht wordt', 2061),
  ('ptbr-c1-05', 'pt', 'C1', 'grammatica', 'Regionale Braziliaanse taalvariatie', '• Verschillende accenten
• Informele uitdrukkingen
• Regionale woordenschat (mandioca/aipim/macaxeira)
Voorbeeld: Tu vai hoje? (regionaal, o.a. Sul en Nordeste)
Voorbeeld: Bah, que frio! (Rio Grande do Sul)
Veelgemaakte fout: regionale vormen als fout markeren
Veelgemaakte fout: tu met 2e persoon vervoegen in Braziliaanse spreektaal verwachten', 2062),
  ('ptbr-c1-06', 'pt', 'C1', 'grammatica', 'Idiomatische formuleringen', '• Natuurlijke vaste combinaties
• Figuurlijk taalgebruik
• Betekenisnuances
Voorbeeld: Isso custou os olhos da cara.
Voorbeeld: Ele fez vista grossa.
Voorbeeld: Chover no molhado.
Veelgemaakte fout: idioom net verkeerd (custar o olho da cara)
Veelgemaakte fout: letterlijke vertaling van een Nederlandse uitdrukking', 2063),
  ('ptbr-c1-07', 'pt', 'C1', 'grammatica', 'Academische en professionele taal', '• Complexere teksten
• Presentaties
• Formele argumentatie
• Nauwkeurige formuleringen
Voorbeeld: Os dados indicam que…
Voorbeeld: Cabe ressaltar que a amostra é pequena.
Veelgemaakte fout: vaag taalgebruik (coisa, negócio) in formele tekst
Veelgemaakte fout: spreektaal in een presentatie', 2064),
  ('ptbr-c1-08', 'pt', 'C1', 'grammatica', 'Complexe syntactische constructies', '• Ingebedde bijzinnen
• Geavanceerde infinitiefconstructies
• Stilistische woordvolgorde
Voorbeeld: O relatório, cuja versão final será enviada amanhã, já foi aprovado.
Voorbeeld: Por mais que tentasse, não conseguia.
Veelgemaakte fout: Por mais que tentava (→ tentasse)
Veelgemaakte fout: te lange zinnen zonder duidelijke structuur', 2065),
  ('ptbr-c1-09', 'pt', 'C1', 'grammatica', 'Geavanceerde regência en concordância', '• Uitzonderingen
• Formele standaardtaal
• Verfijning van grammaticale nauwkeurigheid
Voorbeeld: Aspiramos a uma vaga na empresa.
Voorbeeld: Haja vista os problemas, adiamos o projeto.
Veelgemaakte fout: Aspiramos uma vaga (in de betekenis streven naar: aspirar a)
Veelgemaakte fout: Fazem dois anos (→ faz)', 2066),
  ('ptbr-dl-01', 'pt', '-', 'grammatica', 'Uitspraak en nasale klanken', '• Nasale klinkers, lh/nh, r/rr, te/de
Voorbeeld: Não, mãe, pão, irmão.
Veelgemaakte fout: nasaal niet hoorbaar', 2067),
  ('ptbr-dl-02', 'pt', '-', 'grammatica', 'Onregelmatige werkwoorden', '• In alle tijden herhalen
Voorbeeld: fiz, fazia, farei, faça, fizesse
Veelgemaakte fout: regelmatige vorm bij een onregelmatig werkwoord', 2068),
  ('ptbr-dl-03', 'pt', '-', 'grammatica', 'Ser versus estar', '• Ook in verleden tijden en het subjuntivo
Voorbeeld: Foi um dia lindo. / Estava cansado.
Veelgemaakte fout: ser en estar verwisseld', 2069),
  ('ptbr-dl-04', 'pt', '-', 'grammatica', 'Geslacht en overeenkomst', '• Lidwoord, adjectief en participium
Voorbeeld: As cartas foram enviadas.
Veelgemaakte fout: overeenkomst vergeten', 2070),
  ('ptbr-dl-05', 'pt', '-', 'grammatica', 'Voorzetsels en vaste combinaties', '• Samentrekkingen en regência
Voorbeeld: Gosto da ideia. / Penso em você.
Veelgemaakte fout: verkeerd voorzetsel', 2071),
  ('ptbr-dl-06', 'pt', '-', 'grammatica', 'Por versus para', '• Reden, doel, route, duur
Voorbeeld: Passei por aqui para te ver.
Veelgemaakte fout: por en para verwisseld', 2072),
  ('ptbr-dl-07', 'pt', '-', 'grammatica', 'Gebruik van verleden tijden', '• Perfeito, imperfeito, mais-que-perfeito
Voorbeeld: Quando cheguei, ele já tinha saído.
Veelgemaakte fout: perfeito voor een gewoonte', 2073),
  ('ptbr-dl-08', 'pt', '-', 'grammatica', 'Indicativo versus subjuntivo', '• Zodra het subjuntivo is geïntroduceerd
Voorbeeld: Acho que ele vem. / Duvido que ele venha.
Veelgemaakte fout: subjuntivo na zekerheid', 2074),
  ('ptbr-dl-09', 'pt', '-', 'grammatica', 'Natuurlijk Braziliaans taalgebruik', '• Natuurlijke formuleringen in plaats van letterlijke vertalingen
Voorbeeld: Tô com fome. / Bora?
Veelgemaakte fout: Europees-Portugese vormen in Braziliaanse context', 2075),
  ('ptbr-dl-10', 'pt', '-', 'grammatica', 'Spreektaal versus schrijftaal', '• Registerbewustzijn op elk niveau
Voorbeeld: A gente tá… / Nós estamos…
Veelgemaakte fout: spreektaal in formele teksten', 2076)
on conflict (code) do update set title = excluded.title, description = excluded.description, level = excluded.level, sort = excluded.sort
  where public.curriculum_goals.owner_teacher is null;

insert into public.student_goal_progress(student_id, goal_id, status, basis, note, lesson_date, lesson_refs, updated_at)
select distinct on (p.student_id, n.id) p.student_id, n.id, p.status, p.basis, p.note, p.lesson_date, p.lesson_refs, p.updated_at
  from public.student_goal_progress p
  join public.curriculum_goals o on o.id = p.goal_id
  join (values ('pt-A0-uit-1', 'ptbr-a1-01'), ('pt-A1-gr-5', 'ptbr-a1-02'), ('pt-A1-gr-2', 'ptbr-a1-03'), ('pt-A1-gr-1', 'ptbr-a1-05'), ('pt-A1-gr-3', 'ptbr-a1-07'), ('pt-A1-gr-3', 'ptbr-a1-08'), ('pt-A1-gr-4', 'ptbr-a1-09'), ('pt-A1-gr-7', 'ptbr-a1-09'), ('pt-A2-gr-4', 'ptbr-a1-10'), ('pt-A1-gr-6', 'ptbr-a1-11'), ('pt-A2-gr-3', 'ptbr-a1-16'), ('pt-A2-gr-6', 'ptbr-a1-17'), ('pt-A2-gr-1', 'ptbr-a2-01'), ('pt-A2-gr-1', 'ptbr-a2-02'), ('pt-A2-gr-2', 'ptbr-a2-03'), ('pt-A2-gr-5', 'ptbr-a2-04'), ('pt-A2-gr-7', 'ptbr-a2-06'), ('pt-A2-zb-1', 'ptbr-a2-07'), ('pt-B1-gr-1', 'ptbr-b1-01'), ('pt-B1-gr-5', 'ptbr-b1-02'), ('pt-B1-gr-3', 'ptbr-b1-03'), ('pt-B1-gr-2', 'ptbr-b1-04'), ('pt-B1-gr-3', 'ptbr-b1-05'), ('pt-B1-gr-4', 'ptbr-b1-06'), ('pt-B2-gr-1', 'ptbr-b1-08'), ('pt-B2-gr-2', 'ptbr-b1-09'), ('pt-B2-gr-3', 'ptbr-b1-11'), ('pt-B1-zb-1', 'ptbr-b1-13'), ('pt-B2-gr-3', 'ptbr-b2-01'), ('pt-C1-gr-1', 'ptbr-b2-04')) as m(old_code, new_code) on m.old_code = o.code
  join public.curriculum_goals n on n.code = m.new_code
 where p.status <> 'not_started'
 order by p.student_id, n.id, case p.status when 'review' then 0 when 'in_progress' then 1 when 'covered' then 2 when 'mastered' then 3 else 4 end
on conflict (student_id, goal_id) do nothing;

alter table public.lesson_goals add column if not exists note text not null default '' check (char_length(note) <= 500);
alter table public.lesson_goals add column if not exists sub text[] not null default '{}';
