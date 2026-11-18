// Ingebouwde Nederlandse woordenbank voor 30 Seconds en Taboe (geen AI nodig).
// Eén regel per item:  woord of uitdrukking | verboden woord, verboden woord, verboden woord | korte betekenis (optioneel)
// Niveaus zijn indicatief (ERK). Uitbreiden: regels toevoegen. De ID wordt afgeleid van taal en woord, en blijft
// dus stabiel als een item naar een ander niveau of een andere categorie verhuist. Elk woord komt maar één keer voor.
import type {BankData} from './types.ts';

export const NL: BankData = {
  A1: {
    life: `
hallo | groeten, dag, binnenkomen | | hello
dank je wel | bedanken, cadeau, aardig | | thank you
alsjeblieft | vragen, beleefd, geven | | please; here you are
sorry | fout, spijt, excuus | | sorry
goedemorgen | ochtend, groeten, wakker | | good morning
welterusten | slapen, nacht, bed | | good night (sleep well)
tot ziens | weggaan, groeten, later | | goodbye
gefeliciteerd | verjaardag, feest, taart | | congratulations
beterschap | ziek, gezond, dokter | | get well soon
het weekend | zaterdag, zondag, vrij | | the weekend
het weer | zon, regen, buiten | | the weather
de buurman | naast, huis, wonen | | the neighbour
de afspraak | agenda, tijd, ontmoeten | | the appointment
de boodschappen | supermarkt, kopen, tas | | the groceries
het huis | wonen, deur, dak | | the house
de tafel | eten, stoel, poten | | the table
de stoel | zitten, tafel, poten | | the chair
het bed | slapen, kussen, slaapkamer | | the bed
de deur | open, dicht, sleutel | | the door
het raam | glas, kijken, gordijn | | the window
de winkel | kopen, geld, verkoper | | the shop
het geld | betalen, euro, portemonnee | | the money
de dokter | ziek, ziekenhuis, patiënt | | the doctor
de telefoon | bellen, mobiel, nummer | | the phone
de zon | warm, licht, lucht | | the sun
de regen | nat, paraplu, wolk | | the rain
de keuken | koken, eten, fornuis | | the kitchen
de supermarkt | boodschappen, kopen, kar | | the supermarket
de hond | blaffen, huisdier, uitlaten | | the dog
de kat | miauwen, huisdier, muis | | the cat
de klok | tijd, uur, wijzers | | the clock
de badkamer | douche, wassen, toilet | | the bathroom
de tandenborstel | poetsen, tandpasta, mond | | the toothbrush
de jas | winter, aantrekken, koud | | the coat
de schoen | voet, lopen, veter | | the shoe`,
    food: `
het ontbijt | ochtend, brood, eten | | breakfast
de lunch | middag, eten, boterham | | lunch
het avondeten | koken, tafel, diner | | dinner
eet smakelijk | eten, maaltijd, tafel | | enjoy your meal
het brood | bakker, boterham, eten | | bread
de kaas | Gouda, geel, melk | | cheese
de appel | fruit, rood, boom | | the apple
de koffie | drinken, warm, kopje | | coffee
de thee | drinken, kopje, zakje | | tea
het water | drinken, nat, kraan | | water
de melk | koe, wit, drinken | | milk
de banaan | geel, fruit, aap | | the banana
het ei | kip, ontbijt, koken | | the egg
de soep | warm, lepel, kom | | soup
de aardappel | patat, koken, groente | | the potato
de boterham | brood, beleg, lunch | | the sandwich (slice of bread)
het ijsje | koud, zomer, hoorntje | | the ice cream
de taart | verjaardag, zoet, bakken | | the cake
de suiker | zoet, koffie, wit | | sugar
het zout | peper, zee, smaak | | salt`,
    work: `
de school | leerling, leraar, leren | | the school
het boek | lezen, bladzijde, schrijver | | the book
de les | leraar, klas, leren | | the lesson
de leraar | school, lesgeven, klas | | the teacher
de pen | schrijven, inkt, papier | | the pen
het kantoor | werken, bureau, computer | | the office
de computer | laptop, scherm, internet | | the computer
de klas | school, leerlingen, lokaal | | the class
het huiswerk | school, thuis, opdracht | | homework
de baan | werk, geld, beroep | | the job`,
    travel: `
de fiets | wiel, trappen, rijden | | the bike
de auto | rijden, wielen, garage | | the car
de trein | station, spoor, reizen | | the train
de bus | halte, chauffeur, rijden | | the bus
de vakantie | reizen, zomer, vrij | | the holiday
het vliegtuig | lucht, piloot, vleugels | | the plane
de kaart | weg, plattegrond, vinden | | the map; the card
de straat | weg, huizen, stoep | | the street
het hotel | kamer, slapen, receptie | | the hotel
de zee | water, strand, zout | | the sea`,
    hobby: `
voetbal | doel, elftal, schoppen | | football (soccer)
het spel | winnen, bord, dobbelsteen | | the game
de film | bioscoop, kijken, acteur | | the film
de bal | rond, gooien, schoppen | | the ball
het zwembad | water, badpak, duiken | | the swimming pool
de televisie | kijken, programma, zender | | the television
het liedje | zingen, muziek, radio | | the song
de gitaar | snaren, spelen, muziek | | the guitar`,
    family: `
het kind | jong, ouders, spelen | | the child
de moeder | vader, kind, ouder | | the mother
de vader | moeder, papa, ouder | | the father
de broer | zus, familie, jongen | | the brother
de zus | broer, familie, meisje | | the sister
de vriend | samen, kennen, maatje | | the friend; the boyfriend
de baby | klein, huilen, luier | | the baby
de familie | ouders, kinderen, verwanten | | the (extended) family`,
    animals: `
de koe | melk, boer, gras | | the cow
de vogel | vliegen, veren, nest | | the bird
het paard | rijden, manege, hoef | | the horse
de vis | water, zwemmen, aquarium | | the fish
het varken | roze, boerderij, knorren | | the pig
de muis | klein, kaas, kat | | the mouse
het konijn | oren, wortel, hok | | the rabbit
de eend | water, kwaken, vijver | | the duck`,
    nature: `
de boom | blad, hout, takken | | the tree
de bloem | roos, tuin, ruiken | | the flower
het bos | bomen, wandelen, dieren | | the forest
de lucht | blauw, wolken, hemel | | the sky; the air
de maan | nacht, ster, rond | | the moon
de sneeuw | wit, winter, koud | | snow
de wind | waaien, storm, buiten | | the wind
het gras | groen, maaien, tuin | | grass`,
    feelings: `
de knuffel | omhelzen, armen, lief | | the hug; the cuddly toy
de lach | grappig, mond, vrolijk | | the laugh
de traan | huilen, oog, verdriet | | the tear
het hart | liefde, kloppen, borst | | the heart`,
    verb: `
eten | honger, mond, voedsel | | to eat
drinken | dorst, glas, water | | to drink
slapen | bed, nacht, moe | | to sleep
lopen | voeten, wandelen, benen | | to walk
werken | baan, kantoor, geld | | to work
wonen | huis, adres, stad | | to live (somewhere)
lezen | boek, tekst, woorden | | to read
schrijven | pen, papier, brief | | to write
koken | keuken, eten, pan | | to cook
kopen | winkel, betalen, geld | | to buy
praten | zeggen, mond, gesprek | | to talk
luisteren | oren, horen, muziek | | to listen
zwemmen | water, zwembad, badpak | | to swim
fietsen | wiel, trappen, sturen | | to cycle
spelen | kinderen, speelgoed, plezier | | to play
wachten | tijd, geduld, rij | | to wait
zingen | lied, muziek, stem | | to sing
dansen | muziek, feest, bewegen | | to dance
leren | school, studeren, les | | to learn
bellen | telefoon, nummer, praten | | to call (phone)
douchen | water, badkamer, zeep | | to shower
helpen | hulp, samen, vragen | | to help
zoeken | vinden, kwijt, kijken | | to look for
betalen | geld, kassa, rekening | | to pay
openen | dicht, deur, sleutel | | to open`,
    adjective: `
groot | klein, enorm, maat | | big
klein | groot, mini, kort | | small
warm | koud, zon, heet | | warm
koud | warm, winter, ijs | | cold
mooi | lelijk, knap, prachtig | | beautiful
lekker | eten, smaak, heerlijk | | tasty; nice
duur | goedkoop, geld, prijs | | expensive
goedkoop | duur, geld, prijs | | cheap
oud | jong, nieuw, leeftijd | | old
nieuw | oud, winkel, net | | new
blij | vrolijk, lachen, gelukkig | | happy
moe | slapen, energie, uitgeput | | tired
snel | langzaam, vlug, hard | | fast
langzaam | snel, slak, rustig | | slow
druk | rustig, veel, mensen | | busy
leuk | plezier, saai, grappig | | fun; nice
ziek | dokter, gezond, koorts | | ill
lang | kort, groot, tijd | | long; tall
schoon | vies, wassen, poetsen | | clean
vies | schoon, smerig, vuil | | dirty; disgusting`,
    abstract: `
de tijd | klok, uur, minuut | | time
de liefde | hart, verliefd, relatie | | love
het plezier | lol, leuk, lachen | | fun; pleasure
de vraag | antwoord, weten, quiz | | the question
het idee | denken, plan, bedenken | | the idea`,
    expression: `
hoe gaat het? | vragen, goed, gezondheid | | how are you?
ik weet het niet | weten, antwoord, idee | | I don't know
een kopje koffie | drinken, warm, café | | a cup of coffee
tot morgen | groeten, dag, later | | see you tomorrow
geen idee | weten, antwoord, vraag | | no idea
dat klopt | waar, goed, juist | | that's right
in de buurt | dichtbij, ver, straat | | nearby
op tijd | laat, vroeg, klok | | on time
het maakt niet uit | belangrijk, kiezen, allebei | | it doesn't matter
even wachten | geduld, moment, tijd | | wait a moment`,
  },
  A2: {
    life: `
de huur | wonen, betalen, maand | | the rent
de rekening | betalen, geld, restaurant | | the bill
de file | auto, snelweg, spits | | the traffic jam
de spits | druk, ochtend, file | | the rush hour
het abonnement | maand, betalen, krant | | the subscription
de huisarts | dokter, ziek, praktijk | | the GP (family doctor)
de apotheek | medicijnen, recept, pillen | | the pharmacy
de bibliotheek | boeken, lenen, lezen | | the library
het gemeentehuis | paspoort, stad, ambtenaar | | the town hall
de verhuizing | dozen, huis, nieuw | | the move (house)
de paraplu | regen, nat, openklappen | | the umbrella
de sleutel | deur, slot, openen | | the key
de portemonnee | geld, pasjes, tas | | the wallet
de wekker | wakker, ochtend, klok | | the alarm clock
de koelkast | koud, keuken, melk | | the fridge
de stofzuiger | schoonmaken, vloer, tapijt | | the vacuum cleaner
de magnetron | opwarmen, keuken, eten | | the microwave
het ziekenhuis | dokter, patiënt, operatie | | the hospital
de krant | nieuws, lezen, papier | | the newspaper
de pinpas | betalen, bank, pincode | | the debit card
de buurt | wijk, straat, buren | | the neighbourhood
de tuin | bloemen, gras, buiten | | the garden
het park | groen, bomen, wandelen | | the park
de wasmachine | kleren, wassen, schoon | | the washing machine
de vuilniszak | afval, weggooien, container | | the rubbish bag`,
    food: `
de reservering | restaurant, tafel, boeken | | the reservation
de bakker | brood, winkel, taart | | the baker; the bakery
het recept | koken, ingrediënten, dokter | | the recipe; the prescription
de groente | gezond, wortel, sla | | vegetables
het fruit | appel, peer, gezond | | fruit
de pindakaas | brood, noten, smeren | | peanut butter
de hagelslag | brood, chocolade, ontbijt | | chocolate sprinkles
de stroopwafel | koekje, zoet, Gouda | | the syrup waffle
de patat | friet, mayonaise, aardappel | | chips (French fries)
de ober | restaurant, bestellen, serveren | | the waiter
het menu | kaart, restaurant, kiezen | | the menu
de fles | glas, drinken, dop | | the bottle
de borrel | drankje, vrijdag, hapjes | | drinks (after work)
het toetje | dessert, zoet, na | | dessert
de pan | koken, fornuis, steel | | the pan
het mes | snijden, vork, scherp | | the knife`,
    work: `
het rooster | school, tijden, les | | the timetable
de vergadering | werk, collega's, overleg | | the meeting
het sollicitatiegesprek | baan, werkgever, vragen | | the job interview
de collega | werk, kantoor, samenwerken | | the colleague
de baas | werk, chef, leiding | | the boss
het salaris | geld, werk, maand | | the salary
het examen | toets, slagen, studeren | | the exam
het diploma | slagen, school, papier | | the diploma
de stage | leren, bedrijf, student | | the internship
de universiteit | studeren, student, college | | the university
het bedrijf | firma, werknemers, kantoor | | the company
de klant | kopen, winkel, service | | the customer`,
    travel: `
het station | trein, perron, reizen | | the station
het vliegveld | landen, koffer, reizen | | the airport
de koffer | reizen, inpakken, kleren | | the suitcase
het strand | zee, zand, zon | | the beach
de berg | hoog, klimmen, sneeuw | | the mountain
de rivier | water, stromen, brug | | the river
het paspoort | reizen, grens, foto | | the passport
het kaartje | trein, kopen, reizen | | the ticket
de camping | tent, kamperen, vakantie | | the campsite
de toerist | vakantie, bezoeken, foto | | the tourist
de grens | land, paspoort, douane | | the border
het museum | kunst, schilderij, bezoeken | | the museum
de ov-chipkaart | inchecken, trein, bus | | the public transport card`,
    hobby: `
de muziek | luisteren, liedje, horen | | music
de sportschool | fitness, trainen, gewichten | | the gym
het concert | muziek, band, podium | | the concert
de wedstrijd | winnen, spelen, team | | the match; the competition
het schaatsen | ijs, winter, Elfstedentocht | | ice skating
de hobby | vrije tijd, leuk, doen | | the hobby
het toneel | theater, acteren, podium | | the theatre; the stage
de camera | foto, lens, maken | | the camera
de puzzel | stukjes, oplossen, leggen | | the puzzle
tuinieren | planten, bloemen, schoffelen | | to garden`,
    family: `
de oma | opa, grootmoeder, kleinkind | | grandma
de opa | oma, grootvader, kleinkind | | grandpa
de neef | familie, oom, tante | | the nephew; the cousin
de tante | oom, familie, zus | | the aunt
de oom | tante, familie, broer | | the uncle
het verjaardagsfeest | jarig, taart, gasten | | the birthday party
de bruiloft | trouwen, bruid, feest | | the wedding
de buren | naast, huis, straat | | the neighbours
de vriendin | meisje, samen, liefde | | the friend; the girlfriend
getrouwd | bruiloft, man, vrouw | | married`,
    animals: `
de olifant | slurf, groot, Afrika | | the elephant
de leeuw | koning, manen, brullen | | the lion
de aap | banaan, klimmen, dierentuin | | the monkey
de schildpad | traag, oud, pantser | | the turtle; the tortoise
het schaap | wol, wit, wei | | the sheep
de kip | ei, boerderij, tokken | | the chicken
de spin | web, acht, poten | | the spider
de slang | sissen, gif, kruipen | | the snake`,
    nature: `
het meer | water, zwemmen, groot | | the lake
de wolk | lucht, regen, grijs | | the cloud
de storm | wind, hard, onweer | | the storm
het eiland | zee, water, rondom | | the island
de zonsondergang | avond, rood, horizon | | the sunset
het blad | boom, herfst, groen | | the leaf
de herfst | bladeren, regen, seizoen | | autumn
de lente | bloemen, voorjaar, maart | | spring`,
    feelings: `
het verdriet | huilen, tranen, verlies | | sadness; grief
de schrik | bang, plotseling, hart | | the fright
jaloers | afgunst, willen, ander | | jealous
trots | blij, prestatie, borst | | proud
eenzaam | alleen, vrienden, stil | | lonely
verrast | onverwacht, cadeau, verbaasd | | surprised
de woede | boos, kwaad, ontploffen | | anger`,
    verb: `
verhuizen | dozen, nieuw, huis | | to move (house)
solliciteren | baan, brief, werkgever | | to apply for a job
onthouden | vergeten, geheugen, weten | | to remember
vergeten | onthouden, geheugen, kwijt | | to forget
uitleggen | vertellen, begrijpen, leraar | | to explain
afspreken | agenda, datum, ontmoeten | | to arrange to meet
bestellen | restaurant, kopen, menu | | to order
ruilen | wisselen, geven, winkel | | to exchange; to swap
lenen | terugbrengen, geld, bibliotheek | | to borrow; to lend
huren | betalen, maand, woning | | to rent
schoonmaken | poetsen, vies, opruimen | | to clean
opruimen | rommel, kast, netjes | | to tidy up
klagen | ontevreden, zeuren, probleem | | to complain
verdienen | salaris, geld, werken | | to earn
sparen | geld, bank, later | | to save (money)
reizen | vakantie, koffer, land | | to travel
verliezen | winnen, kwijt, wedstrijd | | to lose
winnen | verliezen, prijs, eerste | | to win
proberen | poging, testen, oefenen | | to try
ontmoeten | kennismaken, mensen, afspraak | | to meet`,
    adjective: `
gezellig | sfeer, samen, knus | | cosy; sociable
saai | leuk, vervelend, interessant | | boring
spannend | film, eng, avontuur | | exciting
eng | bang, griezelig, spin | | scary
verdrietig | huilen, triest, blij | | sad
boos | kwaad, woedend, ruzie | | angry
zenuwachtig | stress, examen, bang | | nervous
tevreden | blij, gelukkig, klagen | | satisfied
beleefd | netjes, vriendelijk, alsjeblieft | | polite
eerlijk | waarheid, liegen, oprecht | | honest; fair
handig | praktisch, nuttig, makkelijk | | handy; useful
ingewikkeld | moeilijk, simpel, lastig | | complicated
lui | werken, bank, moe | | lazy
nieuwsgierig | vragen, weten, benieuwd | | curious
gezond | sporten, groente, ziek | | healthy`,
    abstract: `
het geluk | blij, toeval, loterij | | happiness; luck
de angst | bang, eng, schrik | | fear
de hoop | wensen, toekomst, verwachten | | hope
de vrijheid | mogen, gevangenis, keuze | | freedom
de herinnering | vroeger, onthouden, geheugen | | the memory
de droom | slapen, nacht, wens | | the dream
de kans | mogelijkheid, toeval, loterij | | the chance
de fout | verkeerd, vergissing, goed | | the mistake`,
    expression: `
zin hebben in | willen, leuk, uitkijken | ergens naar uitkijken, iets graag willen | to feel like; to look forward to
ik heb haast | snel, tijd, laat | | I'm in a hurry
het valt mee | verwacht, slecht, oké | het is minder erg dan je dacht | it's not as bad as expected
dat is jammer | helaas, spijt, teleurgesteld | | that's a pity
geen zin hebben | willen, lui, motivatie | | not to feel like it
op vakantie gaan | reizen, weg, zomer | | to go on holiday
boodschappen doen | supermarkt, kopen, lijstje | | to do the shopping
de was doen | kleren, wasmachine, schoon | | to do the laundry
een afspraak maken | agenda, datum, dokter | | to make an appointment
koffie zetten | apparaat, filter, kopje | | to make coffee
in de file staan | auto, snelweg, vast | | to be stuck in traffic
het eens zijn | mening, akkoord, gelijk | dezelfde mening hebben | to agree`,
    saying: `
het is een eitje | makkelijk, simpel, moeite | het is heel makkelijk | it's a piece of cake
de weg kwijt zijn | verdwalen, snappen, verward | niet meer weten hoe het zit | to be lost; to be confused
op je tenen lopen | moe, inspannen, zwaar | heel hard je best doen terwijl het eigenlijk te zwaar is | to push yourself to the limit
er is geen kip | niemand, leeg, mensen | er is niemand | there's nobody around
het regent pijpenstelen | hard, nat, bui | het regent heel hard | it's raining cats and dogs`,
    proverb: `
tijd is geld | haast, waardevol, verspillen | tijd is kostbaar | time is money
beter voorkomen dan genezen | voorzichtig, ziekte, vooraf | het is beter om problemen te voorkomen | prevention is better than cure
alle begin is moeilijk | starten, lastig, eerste | de eerste stap is het moeilijkst | every beginning is difficult`,
  },
  B1: {
    life: `
de wachtlijst | rij, lang, ziekenhuis | | the waiting list
de huisregels | afspraken, mogen, verboden | | the house rules
de inburgering | examen, taal, Nederland | | civic integration (for newcomers)
de zorgverzekering | ziek, dokter, betalen | | health insurance
de klantenservice | bellen, vragen, klacht | | customer service
de belasting | betalen, overheid, geld | | tax
de gezondheid | ziek, lichaam, fit | | health
het milieu | natuur, vervuiling, klimaat | | the environment
de verkiezingen | stemmen, partij, politiek | | the elections
de gemeente | stad, bestuur, burgemeester | | the municipality
de woningnood | huis, tekort, huren | | the housing shortage
de afvalscheiding | plastic, papier, recyclen | | waste separation`,
    food: `
de maaltijd | eten, ontbijt, diner | | the meal
de ingrediënten | recept, koken, nodig | | the ingredients
de vegetariër | vlees, groente, eten | | the vegetarian
de allergie | noten, reactie, eten | | the allergy
het dieet | afvallen, gezond, minder | | the diet
de fooi | ober, extra, restaurant | | the tip
de kassabon | betalen, winkel, bewijs | | the receipt
de markt | kraampjes, zaterdag, kopen | | the market`,
    work: `
het contract | tekenen, werk, afspraak | | the contract
de opzegtermijn | stoppen, contract, maand | | the notice period
de werkloosheid | baan, uitkering, ontslagen | | unemployment
de vacature | baan, zoeken, solliciteren | | the vacancy
de sollicitatiebrief | baan, schrijven, motivatie | | the cover letter
het cv | ervaring, opleiding, sollicitatie | | the CV
de opleiding | studie, school, diploma | | the education; the training
de promotie | hoger, functie, salaris | | the promotion
de deadline | tijd, inleveren, laatste | | the deadline
de werkgever | baas, werknemer, bedrijf | | the employer`,
    travel: `
de bestemming | doel, reis, aankomen | | the destination
de vertraging | laat, trein, wachten | | the delay
de overstap | trein, wisselen, perron | | the transfer (change trains)
de reisverzekering | ziek, vakantie, betalen | | travel insurance
het visum | land, paspoort, toestemming | | the visa
de bezienswaardigheid | toerist, bekijken, beroemd | | the sight (tourist attraction)
de jetlag | tijdverschil, moe, vliegen | | jet lag`,
    hobby: `
het vrijwilligerswerk | onbetaald, helpen, vereniging | | volunteer work
de vereniging | club, leden, contributie | | the club; the association
de marathon | rennen, kilometers, lang | | the marathon
de training | oefenen, coach, sport | | the training session
het toernooi | wedstrijden, winnen, prijs | | the tournament
de tentoonstelling | museum, kunst, bekijken | | the exhibition`,
    family: `
de relatie | partner, samen, liefde | | the relationship
de scheiding | uit elkaar, trouwen, ex | | the divorce
de opvoeding | ouders, kinderen, regels | | the upbringing
de schoonmoeder | partner, familie, aangetrouwd | | the mother-in-law
de generatie | leeftijd, ouders, jong | | the generation
het gezin | ouders, kinderen, thuis | | the family (household)`,
    animals: `
de dierentuin | kooi, leeuw, bezoeken | | the zoo
het huisdier | hond, kat, verzorgen | | the pet
de vlinder | rups, vleugels, kleurig | | the butterfly
de bij | honing, steken, bloem | | the bee
de wolf | huilen, roedel, bos | | the wolf
het hert | gewei, bos, Bambi | | the deer
de kudde | groep, schapen, herder | | the herd; the flock`,
    nature: `
het landschap | uitzicht, natuur, schilderij | | the landscape
de woestijn | zand, heet, droog | | the desert
de vulkaan | lava, uitbarsting, berg | | the volcano
het klimaat | weer, temperatuur, opwarming | | the climate
de overstroming | water, dijk, regen | | the flood
het onweer | bliksem, donder, storm | | the thunderstorm`,
    feelings: `
de stress | druk, spanning, werk | | stress
het heimwee | thuis, missen, verlangen | | homesickness
de schaamte | rood, gênant, fout | | shame
dankbaar | bedanken, blij, waarderen | | grateful
gefrustreerd | boos, mislukken, irritatie | | frustrated
ontroerd | tranen, raken, mooi | | moved (emotionally)`,
    verb: `
overleggen | bespreken, samen, vergadering | | to consult; to discuss
beslissen | kiezen, besluit, knoop | | to decide
voorkomen | vermijden, preventie, ongeluk | | to prevent
beïnvloeden | veranderen, sturen, effect | | to influence
vergelijken | verschil, hetzelfde, naast | | to compare
ontwikkelen | groeien, maken, nieuw | | to develop
ondersteunen | helpen, hulp, achter | | to support
waarschuwen | gevaar, voorzichtig, alarm | | to warn
toegeven | fout, bekennen, gelijk | | to admit; to give in
opgeven | stoppen, doorzetten, moe | | to give up
zich voorbereiden | plannen, klaar, examen | | to prepare (oneself)
zich aanpassen | veranderen, wennen, nieuw | | to adapt
onderhandelen | prijs, afspraak, compromis | | to negotiate
zich vergissen | fout, verkeerd, denken | | to be mistaken
herhalen | opnieuw, oefenen, weer | | to repeat
ontdekken | vinden, nieuw, onbekend | | to discover`,
    adjective: `
betrouwbaar | vertrouwen, eerlijk, zeker | | reliable
duurzaam | milieu, lang, groen | | sustainable
verplicht | moeten, regel, vrijwillig | | compulsory
zelfstandig | alleen, hulp, onafhankelijk | | independent
geduldig | wachten, rustig, kalm | | patient
ambitieus | carrière, doel, willen | | ambitious
teleurgesteld | verwachting, verdrietig, jammer | | disappointed
opgelucht | zorgen, blij, eindelijk | | relieved
behulpzaam | helpen, aardig, vriendelijk | | helpful
onverwacht | verrassing, plotseling, plannen | | unexpected
verantwoordelijk | taak, plicht, schuld | | responsible
flexibel | aanpassen, soepel, veranderen | | flexible`,
    abstract: `
de ervaring | meemaken, kennis, leren | | the experience
de gewoonte | altijd, routine, vaak | | the habit
de mening | denken, vinden, standpunt | | the opinion
de oplossing | probleem, antwoord, idee | | the solution
de verantwoordelijkheid | taak, plicht, zorgen | | responsibility
de vooruitgang | beter, verbeteren, ontwikkeling | | progress
de samenleving | mensen, maatschappij, land | | society
het vertrouwen | geloven, eerlijk, relatie | | trust
de toekomst | later, morgen, plannen | | the future
het nadeel | voordeel, negatief, minpunt | | the disadvantage
de gelijkheid | hetzelfde, rechten, verschil | | equality
de motivatie | zin, willen, doel | | motivation`,
    expression: `
rekening houden met | denken, aandacht, anderen | aan anderen denken als je iets doet | to take into account
in de gaten houden | letten, kijken, oppassen | goed opletten | to keep an eye on
aan de slag gaan | beginnen, werken, starten | met iets beginnen | to get started
het eens worden | akkoord, onderhandelen, mening | na overleg dezelfde mening krijgen | to reach an agreement
op de hoogte zijn | weten, informatie, nieuws | iets weten, geïnformeerd zijn | to be informed; to be up to date
ergens tegen opzien | bang, moeilijk, liever | iets eng of vervelend vinden dat nog moet gebeuren | to dread something
iets voor elkaar krijgen | lukken, regelen, slagen | iets moeilijks toch kunnen regelen | to manage to get something done
zich zorgen maken | piekeren, bang, stress | bang zijn dat er iets mis gaat | to worry
de moeite waard | nut, zinvol, investeren | het is goed om het te doen | worth it
in het algemeen | meestal, vaak, normaal | | in general
van mening veranderen | denken, anders, standpunt | | to change your mind
op het laatste moment | nog net, deadline, haast | net voordat het te laat is | at the last moment`,
    saying: `
iets onder de knie hebben | beheersen, oefenen, kunnen | iets goed kunnen na veel oefenen | to have mastered something
de knoop doorhakken | beslissen, kiezen, besluit | een moeilijke beslissing nemen | to make the decision
met de deur in huis vallen | direct, meteen, inleiding | meteen zeggen waar het om gaat | to get straight to the point
de kat uit de boom kijken | afwachten, voorzichtig, eerst | eerst afwachten hoe een situatie zich ontwikkelt | to wait and see
door de mand vallen | betrapt, liegen, ontdekt | ontmaskerd worden | to be found out
een oogje in het zeil houden | opletten, toezicht, kijken | opletten dat alles goed gaat | to keep an eye on things
iemand in de maling nemen | grap, plagen, foppen | iemand voor de gek houden | to pull someone's leg
de draad weer oppakken | verder, opnieuw, beginnen | weer verdergaan waar je gebleven was | to pick up where you left off
in de war zijn | verward, snappen, begrijpen | niet goed weten wat er aan de hand is | to be confused
iets op de lange baan schuiven | uitstellen, later, wachten | iets uitstellen | to put something on the back burner
het hoofd koel houden | rustig, kalm, paniek | rustig blijven in een moeilijke situatie | to keep a cool head
voor de hand liggen | logisch, duidelijk, vanzelfsprekend | heel logisch zijn | to be obvious
een steentje bijdragen | helpen, meedoen, deel | een beetje helpen | to do your bit
het niet zien zitten | geen zin, somber, opgeven | er geen vertrouwen in hebben | to not see it working out
op rolletjes lopen | soepel, vlot, probleem | zonder problemen verlopen | to go smoothly
met je neus in de boter vallen | geluk, toevallig, precies | precies op het goede moment ergens komen | to arrive at just the right moment
een gat in de lucht springen | blij, vrolijk, juichen | heel erg blij zijn | to jump for joy
uit de lucht vallen | verrast, niets, weten | ergens niets van weten | to be taken by surprise
de spijker op de kop slaan | gelijk, precies, raak | precies het goede zeggen | to hit the nail on the head
in het water vallen | mislukken, doorgaan, afgelast | niet doorgaan | to fall through`,
    proverb: `
oefening baart kunst | trainen, beter, herhalen | door veel te oefenen word je goed | practice makes perfect
beter laat dan nooit | uiteindelijk, toch, wachten | het is goed dat iets toch gebeurt, ook al is het laat | better late than never
wie niet waagt, wie niet wint | risico, durven, proberen | wie geen risico neemt, bereikt niets | nothing ventured, nothing gained
eind goed, al goed | slot, afloop, gelukkig | als het uiteindelijk goed afloopt, is het niet erg dat er problemen waren | all's well that ends well
haastige spoed is zelden goed | snel, fouten, rustig | wie te snel werkt, maakt fouten | more haste, less speed
na regen komt zonneschijn | slecht, beter, weer | na een moeilijke tijd komt een betere tijd | every cloud has a silver lining
de appel valt niet ver van de boom | ouders, kinderen, lijken | kinderen lijken op hun ouders | the apple doesn't fall far from the tree
wie het laatst lacht, lacht het best | winnen, einde, grappig | wie uiteindelijk wint, heeft het meeste plezier | he who laughs last laughs best
oost west, thuis best | reizen, eigen, terugkomen | het is nergens zo fijn als thuis | there's no place like home`,
  },
  B2: {
    life: `
de thuiswerkdag | laptop, kantoor, online | | the work-from-home day
de kinderopvang | crèche, ouders, werken | | childcare
de bureaucratie | regels, formulieren, overheid | | bureaucracy
de bezuiniging | geld, minder, overheid | | the budget cut
de vergrijzing | ouderen, bevolking, pensioen | | the ageing population
de energierekening | gas, stroom, betalen | | the energy bill`,
    food: `
de voedselverspilling | weggooien, eten, afval | | food waste
de seizoensgroente | zomer, winter, oogst | | seasonal vegetables
de biologische landbouw | boer, gif, natuur | | organic farming`,
    work: `
de werkdruk | stress, deadline, overuren | | work pressure
de burn-out | stress, moe, ziek | | burnout
het pensioen | oud, stoppen, werken | | the pension; retirement
de onderhandeling | afspraak, praten, compromis | | the negotiation
het functioneringsgesprek | baas, beoordeling, jaarlijks | | the performance review
de zzp'er | zelfstandig, freelance, opdrachtgever | | the freelancer (self-employed)
de reorganisatie | ontslag, veranderen, bedrijf | | the reorganisation
het netwerk | contacten, kennen, LinkedIn | | the network`,
    travel: `
het massatoerisme | drukte, toeristen, Amsterdam | | mass tourism
de vliegschaamte | klimaat, trein, schuldgevoel | | flight shame
de reisroute | plannen, weg, kaart | | the itinerary`,
    hobby: `
de schilderkunst | verf, kunstenaar, doek | | painting (the art)
de podcast | luisteren, aflevering, praten | | the podcast`,
    family: `
de mantelzorg | zorgen, familie, ziek | | informal care (for a relative)
het samengestelde gezin | stiefvader, kinderen, nieuw | | the blended family
het ouderschapsverlof | baby, vrij, werk | | parental leave`,
    animals: `
de natuurbescherming | milieu, dieren, bedreigd | | nature conservation
de diersoort | uitsterven, natuur, biologie | | the animal species
het roofdier | jagen, prooi, tanden | | the predator
de trekvogel | zuiden, winter, vliegen | | the migratory bird
het insect | zes, poten, kever | | the insect`,
    nature: `
de klimaatverandering | opwarming, aarde, uitstoot | | climate change
de biodiversiteit | soorten, natuur, variatie | | biodiversity
de droogte | regen, dorst, zomer | | the drought
de ecologie | natuur, milieu, wetenschap | | ecology
het natuurgebied | beschermd, wandelen, park | | the nature reserve`,
    feelings: `
de empathie | inleven, begrip, gevoel | | empathy
de wrok | boosheid, vergeven, lang | | resentment
de euforie | uitgelaten, blij, extase | | euphoria
ambivalent | twijfel, tegenstrijdig, gevoelens | | ambivalent
de melancholie | somber, weemoed, verdriet | | melancholy`,
    verb: `
relativeren | overdrijven, minder, perspectief | | to put into perspective
benadrukken | belangrijk, herhalen, duidelijk | | to emphasise
onderbouwen | argument, bewijs, uitleggen | | to substantiate
uitstellen | later, wachten, deadline | | to postpone
overtuigen | argument, mening, eens | | to convince
afwegen | voordelen, nadelen, kiezen | | to weigh up
tegemoetkomen | helpen, compromis, toegeven | | to accommodate; to meet halfway
zich ergeren | irritant, boos, storen | | to be annoyed
bekritiseren | kritiek, slecht, mening | | to criticise
vermijden | ontwijken, voorkomen, liever niet | | to avoid`,
    adjective: `
vanzelfsprekend | logisch, normaal, natuurlijk | | self-evident
doorslaggevend | beslissend, belangrijk, uiteindelijk | | decisive
onvermijdelijk | zeker, gebeuren, voorkomen | | inevitable
kwetsbaar | zwak, gevoelig, pijn | | vulnerable
veelzijdig | talent, breed, allround | | versatile
terughoudend | voorzichtig, afstand, verlegen | | reserved; cautious
uitgebreid | lang, details, compleet | | extensive
bescheiden | trots, opscheppen, rustig | | modest
genuanceerd | precies, zwart-wit, details | | nuanced`,
    abstract: `
het compromis | toegeven, midden, afspraak | | the compromise
het vooroordeel | discriminatie, mening, onterecht | | the prejudice
de veerkracht | sterk, tegenslag, doorgaan | | resilience
de nuance | detail, verschil, precies | | the nuance
de consequentie | gevolg, resultaat, daarom | | the consequence
de prioriteit | belangrijk, eerst, lijst | | the priority
het dilemma | kiezen, lastig, keuze | | the dilemma
de integriteit | eerlijk, betrouwbaar, principes | | integrity
de discriminatie | ongelijk, behandelen, vooroordeel | | discrimination
de solidariteit | samen, steunen, delen | | solidarity`,
    expression: `
iets ter sprake brengen | onderwerp, praten, noemen | over een onderwerp beginnen | to bring something up
ergens niet omheen kunnen | vermijden, moeten, feit | iets niet kunnen negeren | to be unable to ignore something
iets in twijfel trekken | kritisch, geloven, vragen | niet zeker weten of iets klopt | to call something into question
voet bij stuk houden | volhouden, mening, koppig | niet toegeven | to stand your ground
de kern van de zaak | belangrijkste, essentie, punt | het belangrijkste | the heart of the matter
een kwestie van tijd | binnenkort, wachten, zeker | het gebeurt zeker, alleen niet nu | a matter of time
uit de hand lopen | controle, chaos, erger | niet meer te beheersen zijn | to get out of hand`,
    saying: `
iemand de wind van voren geven | kritiek, boos, streng | iemand flink de waarheid zeggen | to give someone a dressing-down
de kool en de geit sparen | kiezen, iedereen, tevreden | het iedereen naar de zin willen maken | to try to please everyone
tussen wal en schip vallen | hulp, vergeten, regels | nergens bij horen en daardoor geen hulp krijgen | to fall through the cracks
het hart op de tong hebben | eerlijk, direct, zeggen | altijd meteen zeggen wat je denkt | to wear your heart on your sleeve
iets door de vingers zien | toestaan, vergeven, oogluikend | een fout niet bestraffen | to turn a blind eye to something
de boot afhouden | uitstellen, vermijden, nee | iets proberen te vermijden of uit te stellen | to stall; to keep something at bay
het onderspit delven | verliezen, winnen, strijd | verliezen | to lose out
voet aan de grond krijgen | succes, beginnen, plek | een beetje succes of invloed krijgen | to gain a foothold
de handdoek in de ring gooien | opgeven, stoppen, boksen | opgeven | to throw in the towel
iemand een hart onder de riem steken | moed, steunen, troosten | iemand bemoedigen | to give someone moral support
iets aan de grote klok hangen | vertellen, iedereen, geheim | iets aan iedereen vertellen | to shout something from the rooftops
zijn hand overspelen | te veel, vragen, verliezen | te veel willen en daardoor verliezen | to overplay your hand
roet in het eten gooien | verpesten, plan, mislukken | iemands plan verstoren | to spoil the fun; to throw a spanner in the works
een kat in de zak kopen | tegenvallen, bedrogen, product | iets kopen dat slechter is dan verwacht | to buy a pig in a poke
het ijzer smeden als het heet is | kans, meteen, gebruiken | een kans meteen benutten | to strike while the iron is hot`,
    proverb: `
wie a zegt, moet ook b zeggen | beginnen, afmaken, consequent | als je aan iets begint, moet je het ook afmaken | in for a penny, in for a pound
de beste stuurlui staan aan wal | kritiek, makkelijk, zelf | wie niet meedoet, weet het altijd beter | it's easy to criticise from the sidelines
stille wateren hebben diepe gronden | rustig, verborgen, mensen | rustige mensen hebben vaak meer gedachten dan je denkt | still waters run deep
een goed begin is het halve werk | starten, helft, voorbereiding | als je goed begint, gaat de rest makkelijker | well begun is half done
geen rook zonder vuur | gerucht, waarheid, reden | elk gerucht heeft wel een kern van waarheid | no smoke without fire
beter één vogel in de hand dan tien in de lucht | zekerheid, risico, liever | liever iets zekers dan veel onzekers | a bird in the hand is worth two in the bush
de aanhouder wint | volhouden, doorzetten, opgeven | wie volhoudt, bereikt zijn doel | perseverance pays off
wie zijn billen brandt, moet op de blaren zitten | gevolgen, fout, verantwoordelijk | wie een fout maakt, moet de gevolgen dragen | you've made your bed, now lie in it`,
  },
};
