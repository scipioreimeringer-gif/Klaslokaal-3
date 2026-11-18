# TeachyRooms v40: eindrapport

Branch: `dev/v40-teachyrooms`, gebaseerd op `main` (`a3ff6a5`, v34–v39). Niets gemerged, niets naar Production.

## Vóór gebruik

- **Supabase:** voer `supabase/v40.sql` één keer uit, na `v38.sql`.
  - Het script voegt één tabel (`analysis_translations`) en één functie (`can_read_analysis`) toe. Er wordt niets verwijderd of gewijzigd, en het mag twee keer draaien.
  - Zonder dit script werkt alles behalve de vertaling van lessamenvattingen. Die toont dan "Voer eerst supabase/v40.sql uit".
- `v38.sql` is nodig voor spelrondes uit de woordenbank (als dat nog niet is gedaan).

## 1. Wat al bestond (niet opnieuw gebouwd)

- **Woordenbank:** 514 Nederlandse woorden, niveaus A1–B2, 12 thema's; spelrondes zonder AI; verborgen kaarten via RLS. Alleen Nederlands.
- **Compacte lesanalyse:** max. 3 punten met ❌/✅/tip en "Meer details" (v38).
- **"Voor jou klaar"** (v38) en de compacte profielnavigatie (v39).
- **Opnames:** al efficiënt.
  - Opus 32 kbit/s (mix) en 24 kbit/s per spoor.
  - Het audiosysteem wordt gesloten en download-URL's worden vrijgegeven.
  - Ongewijzigd gelaten.
- **Bestaande caches:**
  - vertaling van woorden (`translation_cache` + in het geheugen);
  - verboden woorden voor Taboe (`vocab_taboo`);
  - canvaspagina's die niet veranderd zijn worden niet opnieuw gescand.
- **AI-woordverwerking ("✨ Woorden"):** gaf al woordsoort, lidwoord, meervoud en vervoegingen; uitgebreid in fase 8.
- **Bevoegdheden:** server-side controle op docent/beheerder voor de AI-woordverwerking, ordenen en woordherkenning.

## 2. Wijzigingen per fase

