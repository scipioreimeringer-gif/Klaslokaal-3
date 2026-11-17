# TeachyRooms v38: rapport

Branch: `dev/v38-improvements` (gebaseerd op v36, commit `8a6f36c`). Niets gemerged naar `main`, geen wijzigingen aan Production.

## Wat moet je doen vóór gebruik

1. **Supabase:** voer `supabase/v38.sql` één keer uit in de SQL Editor, na `v35.sql`. Het script voegt alleen de kolom `game_rounds.bank_ids` en de functie `game_used_bank()` toe. Het verwijdert en wijzigt geen bestaande gegevens, en mag twee keer draaien. Zonder dit script werkt alles behalve rondes uit de woordenbank. Die rondes melden dan "Voer eerst supabase/v38.sql uit".
2. **Vercel Preview:** `TURN_ICE_SERVERS` is al ingesteld en de preview leest de waarde goed in. In het klaslokaal staat "TURN: beschikbaar".
3. **Pas bij de merge naar main (alleen met toestemming):**
   - Zet `TURN_ICE_SERVERS` ook bij de Production-omgeving in Vercel.
   - Trek daarna de oude TURN-gegevens in. Die stonden vroeger openbaar in `public/legacy/index.html` en staan nog in de git-geschiedenis. Gebruik ze niet meer als terugval.

## Wat is er veranderd

### TURN en verbinding (fase 1 en 5)
- TURN-gegevens staan niet meer in de openbare klaslokaalcode. Ze komen uit de servervariabele `TURN_ICE_SERVERS` via `/api/turn?student=…`:
  - alleen voor de ingelogde docent of leerling van dát klaslokaal;
  - niet gecachet (`no-store`).
- De variabele mag kale JSON zijn, de JavaScript-notatie uit het Metered-dashboard, of een heel codevoorbeeld (`new RTCPeerConnection({ iceServers: [...] })`, ook met commentaar). Er wordt nooit code uitgevoerd.
- De status in het klaslokaal laat zien of TURN geladen is, of waarom niet. De waarde zelf wordt nooit getoond.
- Camera: maximaal 640×480, 24 beelden per seconde en 600 kbit/s. Schermdelen heeft geen limiet.
- Met `&relay=1` achter de klaslokaal-URL zet je de TURN-testmodus aan: de verbinding loopt dan alleen via TURN. De verbindingsstatus toont "direct" of "via TURN".

### Klaslokaal (fase 2)
- Eén navigatiebalk onderaan: Video, Canvas, Bord, Slides, Scherm (aan/uit), Spelletjes, Splitsen. De oude rij knoppen bovenaan is weg.
- Splitsen opheffen houdt de kant die het laatst gebruikt is.
- Scherm zonder lopende les, of zonder gedeeld scherm, geeft een melding in plaats van een leeg paneel.
- **De docent blijft in de les als een leerling weggaat.** Alleen de verbinding, het beeld en de schermdeling van die leerling worden opgeruimd:
  - meteen bij Verlaten of het sluiten van het tabblad (afscheidsbericht);
  - na 12 seconden als de verbinding wegvalt.

### Woordenbank (fase 3)
- 514 Nederlandse woorden en uitdrukkingen, verdeeld over de niveaus A1, A2, B1 en B2 (plus "Gemengd").
- Thema's: Dagelijks leven, Eten en drinken, Werk en studie, Reizen, Sport en hobby's, Familie en relaties, Werkwoorden, Bijvoeglijke naamwoorden, Abstracte begrippen, Uitdrukkingen, Gezegdes, Spreekwoorden en Alles.
- Elk item heeft 3 verboden woorden, dus Taboe werkt zonder AI.
- Spelletjes:
  - de bron is te kiezen: woordenlijst van de leerling of woordenbank;
  - bij de woordenbank kies je ook niveau en categorie;
  - alle keuzemenu's hebben dezelfde vorm;
  - AI-aanvulling van verboden woorden bij de eigen woordenlijst is nu optioneel.
- Te weinig woorden: je kunt kiezen voor een kleinere ronde, of stap voor stap breder zoeken. Het spel kiest nooit stilletjes iets anders.
- De woordenbank (26 kB) laadt pas als Spelletjes wordt geopend.

### Lesanalyse en leerlingdashboard (fase 4)
- Het lesverslag voor de leerling is kort:
  - samenvatting van maximaal 2 zinnen;
  - maximaal 3 punten, elk met ❌ gezegd, ✅ beter en 💡 tip;
  - de volledige analyse staat achter "Meer details".
- Nooit getoond:
  - stof uit "Voor later";
  - punten zonder een letterlijke zin van de leerling;
  - de notitie "volgende les".
