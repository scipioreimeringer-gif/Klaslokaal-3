// Ingebouwde Nederlandse woordenbank voor 30 Seconds en Taboe (geen AI nodig).
// Eén regel per item:  woord of uitdrukking | verboden woord, verboden woord, verboden woord | korte betekenis (optioneel)
// Niveaus zijn indicatief (ERK). Uitbreiden: regels toevoegen. De ID wordt afgeleid van taal en woord, en blijft
// dus stabiel als een item naar een ander niveau of een andere categorie verhuist. Elk woord komt maar één keer voor.
import type {BankData} from './types.ts';

export const NL: BankData = {
  A1: {
    life: `
hallo | groeten, dag, binnenkomen
dank je wel | bedanken, cadeau, aardig
alsjeblieft | vragen, beleefd, geven
sorry | fout, spijt, excuus
goedemorgen | ochtend, groeten, wakker
welterusten | slapen, nacht, bed
tot ziens | weggaan, groeten, later
gefeliciteerd | verjaardag, feest, taart
beterschap | ziek, gezond, dokter
het weekend | zaterdag, zondag, vrij
het weer | zon, regen, buiten
de buurman | naast, huis, wonen
de afspraak | agenda, tijd, ontmoeten
de boodschappen | supermarkt, kopen, tas
het huis | wonen, deur, dak
de tafel | eten, stoel, poten
de stoel | zitten, tafel, poten
het bed | slapen, kussen, slaapkamer
de deur | open, dicht, sleutel
het raam | glas, kijken, gordijn
de winkel | kopen, geld, verkoper
het geld | betalen, euro, portemonnee
de dokter | ziek, ziekenhuis, patiënt
de telefoon | bellen, mobiel, nummer
de zon | warm, licht, lucht
de regen | nat, paraplu, wolk
de keuken | koken, eten, fornuis
de supermarkt | boodschappen, kopen, kar
de hond | blaffen, huisdier, uitlaten
de kat | miauwen, huisdier, muis
de klok | tijd, uur, wijzers
de badkamer | douche, wassen, toilet
de tandenborstel | poetsen, tandpasta, mond
de jas | winter, aantrekken, koud
de schoen | voet, lopen, veter`,
    food: `
het ontbijt | ochtend, brood, eten
de lunch | middag, eten, boterham
het avondeten | koken, tafel, diner
eet smakelijk | eten, maaltijd, tafel
het brood | bakker, boterham, eten
de kaas | Gouda, geel, melk
de appel | fruit, rood, boom
de koffie | drinken, warm, kopje
de thee | drinken, kopje, zakje
het water | drinken, nat, kraan
de melk | koe, wit, drinken
de banaan | geel, fruit, aap
het ei | kip, ontbijt, koken
de soep | warm, lepel, kom
de aardappel | patat, koken, groente
de boterham | brood, beleg, lunch
het ijsje | koud, zomer, hoorntje
de taart | verjaardag, zoet, bakken
de suiker | zoet, koffie, wit
het zout | peper, zee, smaak`,
    work: `
de school | leerling, leraar, leren
het boek | lezen, bladzijde, schrijver
de les | leraar, klas, leren
de leraar | school, lesgeven, klas
de pen | schrijven, inkt, papier
het kantoor | werken, bureau, computer
de computer | laptop, scherm, internet
de klas | school, leerlingen, lokaal
het huiswerk | school, thuis, opdracht
de baan | werk, geld, beroep`,
    travel: `
de fiets | wiel, trappen, rijden
de auto | rijden, wielen, garage
de trein | station, spoor, reizen
de bus | halte, chauffeur, rijden
de vakantie | reizen, zomer, vrij
het vliegtuig | lucht, piloot, vleugels
de kaart | weg, plattegrond, vinden
de straat | weg, huizen, stoep
het hotel | kamer, slapen, receptie
de zee | water, strand, zout`,
    hobby: `
voetbal | doel, elftal, schoppen
het spel | winnen, bord, dobbelsteen
de film | bioscoop, kijken, acteur
de bal | rond, gooien, schoppen
het zwembad | water, badpak, duiken
de televisie | kijken, programma, zender
het liedje | zingen, muziek, radio
de gitaar | snaren, spelen, muziek`,
    family: `
het kind | jong, ouders, spelen
de moeder | vader, kind, ouder
de vader | moeder, papa, ouder
de broer | zus, familie, jongen
de zus | broer, familie, meisje
de vriend | samen, kennen, maatje
de baby | klein, huilen, luier
de familie | ouders, kinderen, verwanten`,
    verb: `
eten | honger, mond, voedsel
drinken | dorst, glas, water
slapen | bed, nacht, moe
lopen | voeten, wandelen, benen
werken | baan, kantoor, geld
wonen | huis, adres, stad
lezen | boek, tekst, woorden
schrijven | pen, papier, brief
koken | keuken, eten, pan
kopen | winkel, betalen, geld
praten | zeggen, mond, gesprek
luisteren | oren, horen, muziek
zwemmen | water, zwembad, badpak
fietsen | wiel, trappen, sturen
spelen | kinderen, speelgoed, plezier
wachten | tijd, geduld, rij
zingen | lied, muziek, stem
dansen | muziek, feest, bewegen
leren | school, studeren, les
bellen | telefoon, nummer, praten
douchen | water, badkamer, zeep
helpen | hulp, samen, vragen
zoeken | vinden, kwijt, kijken
betalen | geld, kassa, rekening
openen | dicht, deur, sleutel`,
    adjective: `
groot | klein, enorm, maat
klein | groot, mini, kort
warm | koud, zon, heet
koud | warm, winter, ijs
mooi | lelijk, knap, prachtig
lekker | eten, smaak, heerlijk
duur | goedkoop, geld, prijs
goedkoop | duur, geld, prijs
oud | jong, nieuw, leeftijd
nieuw | oud, winkel, net
blij | vrolijk, lachen, gelukkig
moe | slapen, energie, uitgeput
snel | langzaam, vlug, hard
langzaam | snel, slak, rustig
druk | rustig, veel, mensen
leuk | plezier, saai, grappig
ziek | dokter, gezond, koorts
lang | kort, groot, tijd
schoon | vies, wassen, poetsen
vies | schoon, smerig, vuil`,
    abstract: `
de tijd | klok, uur, minuut
de liefde | hart, verliefd, relatie
het plezier | lol, leuk, lachen
de vraag | antwoord, weten, quiz
het idee | denken, plan, bedenken`,
    expression: `
hoe gaat het? | vragen, goed, gezondheid
ik weet het niet | weten, antwoord, idee
een kopje koffie | drinken, warm, café
tot morgen | groeten, dag, later
geen idee | weten, antwoord, vraag
dat klopt | waar, goed, juist
in de buurt | dichtbij, ver, straat
op tijd | laat, vroeg, klok
het maakt niet uit | belangrijk, kiezen, allebei
even wachten | geduld, moment, tijd`,
  },
  A2: {
    life: `
de huur | wonen, betalen, maand
de rekening | betalen, geld, restaurant
de file | auto, snelweg, spits
de spits | druk, ochtend, file
het abonnement | maand, betalen, krant
de huisarts | dokter, ziek, praktijk
de apotheek | medicijnen, recept, pillen
de bibliotheek | boeken, lenen, lezen
het gemeentehuis | paspoort, stad, ambtenaar
de verhuizing | dozen, huis, nieuw
de paraplu | regen, nat, openklappen
de sleutel | deur, slot, openen
de portemonnee | geld, pasjes, tas
de wekker | wakker, ochtend, klok
de koelkast | koud, keuken, melk
de stofzuiger | schoonmaken, vloer, tapijt
de magnetron | opwarmen, keuken, eten
het ziekenhuis | dokter, patiënt, operatie
de krant | nieuws, lezen, papier
de pinpas | betalen, bank, pincode
de buurt | wijk, straat, buren
de tuin | bloemen, gras, buiten
het park | groen, bomen, wandelen
de wasmachine | kleren, wassen, schoon
de vuilniszak | afval, weggooien, container`,
    food: `
de reservering | restaurant, tafel, boeken
de bakker | brood, winkel, taart
het recept | koken, ingrediënten, dokter
de groente | gezond, wortel, sla
het fruit | appel, peer, gezond
de pindakaas | brood, noten, smeren
de hagelslag | brood, chocolade, ontbijt
de stroopwafel | koekje, zoet, Gouda
de patat | friet, mayonaise, aardappel
de ober | restaurant, bestellen, serveren
het menu | kaart, restaurant, kiezen
de fles | glas, drinken, dop
de borrel | drankje, vrijdag, hapjes
het toetje | dessert, zoet, na
de pan | koken, fornuis, steel
het mes | snijden, vork, scherp`,
    work: `
het rooster | school, tijden, les
de vergadering | werk, collega's, overleg
het sollicitatiegesprek | baan, werkgever, vragen
de collega | werk, kantoor, samenwerken
de baas | werk, chef, leiding
het salaris | geld, werk, maand
het examen | toets, slagen, studeren
het diploma | slagen, school, papier
de stage | leren, bedrijf, student
de universiteit | studeren, student, college
het bedrijf | firma, werknemers, kantoor
de klant | kopen, winkel, service`,
    travel: `
het station | trein, perron, reizen
het vliegveld | landen, koffer, reizen
de koffer | reizen, inpakken, kleren
het strand | zee, zand, zon
de berg | hoog, klimmen, sneeuw
de rivier | water, stromen, brug
het paspoort | reizen, grens, foto
het kaartje | trein, kopen, reizen
de camping | tent, kamperen, vakantie
de toerist | vakantie, bezoeken, foto
de grens | land, paspoort, douane
het museum | kunst, schilderij, bezoeken
de ov-chipkaart | inchecken, trein, bus`,
    hobby: `
de muziek | luisteren, liedje, horen
de sportschool | fitness, trainen, gewichten
het concert | muziek, band, podium
de wedstrijd | winnen, spelen, team
het schaatsen | ijs, winter, Elfstedentocht
de hobby | vrije tijd, leuk, doen
het toneel | theater, acteren, podium
de camera | foto, lens, maken
de puzzel | stukjes, oplossen, leggen
tuinieren | planten, bloemen, schoffelen`,
    family: `
de oma | opa, grootmoeder, kleinkind
de opa | oma, grootvader, kleinkind
de neef | familie, oom, tante
de tante | oom, familie, zus
de oom | tante, familie, broer
het verjaardagsfeest | jarig, taart, gasten
de bruiloft | trouwen, bruid, feest
de buren | naast, huis, straat
de vriendin | meisje, samen, liefde
getrouwd | bruiloft, man, vrouw`,
    verb: `
verhuizen | dozen, nieuw, huis
solliciteren | baan, brief, werkgever
onthouden | vergeten, geheugen, weten
vergeten | onthouden, geheugen, kwijt
uitleggen | vertellen, begrijpen, leraar
afspreken | agenda, datum, ontmoeten
bestellen | restaurant, kopen, menu
ruilen | wisselen, geven, winkel
lenen | terugbrengen, geld, bibliotheek
huren | betalen, maand, woning
schoonmaken | poetsen, vies, opruimen
opruimen | rommel, kast, netjes
klagen | ontevreden, zeuren, probleem
verdienen | salaris, geld, werken
sparen | geld, bank, later
reizen | vakantie, koffer, land
verliezen | winnen, kwijt, wedstrijd
winnen | verliezen, prijs, eerste
proberen | poging, testen, oefenen
ontmoeten | kennismaken, mensen, afspraak`,
    adjective: `
gezellig | sfeer, samen, knus
saai | leuk, vervelend, interessant
spannend | film, eng, avontuur
eng | bang, griezelig, spin
verdrietig | huilen, triest, blij
boos | kwaad, woedend, ruzie
zenuwachtig | stress, examen, bang
tevreden | blij, gelukkig, klagen
beleefd | netjes, vriendelijk, alsjeblieft
eerlijk | waarheid, liegen, oprecht
handig | praktisch, nuttig, makkelijk
ingewikkeld | moeilijk, simpel, lastig
lui | werken, bank, moe
nieuwsgierig | vragen, weten, benieuwd
gezond | sporten, groente, ziek`,
    abstract: `
het geluk | blij, toeval, loterij
de angst | bang, eng, schrik
de hoop | wensen, toekomst, verwachten
de vrijheid | mogen, gevangenis, keuze
de herinnering | vroeger, onthouden, geheugen
de droom | slapen, nacht, wens
de kans | mogelijkheid, toeval, loterij
de fout | verkeerd, vergissing, goed`,
    expression: `
zin hebben in | willen, leuk, uitkijken | ergens naar uitkijken, iets graag willen
ik heb haast | snel, tijd, laat
het valt mee | verwacht, slecht, oké | het is minder erg dan je dacht
dat is jammer | helaas, spijt, teleurgesteld
geen zin hebben | willen, lui, motivatie
op vakantie gaan | reizen, weg, zomer
boodschappen doen | supermarkt, kopen, lijstje
de was doen | kleren, wasmachine, schoon
een afspraak maken | agenda, datum, dokter
koffie zetten | apparaat, filter, kopje
in de file staan | auto, snelweg, vast
het eens zijn | mening, akkoord, gelijk | dezelfde mening hebben`,
    saying: `
het is een eitje | makkelijk, simpel, moeite | het is heel makkelijk
de weg kwijt zijn | verdwalen, snappen, verward | niet meer weten hoe het zit
op je tenen lopen | moe, inspannen, zwaar | heel hard je best doen terwijl het eigenlijk te zwaar is
er is geen kip | niemand, leeg, mensen | er is niemand
het regent pijpenstelen | hard, nat, bui | het regent heel hard`,
    proverb: `
tijd is geld | haast, waardevol, verspillen | tijd is kostbaar
beter voorkomen dan genezen | voorzichtig, ziekte, vooraf | het is beter om problemen te voorkomen
alle begin is moeilijk | starten, lastig, eerste | de eerste stap is het moeilijkst`,
  },
  B1: {
    life: `
de wachtlijst | rij, lang, ziekenhuis
de huisregels | afspraken, mogen, verboden
de inburgering | examen, taal, Nederland
de zorgverzekering | ziek, dokter, betalen
de klantenservice | bellen, vragen, klacht
de belasting | betalen, overheid, geld
de gezondheid | ziek, lichaam, fit
het milieu | natuur, vervuiling, klimaat
de verkiezingen | stemmen, partij, politiek
de gemeente | stad, bestuur, burgemeester
de woningnood | huis, tekort, huren
de afvalscheiding | plastic, papier, recyclen`,
    food: `
de maaltijd | eten, ontbijt, diner
de ingrediënten | recept, koken, nodig
de vegetariër | vlees, groente, eten
de allergie | noten, reactie, eten
het dieet | afvallen, gezond, minder
de fooi | ober, extra, restaurant
de kassabon | betalen, winkel, bewijs
de markt | kraampjes, zaterdag, kopen`,
    work: `
het contract | tekenen, werk, afspraak
de opzegtermijn | stoppen, contract, maand
de werkloosheid | baan, uitkering, ontslagen
de vacature | baan, zoeken, solliciteren
de sollicitatiebrief | baan, schrijven, motivatie
het cv | ervaring, opleiding, sollicitatie
de opleiding | studie, school, diploma
de promotie | hoger, functie, salaris
de deadline | tijd, inleveren, laatste
de werkgever | baas, werknemer, bedrijf`,
    travel: `
de bestemming | doel, reis, aankomen
de vertraging | laat, trein, wachten
de overstap | trein, wisselen, perron
de reisverzekering | ziek, vakantie, betalen
het visum | land, paspoort, toestemming
de bezienswaardigheid | toerist, bekijken, beroemd
de jetlag | tijdverschil, moe, vliegen`,
    hobby: `
het vrijwilligerswerk | onbetaald, helpen, vereniging
de vereniging | club, leden, contributie
de marathon | rennen, kilometers, lang
de training | oefenen, coach, sport
het toernooi | wedstrijden, winnen, prijs
de tentoonstelling | museum, kunst, bekijken`,
    family: `
de relatie | partner, samen, liefde
de scheiding | uit elkaar, trouwen, ex
de opvoeding | ouders, kinderen, regels
de schoonmoeder | partner, familie, aangetrouwd
de generatie | leeftijd, ouders, jong
het gezin | ouders, kinderen, thuis`,
    verb: `
overleggen | bespreken, samen, vergadering
beslissen | kiezen, besluit, knoop
voorkomen | vermijden, preventie, ongeluk
beïnvloeden | veranderen, sturen, effect
vergelijken | verschil, hetzelfde, naast
ontwikkelen | groeien, maken, nieuw
ondersteunen | helpen, hulp, achter
waarschuwen | gevaar, voorzichtig, alarm
toegeven | fout, bekennen, gelijk
opgeven | stoppen, doorzetten, moe
zich voorbereiden | plannen, klaar, examen
zich aanpassen | veranderen, wennen, nieuw
onderhandelen | prijs, afspraak, compromis
zich vergissen | fout, verkeerd, denken
herhalen | opnieuw, oefenen, weer
ontdekken | vinden, nieuw, onbekend`,
    adjective: `
betrouwbaar | vertrouwen, eerlijk, zeker
duurzaam | milieu, lang, groen
verplicht | moeten, regel, vrijwillig
zelfstandig | alleen, hulp, onafhankelijk
geduldig | wachten, rustig, kalm
ambitieus | carrière, doel, willen
teleurgesteld | verwachting, verdrietig, jammer
opgelucht | zorgen, blij, eindelijk
behulpzaam | helpen, aardig, vriendelijk
onverwacht | verrassing, plotseling, plannen
verantwoordelijk | taak, plicht, schuld
flexibel | aanpassen, soepel, veranderen`,
    abstract: `
de ervaring | meemaken, kennis, leren
de gewoonte | altijd, routine, vaak
de mening | denken, vinden, standpunt
de oplossing | probleem, antwoord, idee
de verantwoordelijkheid | taak, plicht, zorgen
de vooruitgang | beter, verbeteren, ontwikkeling
de samenleving | mensen, maatschappij, land
het vertrouwen | geloven, eerlijk, relatie
de toekomst | later, morgen, plannen
het nadeel | voordeel, negatief, minpunt
de gelijkheid | hetzelfde, rechten, verschil
de motivatie | zin, willen, doel`,
    expression: `
rekening houden met | denken, aandacht, anderen | aan anderen denken als je iets doet
in de gaten houden | letten, kijken, oppassen | goed opletten
aan de slag gaan | beginnen, werken, starten | met iets beginnen
het eens worden | akkoord, onderhandelen, mening | na overleg dezelfde mening krijgen
op de hoogte zijn | weten, informatie, nieuws | iets weten, geïnformeerd zijn
ergens tegen opzien | bang, moeilijk, liever | iets eng of vervelend vinden dat nog moet gebeuren
iets voor elkaar krijgen | lukken, regelen, slagen | iets moeilijks toch kunnen regelen
zich zorgen maken | piekeren, bang, stress | bang zijn dat er iets mis gaat
de moeite waard | nut, zinvol, investeren | het is goed om het te doen
in het algemeen | meestal, vaak, normaal
van mening veranderen | denken, anders, standpunt
op het laatste moment | nog net, deadline, haast | net voordat het te laat is`,
    saying: `
iets onder de knie hebben | beheersen, oefenen, kunnen | iets goed kunnen na veel oefenen
de knoop doorhakken | beslissen, kiezen, besluit | een moeilijke beslissing nemen
met de deur in huis vallen | direct, meteen, inleiding | meteen zeggen waar het om gaat
de kat uit de boom kijken | afwachten, voorzichtig, eerst | eerst afwachten hoe een situatie zich ontwikkelt
door de mand vallen | betrapt, liegen, ontdekt | ontmaskerd worden
een oogje in het zeil houden | opletten, toezicht, kijken | opletten dat alles goed gaat
iemand in de maling nemen | grap, plagen, foppen | iemand voor de gek houden
de draad weer oppakken | verder, opnieuw, beginnen | weer verdergaan waar je gebleven was
in de war zijn | verward, snappen, begrijpen | niet goed weten wat er aan de hand is
iets op de lange baan schuiven | uitstellen, later, wachten | iets uitstellen
het hoofd koel houden | rustig, kalm, paniek | rustig blijven in een moeilijke situatie
voor de hand liggen | logisch, duidelijk, vanzelfsprekend | heel logisch zijn
een steentje bijdragen | helpen, meedoen, deel | een beetje helpen
het niet zien zitten | geen zin, somber, opgeven | er geen vertrouwen in hebben
op rolletjes lopen | soepel, vlot, probleem | zonder problemen verlopen
met je neus in de boter vallen | geluk, toevallig, precies | precies op het goede moment ergens komen
een gat in de lucht springen | blij, vrolijk, juichen | heel erg blij zijn
uit de lucht vallen | verrast, niets, weten | ergens niets van weten
de spijker op de kop slaan | gelijk, precies, raak | precies het goede zeggen
in het water vallen | mislukken, doorgaan, afgelast | niet doorgaan`,
    proverb: `
oefening baart kunst | trainen, beter, herhalen | door veel te oefenen word je goed
beter laat dan nooit | uiteindelijk, toch, wachten | het is goed dat iets toch gebeurt, ook al is het laat
wie niet waagt, wie niet wint | risico, durven, proberen | wie geen risico neemt, bereikt niets
eind goed, al goed | slot, afloop, gelukkig | als het uiteindelijk goed afloopt, is het niet erg dat er problemen waren
haastige spoed is zelden goed | snel, fouten, rustig | wie te snel werkt, maakt fouten
na regen komt zonneschijn | slecht, beter, weer | na een moeilijke tijd komt een betere tijd
de appel valt niet ver van de boom | ouders, kinderen, lijken | kinderen lijken op hun ouders
wie het laatst lacht, lacht het best | winnen, einde, grappig | wie uiteindelijk wint, heeft het meeste plezier
oost west, thuis best | reizen, eigen, terugkomen | het is nergens zo fijn als thuis`,
  },
  B2: {
    life: `
de thuiswerkdag | laptop, kantoor, online
de kinderopvang | crèche, ouders, werken
de bureaucratie | regels, formulieren, overheid
de bezuiniging | geld, minder, overheid
de vergrijzing | ouderen, bevolking, pensioen
de energierekening | gas, stroom, betalen`,
    food: `
de voedselverspilling | weggooien, eten, afval
de seizoensgroente | zomer, winter, oogst
de biologische landbouw | boer, gif, natuur`,
    work: `
de werkdruk | stress, deadline, overuren
de burn-out | stress, moe, ziek
het pensioen | oud, stoppen, werken
de onderhandeling | afspraak, praten, compromis
het functioneringsgesprek | baas, beoordeling, jaarlijks
de zzp'er | zelfstandig, freelance, opdrachtgever
de reorganisatie | ontslag, veranderen, bedrijf
het netwerk | contacten, kennen, LinkedIn`,
    travel: `
het massatoerisme | drukte, toeristen, Amsterdam
de vliegschaamte | klimaat, trein, schuldgevoel
de reisroute | plannen, weg, kaart`,
    hobby: `
de schilderkunst | verf, kunstenaar, doek
de podcast | luisteren, aflevering, praten`,
    family: `
de mantelzorg | zorgen, familie, ziek
het samengestelde gezin | stiefvader, kinderen, nieuw
het ouderschapsverlof | baby, vrij, werk`,
    verb: `
relativeren | overdrijven, minder, perspectief
benadrukken | belangrijk, herhalen, duidelijk
onderbouwen | argument, bewijs, uitleggen
uitstellen | later, wachten, deadline
overtuigen | argument, mening, eens
afwegen | voordelen, nadelen, kiezen
tegemoetkomen | helpen, compromis, toegeven
zich ergeren | irritant, boos, storen
bekritiseren | kritiek, slecht, mening
vermijden | ontwijken, voorkomen, liever niet`,
    adjective: `
vanzelfsprekend | logisch, normaal, natuurlijk
doorslaggevend | beslissend, belangrijk, uiteindelijk
onvermijdelijk | zeker, gebeuren, voorkomen
kwetsbaar | zwak, gevoelig, pijn
veelzijdig | talent, breed, allround
terughoudend | voorzichtig, afstand, verlegen
uitgebreid | lang, details, compleet
bescheiden | trots, opscheppen, rustig
genuanceerd | precies, zwart-wit, details`,
    abstract: `
het compromis | toegeven, midden, afspraak
het vooroordeel | discriminatie, mening, onterecht
de veerkracht | sterk, tegenslag, doorgaan
de nuance | detail, verschil, precies
de consequentie | gevolg, resultaat, daarom
de prioriteit | belangrijk, eerst, lijst
het dilemma | kiezen, lastig, keuze
de integriteit | eerlijk, betrouwbaar, principes
de discriminatie | ongelijk, behandelen, vooroordeel
de solidariteit | samen, steunen, delen`,
    expression: `
iets ter sprake brengen | onderwerp, praten, noemen | over een onderwerp beginnen
ergens niet omheen kunnen | vermijden, moeten, feit | iets niet kunnen negeren
iets in twijfel trekken | kritisch, geloven, vragen | niet zeker weten of iets klopt
voet bij stuk houden | volhouden, mening, koppig | niet toegeven
de kern van de zaak | belangrijkste, essentie, punt | het belangrijkste
een kwestie van tijd | binnenkort, wachten, zeker | het gebeurt zeker, alleen niet nu
uit de hand lopen | controle, chaos, erger | niet meer te beheersen zijn`,
    saying: `
iemand de wind van voren geven | kritiek, boos, streng | iemand flink de waarheid zeggen
de kool en de geit sparen | kiezen, iedereen, tevreden | het iedereen naar de zin willen maken
tussen wal en schip vallen | hulp, vergeten, regels | nergens bij horen en daardoor geen hulp krijgen
het hart op de tong hebben | eerlijk, direct, zeggen | altijd meteen zeggen wat je denkt
iets door de vingers zien | toestaan, vergeven, oogluikend | een fout niet bestraffen
de boot afhouden | uitstellen, vermijden, nee | iets proberen te vermijden of uit te stellen
het onderspit delven | verliezen, winnen, strijd | verliezen
voet aan de grond krijgen | succes, beginnen, plek | een beetje succes of invloed krijgen
de handdoek in de ring gooien | opgeven, stoppen, boksen | opgeven
iemand een hart onder de riem steken | moed, steunen, troosten | iemand bemoedigen
iets aan de grote klok hangen | vertellen, iedereen, geheim | iets aan iedereen vertellen
zijn hand overspelen | te veel, vragen, verliezen | te veel willen en daardoor verliezen
roet in het eten gooien | verpesten, plan, mislukken | iemands plan verstoren
een kat in de zak kopen | tegenvallen, bedrogen, product | iets kopen dat slechter is dan verwacht
het ijzer smeden als het heet is | kans, meteen, gebruiken | een kans meteen benutten`,
    proverb: `
wie a zegt, moet ook b zeggen | beginnen, afmaken, consequent | als je aan iets begint, moet je het ook afmaken
de beste stuurlui staan aan wal | kritiek, makkelijk, zelf | wie niet meedoet, weet het altijd beter
stille wateren hebben diepe gronden | rustig, verborgen, mensen | rustige mensen hebben vaak meer gedachten dan je denkt
een goed begin is het halve werk | starten, helft, voorbereiding | als je goed begint, gaat de rest makkelijker
geen rook zonder vuur | gerucht, waarheid, reden | elk gerucht heeft wel een kern van waarheid
beter één vogel in de hand dan tien in de lucht | zekerheid, risico, liever | liever iets zekers dan veel onzekers
de aanhouder wint | volhouden, doorzetten, opgeven | wie volhoudt, bereikt zijn doel
wie zijn billen brandt, moet op de blaren zitten | gevolgen, fout, verantwoordelijk | wie een fout maakt, moet de gevolgen dragen`,
  },
};