| Fase | Wat |
|---|---|
| 1 Performance | De vertaaltabel van de interface (5 talen, 240 kB) laadt alleen nog bij een andere interfacetaal dan Nederlands. De taal schakelt pas om als de vertalingen er zijn. |
| 2 Tweetalige samenvattingen | Schakelaar 🇧🇷/🇳🇱: lestaal eerst, dan de eigen taal; keuze onthouden. Alleen uitleg wordt vertaald, nooit de zinnen van de leerling of de verbeteringen. Vertaling pas na een taalkeuze, alleen voor de geopende kaart, opgeslagen per taal en inhoudsversie. Een correctie door de docent geeft automatisch een nieuwe vertaling. Geen paginaherlading. |
| 3 Huiswerkgenerator | Eén compacte kaart: "📚 Vanuit mijn les" (standaard) met lesselector, niveau en 5–30 min, of "✏️ Zelf kiezen" met alle oefentypes (multi-select) en een optioneel onderwerp. AI alleen op de knop; dubbelklik genegeerd; dezelfde keuzes geven dezelfde set ("Opnieuw genereren" voor een nieuwe). Nieuw: **Lesonderwerpen**, waarbij AI voorstelt uit de analyse (zonder extra AI-aanroep) en de docent aanpast en bevestigt. Handmatige opdracht inklapbaar. |
| 4 Dropdowns | `components/Select.tsx`: één herbruikbare dropdown met toetsenbord (↑↓ Home End Enter Esc, typen), schermlezer (combobox/listbox), opent omhoog als er onder geen ruimte is, scrolt. Geen nieuwe dependency. Plus Jakarta Sans vervangt Inter: één lettertype, dus geen extra download. |
| 5 Leerlingdashboard | "Voor jou klaar" als kaartenraster (4/2/1 kolommen): 📋 Huiswerk met voortgangsbalk, 🧠 "9 woorden herhalen", ✨ Laatste les met aandachtspunten, 🎯 "Gemengde oefening · A2". Gegroepeerd per lestaal en docent; geen extra databasevragen. |
| 6 Navigatie | Home · Lessen · AI-verslag · Woorden · Leerpad · Taken · Oefenen · Bord · Opnames (+ Privé voor de docent). Knoppen 34 px, rustige turquoise actieve tab. Op mobiel de hoofdtabs plus "Meer". Aandachtspunten als teller bij AI-verslag. Alle routes behouden. |
| 7 Klaslokaalwerkbalk | Midden precies Canvas \| Bord │ Scherm \| Spelletjes, allemaal aan/uit-schakelaars. Openen sluit niets anders: Canvas en Bord los of samen, Scherm en Spelletjes ernaast (bij twee panelen de bestaande splitter). Scherm verbergen ≠ delen stoppen (stoppen via ⋯). Slides via het Scherm-paneel. Bovenbalk: timer naast de lesnaam, verbinding als statusbolletje (tooltip met TURN-diagnose), instellingen/privé/dashboard in één ⋯, één Verlaten-knop. |
| 8 AI-woordenschat | Compacte labels: 📘 het brood · znw. · mv. broden, ⚡ lopen · ww., 🎨 mooi · bnw., 💬 uitdrukking/voorbeeldzin. Labels in de uitleg-taal, grammatica volgens de lestaal (alle 6 talen). Meervoud en vervoegingen pas vanaf A2. Oude woorden zonder woordsoort blijven werken. Past in de bestaande kolom, dus geen databasewijziging. |
| 9 Canvas-werkbalk | Zwevende compacte werkbalk: stijl (Normale tekst, Kop 1–3, Opsomming), lettergrootte 12–40 px plus handmatig, B/I/U/S met actieve status, tekst- en markeerkleur, ✨ AI (alleen docent), 🌐 Vertalen (doeltaal kiezen, origineel blijft staan), pagina, nieuwe pagina, ongedaan maken/opnieuw, ⋯ (Tekst · Pagina · Herstellen). Selectie blijft behouden; lettergrootte zonder selectie geldt voor nieuwe tekst. In een smal paneel gaan minder gebruikte knoppen naar ⋯. Menu's binnen het venster, Esc of buiten klikken sluit ze. Alle labels vertaald in het klaslokaal. |

## 3. Opgeloste bugs

1. **Huiswerk-AI negeerde fouten uit AI-analyse 2.0.** Sinds v34 staan fouten in `categories`, maar de generator las alleen de oude v1-correcties.
2. **Canvasopmaak ging verloren bij synchronisatie en opslaan.** De veilige filter liet alleen kleur en markering door, dus onderstrepen, doorhalen, lettergrootte (en mogelijk vet/cursief als CSS-stijl) verdwenen bij de andere deelnemer. In de browser getest: alles blijft nu behouden.
3. **Kopjes werden als woordenschat gezien.** Woordherkenning zag Kop 2/Kop 3 niet als kop.
4. **Voorbeeldweergave van het canvas in het profiel** las stijlen pas nadat de attributen al waren verwijderd.

## 4. Gemeten vóór en na

`next build`, First Load JS per pagina:

| Pagina | Vóór (main) | Na (v40) | Verschil |
|---|---|---|---|
| / (dashboard) | 306 kB | 226 kB | −80 kB (−26%) |
| /leerlingen | 321 kB | 244 kB | −77 kB |
| /mijn-profiel | 317 kB | 240 kB | −77 kB |
| /oefenen | 317 kB | 240 kB | −77 kB |
| /klaslokaal/live | 327 kB | 250 kB | −77 kB |
| /account, /beheer, /tools | 275–276 kB | 193–194 kB | −82 kB |

- De vertaaltabel is nu een apart bestand van 245 kB, dat alleen laadt bij een andere interfacetaal dan Nederlands.
- Het klaslokaalbestand (`public/legacy/index.html`) werd **groter**: 225 → 265 kB ongecomprimeerd, door de nieuwe werkbalk- en paneelmodules.