- De docent ziet in de editor "Zo ziet de leerling het".
- Het leerlingdashboard heeft **"Voor jou klaar"**:
  - gepubliceerd huiswerk dat nog niet is ingeleverd;
  - woorden om te herhalen, met een knop die Flashcards direct opent;
  - het laatste goedgekeurde lesverslag in de korte vorm.

### Prestaties (fase 5)
- pdf.js (313 kB) en PeerJS blokkeren het laden van het klaslokaal niet meer:
  - PeerJS wordt op de achtergrond opgehaald nadat de pagina zichtbaar is;
  - pdf.js wordt pas opgehaald als een pdf wordt geopend, dus leerlingen downloaden het nooit.
- "Voor jou klaar" doet geen eigen databasevragen. Het gebruikt de gegevens die het dashboard al laadt. Dat scheelt 3 tot 4 extra vragen per paginabezoek, plus één per gekoppelde docent.

## Tests

- `npm test`:
  - 145 unit-tests en 424 databasecontroles (PGlite met echte RLS), alle geslaagd.
  - Nieuw in v38: `turn.test.mjs`, `classroom-nav.test.mjs`, `wordbank.test.mjs`, `compact.test.mjs` en `tests/db/v38.test.mjs`.
- `npm run build`: slaagt, inclusief typecontrole.
- Preview-deployments van elke fase: Vercel-status **Ready**.

### Getest in de browser (lokaal)
- Navigatie onderaan op desktop en mobiel (375 px):
  - alle knoppen;
  - Splitsen heen en terug;
  - Scherm zonder les.
- Een pdf openen: pdf.js laadt op dat moment en de slides verschijnen.
- PeerJS wordt na het laden van de pagina opgehaald.
- Er waren geen JavaScript-fouten. De enige 404 is een bestaande ping die alleen buiten TeachyRooms voorkomt.

### Niet getest (moet met echte accounts of twee apparaten)
- Een echte videoverbinding en een relay via TURN. De browser in de app blokkeert WebRTC-verbindingen.
- Een leerling die vertrekt terwijl de docent blijft (zie de checklist hieronder).
- Spelletjes met de woordenbank, het korte lesverslag en "Voor jou klaar" in de preview. Die zit achter de Vercel-login en heeft echte Supabase-gegevens nodig.

## Checklist met twee apparaten

1. Laptop (docent) en telefoon op mobiele data (leerling): deelnemen.
   - Je ziet en hoort elkaar.
   - De verbindingsstatus toont "direct" of "via TURN".
2. Zet op beide apparaten `&relay=1` achter de URL.
   - De status toont "TURN-testmodus" en "verbinding: via TURN".
   - Het beeld werkt.
3. Open op de laptop `chrome://webrtc-internals`.
   - Bij outbound-rtp (video) staat 640×480 en maximaal 24 beelden per seconde.
   - In de testmodus heeft het kandidatenpaar het type `relay`.
4. Laat de leerling op Verlaten klikken: het beeld verdwijnt meteen en de docent blijft in de les.
   - Laat de leerling opnieuw deelnemen: het beeld komt terug.
   - Laat de leerling het tabblad sluiten: het beeld verdwijnt binnen ongeveer 12 seconden.
5. Speel Taboe met de woordenbank, en laat de leerling ook een keer uitleggen.
6. Log in als leerling: controleer "Voor jou klaar", Flashcards oefenen en Lesverslag → Meer details.
7. Kijk na test 2 in het Metered-dashboard of er verbruik is bijgekomen.

## Schatting TURN-verbruik (berekend, niet gemeten)

- Bovengrens per les die volledig via TURN loopt: ongeveer 1,3 Mbit/s.
  - Dit zijn de ingestelde limieten van 600 kbit/s video plus audio, in twee richtingen.
  - Dat is ongeveer 0,6 GB per uur.
- Met Metered Free (20 GB) is dat ruim 30 lesuren per maand die volledig via TURN lopen.
- Verbindingen die direct lukken, tellen niet mee.
- Schermdelen via TURN heeft geen limiet en komt er nog bij.

## Open punten

- De woordenbank is er alleen voor Nederlands. Bij andere talen staat de keuze niet in het menu.
- Nieuwe meldingen in het klaslokaal (zoals "Je leerling heeft de les verlaten") staan nog niet in `public/legacy/i18n.js`. Bij een andere interfacetaal verschijnen ze in het Nederlands.
- Mogelijke besparing op het TURN-verbruik: schermdelen beperken tot 15 beelden per seconde. Tekst blijft daarbij scherp. Dit is niet gedaan, omdat schermdelen bewust geen limiet heeft.