**Niet gemeten** (geen echte gebruikersdata of profiler beschikbaar in deze omgeving):
- laadtijden met echte data;
- React-renders;
- geheugengebruik;
- aantallen OpenAI- en Supabase-verzoeken in productie.

De besparingen op AI-aanroepen (vertaalcache per taal en versie, hergebruik van oefeningen, lesonderwerpen zonder extra aanroep, geen AI bij het openen van pagina's) zijn ontwerpmatig en met tests vastgelegd, niet in productie gemeten.

## 5. Databasewijzigingen

Alleen `supabase/v40.sql`: de tabel `analysis_translations` en de functie `can_read_analysis()`. RLS zorgt ervoor dat alleen de docent en de gekoppelde leerling van die relatie de vertaling lezen of opslaan, en alleen voor goedgekeurde analyses. Er is geen update- of delete-policy. De lesonderwerpen staan in de bestaande analyse (`final.lesson_topics`), zonder schemawijziging.

## 6. Geslaagde tests

- Typecheck (`tsc --noEmit`) en `next build`.
- `npm test`: 192 unit-tests en alle databasesuites (PGlite met echte RLS), waaronder nieuw `tests/db/v40.test.mjs` met 14 controles.
- Nieuwe unit-tests: `bilingual`, `homework`, `dashboard-v40`, `classroom-v40`, `vocab-grammar`, `canvas-toolbar`.
- In de browser (lokaal, losse klaslokaalpagina):
  - vier schakelaars en alle combinaties (1 tot 3 panelen, splitter bij 2);
  - mobiel gestapeld zonder overloop;
  - leesbare actieve knoppen;
  - Canvas: onderstrepen, doorhalen, 24 px, Kop 2 blijven behouden na pagina wisselen (dezelfde filter als bij ontvangst);
  - 32 px voor nieuw getypte tekst, getest met echte toetsaanslagen;
  - ⋯-menu boven alles en binnen het venster;
  - de werkbalk past zich aan een smal paneel aan.

## 7. Handmatig testen (met echte accounts en twee apparaten)

1. **Klaslokaal docent + leerling:**
   - opmaak in het canvas komt bij de ander goed aan;
   - Canvas + Bord samen;
   - Scherm verbergen terwijl het delen doorloopt, daarna stoppen via ⋯;
   - Spelletjes openen en sluiten tijdens een spel.
2. **Lessamenvatting als leerling:** schakelaar Portugees/Nederlands; de voorbeeldzinnen blijven onvertaald.
3. **Docent → Lesanalyse:** Lesonderwerpen bevestigen, daarna in Taken "Vanuit mijn les" genereren.
4. **Leerlingdashboard:** de kaarten van "Voor jou klaar", ook met meerdere docenten of talen.
5. **Profielnavigatie op een telefoon:** het "Meer"-menu.
6. **"✨ Woorden" op het canvas** bij A1 en bij B1: bij A1 geen vervoegingen.
7. Het hele klaslokaal in een andere interfacetaal (Engels of Portugees).

De bestaande checklists voor WebRTC en TURN (README-v38) blijven gelden; daar is niets aan veranderd.

## 8. Resterende verbeteringen

- De woordenbank is er alleen voor Nederlands.
- Plus Jakarta Sans geldt in de app. Het klaslokaal (iframe) gebruikt het alleen als het lettertype al op het apparaat staat; anders het systeemlettertype.
- Leerlingen kunnen een vertaalde uitleg niet zelf corrigeren (docenten passen de bron aan, dan volgt automatisch een nieuwe vertaling).
- De dropdown is ingezet in de huiswerkgenerator. Andere native selects (zoals Spelletjes en het docentprofiel) kunnen stap voor stap over.
- Oefeninstructies van gepubliceerd huiswerk worden nog niet tweetalig getoond.

## 9–10. Preview, branch en commit

Zie de laatste regels van de oplevering in de chat (branch `dev/v40-teachyrooms`).
