// Banco de palavras embutido — português do Brasil (pt-BR), para Flashcards, 30 Seconds e Tabu (sem IA).
// Uma linha por item:  palavra ou expressão | proibida, proibida, proibida | significado em português (opcional) | inglês
// Somente vocabulário brasileiro (ônibus, celular, geladeira, café da manhã…). Níveis indicativos (QECR).
import type {BankData} from './types.ts';

export const PT: BankData = {
  A1: {
    life: `
olá | oi, cumprimentar, chegar | | hello
obrigado | agradecer, favor, gentil | | thank you
por favor | pedir, educado, gentileza | | please
desculpa | erro, perdão, sinto | | sorry
bom dia | manhã, cumprimentar, acordar | | good morning
boa noite | dormir, escuro, lua | | good night; good evening
tchau | adeus, sair, até | | bye
parabéns | aniversário, festa, bolo | | congratulations; happy birthday
a casa | morar, porta, telhado | | the house
a mesa | comer, cadeira, pernas | | the table
a cadeira | sentar, mesa, encosto | | the chair
a cama | dormir, travesseiro, quarto | | the bed
a porta | abrir, fechar, chave | | the door
a janela | vidro, olhar, cortina | | the window
a loja | comprar, dinheiro, vendedor | | the shop
o dinheiro | pagar, real, carteira | | the money
o médico | doente, hospital, consulta | | the doctor
o celular | ligar, telefone, mensagem | | the mobile phone
o sol | quente, luz, céu | | the sun
a chuva | molhado, nuvem, temporal | | the rain
a cozinha | fogão, comida, geladeira | | the kitchen
o mercado | compras, carrinho, caixa | | the supermarket; the market
o banheiro | chuveiro, privada, lavar | | the bathroom
o relógio | hora, tempo, ponteiro | | the clock; the watch
o sapato | pé, andar, cadarço | | the shoe
o casaco | frio, inverno, vestir | | the coat
a rua | carro, calçada, casas | | the street
o fim de semana | sábado, domingo, folga | | the weekend`,
    food: `
o café da manhã | pão, cedo, acordar | | breakfast
o almoço | meio-dia, comer, prato | | lunch
o jantar | noite, comer, mesa | | dinner
bom apetite | comer, refeição, mesa | | enjoy your meal
o pão | padaria, manteiga, francês | | bread
o queijo | leite, amarelo, minas | | cheese
a maçã | fruta, vermelha, árvore | | the apple
o café | beber, xícara, quente | | coffee
o suco | laranja, fruta, copo | | juice
a água | beber, sede, copo | | water
o leite | vaca, branco, beber | | milk
a banana | amarela, fruta, macaco | | the banana
o ovo | galinha, frito, cozido | | the egg
o arroz | feijão, branco, prato | | rice
o feijão | arroz, preto, panela | | beans
a sopa | quente, colher, prato | | soup
o sorvete | gelado, verão, casquinha | | ice cream
o bolo | aniversário, doce, assar | | the cake
o açúcar | doce, café, branco | | sugar
o sal | tempero, mar, pimenta | | salt`,
    work: `
a escola | aluno, professor, aprender | | the school
o livro | ler, páginas, autor | | the book
a aula | professor, sala, aprender | | the lesson; the class
o professor | escola, ensinar, aula | | the teacher
a caneta | escrever, tinta, papel | | the pen
o escritório | trabalhar, mesa, computador | | the office
o computador | tela, internet, teclado | | the computer
o trabalho | emprego, salário, chefe | | work; the job`,
    travel: `
o carro | dirigir, rodas, garagem | | the car
o ônibus | ponto, motorista, passagem | | the bus
o trem | estação, trilho, viagem | | the train
a bicicleta | pedalar, rodas, capacete | | the bike
as férias | viajar, descanso, verão | | the holidays
o avião | voar, aeroporto, piloto | | the plane
o hotel | quarto, dormir, recepção | | the hotel
o mar | água, praia, onda | | the sea
a praia | mar, areia, sol | | the beach`,
    hobby: `
o futebol | bola, gol, time | | football (soccer)
a bola | redonda, chutar, jogar | | the ball
o filme | cinema, assistir, ator | | the film
a música | ouvir, cantar, canção | | music
o jogo | ganhar, regras, tabuleiro | | the game
a televisão | assistir, novela, canal | | the television
o violão | cordas, tocar, música | | the (acoustic) guitar`,
    family: `
a mãe | pai, filho, família | | the mother
o pai | mãe, filho, família | | the father
o irmão | família, menino, mesmo pai | | the brother
a irmã | família, menina, mesma mãe | | the sister
o filho | pai, mãe, criança | | the son
o amigo | colega, juntos, brincar | | the friend
o bebê | pequeno, chorar, fralda | | the baby
a avó | neto, velhinha, família | | the grandmother`,
    animals: `
o cachorro | latir, passear, osso | | the dog
o gato | miar, rato, bigode | | the cat
o peixe | água, nadar, aquário | | the fish
o pássaro | voar, penas, ninho | | the bird
a vaca | leite, fazenda, mugir | | the cow
o cavalo | montar, crina, fazenda | | the horse
o rato | queijo, pequeno, gato | | the mouse; the rat
o porco | rosa, fazenda, lama | | the pig`,
    nature: `
a árvore | folha, tronco, madeira | | the tree
a flor | jardim, rosa, cheiro | | the flower
o céu | azul, nuvem, estrela | | the sky
a lua | noite, estrela, redonda | | the moon
o vento | soprar, ar, frio | | the wind
a montanha | alta, subir, pico | | the mountain
o rio | água, correr, ponte | | the river`,
    feelings: `
feliz | alegre, sorrir, contente | | happy
triste | chorar, lágrima, alegre | | sad
cansado | dormir, sono, energia | | tired
com medo | assustado, susto, escuro | | scared`,
    verb: `
comer | comida, boca, fome | | to eat
beber | água, copo, sede | | to drink
dormir | cama, noite, sono | | to sleep
andar | pé, caminhar, rua | | to walk
trabalhar | emprego, escritório, salário | | to work
morar | casa, endereço, cidade | | to live (somewhere)
ler | livro, palavras, texto | | to read
escrever | caneta, papel, carta | | to write
cozinhar | panela, comida, receita | | to cook
comprar | loja, pagar, dinheiro | | to buy
falar | conversar, boca, dizer | | to speak
ouvir | orelha, escutar, música | | to hear; to listen
nadar | água, piscina, mar | | to swim
brincar | criança, brinquedo, diversão | | to play (children)
esperar | tempo, paciência, fila | | to wait
cantar | música, voz, canção | | to sing
dançar | música, festa, samba | | to dance
aprender | escola, estudar, aula | | to learn
ajudar | apoiar, juntos, favor | | to help
pagar | dinheiro, conta, caixa | | to pay
abrir | fechar, porta, chave | | to open`,
    adjective: `
grande | pequeno, enorme, tamanho | | big
pequeno | grande, mini, baixo | | small
quente | frio, calor, sol | | hot
frio | quente, inverno, gelo | | cold
bonito | feio, lindo, belo | | beautiful; handsome
gostoso | delicioso, sabor, comida | | tasty
caro | barato, dinheiro, preço | | expensive
barato | caro, dinheiro, preço | | cheap
velho | novo, idade, antigo | | old
novo | velho, recente, loja | | new; young
rápido | lento, veloz, correr | | fast
lento | rápido, devagar, tartaruga | | slow
limpo | sujo, lavar, brilhante | | clean
sujo | limpo, lama, lavar | | dirty
doente | médico, febre, saudável | | ill; sick`,
    abstract: `
o tempo | relógio, hora, minuto | | time; weather
o amor | coração, carinho, paixão | | love
a ideia | pensar, plano, cabeça | | the idea
a pergunta | resposta, saber, dúvida | | the question`,
    expression: `
tudo bem? | como vai, está, ótimo | | how are you?; all good?
não sei | saber, resposta, ideia | | I don't know
até amanhã | tchau, dia, depois | | see you tomorrow
com licença | passar, educado, desculpa | | excuse me
estou com fome | comer, barriga, almoço | | I'm hungry
estou com sede | beber, água, garganta | | I'm thirsty
de nada | obrigado, resposta, educado | | you're welcome`,
  },
  A2: {
    life: `
o aluguel | apartamento, pagar, mês | | the rent
a conta | pagar, restaurante, garçom | | the bill
o trânsito | carros, engarrafamento, rua | | traffic
o engarrafamento | trânsito, carros, parado | | the traffic jam
a farmácia | remédio, receita, comprimido | | the pharmacy
a biblioteca | livros, emprestar, ler | | the library
a mudança | caixas, casa, nova | | the move (house)
o guarda-chuva | molhado, abrir, temporal | | the umbrella
a chave | porta, abrir, fechadura | | the key
a carteira | dinheiro, cartão, bolso | | the wallet
o despertador | acordar, manhã, tocar | | the alarm clock
a geladeira | frio, cozinha, comida | | the fridge
o hospital | médico, doente, enfermeira | | the hospital
o jornal | notícia, ler, papel | | the newspaper
o bairro | vizinhos, rua, cidade | | the neighbourhood
o jardim | flores, plantas, grama | | the garden
a máquina de lavar | roupa, sabão, lavanderia | | the washing machine
o lixo | jogar fora, saco, reciclar | | the rubbish`,
    food: `
a reserva | restaurante, mesa, antecedência | | the reservation
a padaria | pão, francês, manhã | | the bakery
a receita | cozinhar, ingredientes, médico | | the recipe; the prescription
os legumes | saudável, cenoura, salada | | vegetables
a fruta | maçã, banana, saudável | | fruit
o brigadeiro | chocolate, festa, doce | | brigadeiro (chocolate sweet)
o pão de queijo | Minas, polvilho, lanche | | cheese bread
a feijoada | feijão, sábado, porco | | feijoada (black bean stew)
o garçom | restaurante, servir, pedido | | the waiter
o cardápio | restaurante, escolher, pratos | | the menu
a garrafa | vidro, beber, tampa | | the bottle
a sobremesa | doce, depois, pudim | | dessert
a panela | cozinhar, fogão, tampa | | the pan
a faca | cortar, garfo, afiada | | the knife
o churrasco | carne, domingo, grelha | | the barbecue`,
    work: `
a reunião | trabalho, colegas, sala | | the meeting
a entrevista de emprego | vaga, perguntas, empresa | | the job interview
o colega | trabalho, escritório, juntos | | the colleague
o chefe | trabalho, patrão, mandar | | the boss
o salário | dinheiro, mês, trabalho | | the salary
a prova | teste, estudar, nota | | the test (exam)
o diploma | formatura, curso, faculdade | | the diploma
o estágio | aprender, empresa, estudante | | the internship
a faculdade | estudar, universidade, curso | | university; college
a empresa | firma, funcionários, escritório | | the company
o cliente | comprar, loja, atendimento | | the customer`,
    travel: `
a estação | trem, plataforma, viagem | | the station
o aeroporto | avião, mala, voo | | the airport
a mala | viagem, roupa, arrumar | | the suitcase
a passagem | ônibus, bilhete, viagem | | the ticket
o passaporte | viajar, fronteira, foto | | the passport
o turista | visitar, foto, férias | | the tourist
a ilha | mar, água, cercada | | the island
o museu | arte, quadro, visitar | | the museum
a cachoeira | água, queda, pedra | | the waterfall
o mapa | caminho, cidade, encontrar | | the map`,
    hobby: `
a academia | malhar, exercício, pesos | | the gym
o show | música, banda, palco | | the concert (show)
a partida | jogo, time, ganhar | | the match
o passatempo | lazer, divertido, tempo livre | | the hobby
o teatro | peça, palco, ator | | the theatre
a câmera | foto, lente, tirar | | the camera
o quebra-cabeça | peças, montar, encaixar | | the jigsaw puzzle
a novela | televisão, capítulo, noite | | the soap opera`,
    family: `
o avô | neto, velho, família | | the grandfather
o primo | tio, família, parente | | the cousin
a tia | tio, família, sobrinho | | the aunt
o tio | tia, família, sobrinha | | the uncle
o casamento | noiva, festa, igreja | | the wedding
o vizinho | ao lado, casa, rua | | the neighbour
a namorada | casal, beijo, paixão | | the girlfriend
casado | casamento, marido, esposa | | married`,
    animals: `
o elefante | tromba, grande, África | | the elephant
o leão | rei, juba, rugir | | the lion
o macaco | banana, árvore, pular | | the monkey
a tartaruga | lenta, casco, velha | | the turtle
a ovelha | lã, branca, fazenda | | the sheep
a galinha | ovo, fazenda, pintinho | | the hen
a aranha | teia, oito, patas | | the spider
a cobra | veneno, rastejar, comprida | | the snake`,
    nature: `
o lago | água, nadar, pequeno | | the lake
a nuvem | céu, chuva, branca | | the cloud
a tempestade | vento, trovão, chuva | | the storm
o pôr do sol | tarde, laranja, horizonte | | the sunset
a folha | árvore, verde, outono | | the leaf
o outono | folhas, estação, março | | autumn
a primavera | flores, estação, setembro | | spring`,
    feelings: `
com ciúmes | inveja, namorado, desconfiado | | jealous
orgulhoso | satisfeito, conquista, peito | | proud
sozinho | ninguém, solidão, isolado | | alone; lonely
surpreso | inesperado, susto, presente | | surprised
a raiva | bravo, irritado, nervoso | | anger
a saudade | falta, lembrar, longe | | longing; missing someone
preocupado | nervoso, problema, ansioso | | worried`,
    verb: `
mudar | casa, trocar, diferente | | to move; to change
lembrar | esquecer, memória, recordar | | to remember
esquecer | lembrar, memória, perder | | to forget
explicar | ensinar, entender, professor | | to explain
pedir | restaurante, solicitar, garçom | | to ask for; to order
trocar | mudar, loja, devolver | | to exchange; to change
emprestar | devolver, livro, dinheiro | | to lend
alugar | apartamento, pagar, carro | | to rent
limpar | sujo, faxina, vassoura | | to clean
reclamar | queixa, problema, insatisfeito | | to complain
economizar | poupar, dinheiro, gastar | | to save (money)
viajar | férias, mala, país | | to travel
perder | ganhar, jogo, achar | | to lose
ganhar | perder, prêmio, vencer | | to win; to earn
tentar | esforço, conseguir, testar | | to try
conhecer | encontrar, pessoa, apresentar | | to meet; to get to know`,
    adjective: `
chato | aborrecido, tédio, irritante | | boring; annoying
legal | bacana, divertido, gostar | | cool; nice
animado | empolgado, feliz, festa | | excited; lively
bravo | zangado, raiva, irritado | | angry
nervoso | ansioso, prova, estresse | | nervous
educado | gentil, obrigado, respeito | | polite
honesto | verdade, mentir, sincero | | honest
prático | útil, fácil, simples | | practical
complicado | difícil, simples, confuso | | complicated
preguiçoso | sofá, trabalhar, dormir | | lazy
curioso | perguntar, saber, interesse | | curious
saudável | verdura, exercício, doente | | healthy`,
    abstract: `
a sorte | azar, loteria, acaso | | luck
o medo | susto, escuro, assustado | | fear
a esperança | futuro, desejar, fé | | hope
a liberdade | livre, prisão, escolha | | freedom
a lembrança | memória, passado, recordar | | the memory; the souvenir
o sonho | dormir, desejo, noite | | the dream
o erro | errado, engano, acertar | | the mistake`,
    expression: `
estar com pressa | rápido, atrasado, correr | | to be in a hurry
que pena | triste, lamentar, infelizmente | | what a pity
tanto faz | importar, escolher, igual | | it doesn't matter
fazer compras | mercado, lista, sacola | | to go shopping
dar certo | funcionar, sucesso, conseguir | | to work out
dar uma olhada | ver, rápido, conferir | | to take a look
ter saudade | sentir falta, longe, lembrar | | to miss someone or something
estar de acordo | concordar, opinião, mesma | | to agree`,
    saying: `
é moleza | fácil, simples, tranquilo | é muito fácil | it's a piece of cake
pagar o pato | culpa, injusto, outro | levar a culpa por algo que não fez | to take the blame
chover canivete | chuva, forte, temporal | chover muito | to rain cats and dogs`,
    proverb: `
tempo é dinheiro | pressa, valor, desperdiçar | o tempo é valioso | time is money
mais vale prevenir do que remediar | cuidado, antes, evitar | é melhor evitar problemas | prevention is better than cure`,
  },
  B1: {
    life: `
a fila de espera | aguardar, hospital, longa | | the waiting list
o plano de saúde | médico, convênio, pagar | | health insurance
o atendimento ao cliente | ligar, reclamação, empresa | | customer service
o imposto | governo, pagar, renda | | tax
a saúde | doença, corpo, médico | | health
o meio ambiente | natureza, poluição, clima | | the environment
as eleições | votar, candidato, política | | the elections
a prefeitura | cidade, governo, municipal | | the city hall`,
    food: `
a refeição | comer, almoço, jantar | | the meal
os ingredientes | receita, cozinhar, misturar | | the ingredients
vegetariano | carne, verdura, salada | | vegetarian
a alergia | reação, espirrar, amendoim | | the allergy
a dieta | emagrecer, saudável, regime | | the diet
a gorjeta | garçom, extra, serviço | | the tip
a feira | barraca, frutas, domingo | | the street market`,
    work: `
o contrato | assinar, trabalho, acordo | | the contract
o desemprego | trabalho, procurar, demissão | | unemployment
a vaga | emprego, anúncio, candidato | | the vacancy
o currículo | experiência, formação, emprego | | the CV
a promoção | cargo, salário, subir | | the promotion
o prazo | entregar, data, limite | | the deadline
o patrão | chefe, empresa, empregado | | the employer; the boss`,
    travel: `
o destino | lugar, chegar, viagem | | the destination
o atraso | tarde, esperar, voo | | the delay
a conexão | voo, trocar, escala | | the connection (flight)
o seguro viagem | doença, exterior, proteção | | travel insurance
o visto | país, passaporte, permissão | | the visa
o ponto turístico | visitar, famoso, foto | | the tourist attraction`,
    hobby: `
o trabalho voluntário | ajudar, sem salário, ONG | | volunteer work
a maratona | correr, quilômetros, longa | | the marathon
o treino | exercício, praticar, academia | | the training session
o campeonato | times, vencer, taça | | the championship
a exposição | museu, arte, quadros | | the exhibition`,
    family: `
o relacionamento | casal, juntos, amor | | the relationship
o divórcio | separar, casamento, ex | | the divorce
a criação | educar, pais, filhos | | the upbringing
a sogra | marido, esposa, família | | the mother-in-law
a geração | idade, pais, jovens | | the generation`,
    animals: `
o zoológico | animais, jaula, visitar | | the zoo
o animal de estimação | cachorro, gato, cuidar | | the pet
a borboleta | lagarta, asas, colorida | | the butterfly
a abelha | mel, picar, flor | | the bee
o lobo | uivar, floresta, matilha | | the wolf`,
    nature: `
a paisagem | vista, natureza, quadro | | the landscape
o deserto | areia, quente, seco | | the desert
o vulcão | lava, erupção, montanha | | the volcano
o clima | tempo, temperatura, aquecimento | | the climate
a enchente | água, chuva, rua alagada | | the flood`,
    feelings: `
o estresse | pressão, tensão, trabalho | | stress
a vergonha | vermelho, constrangido, timidez | | shame; embarrassment
grato | agradecer, obrigado, reconhecer | | grateful
frustrado | decepção, irritado, falhar | | frustrated
emocionado | chorar, tocado, comovido | | moved (emotionally)`,
    verb: `
decidir | escolher, decisão, opção | | to decide
evitar | prevenir, fugir, impedir | | to avoid; to prevent
influenciar | mudar, afetar, opinião | | to influence
comparar | diferença, igual, semelhante | | to compare
desenvolver | crescer, criar, projeto | | to develop
apoiar | ajudar, suporte, ao lado | | to support
avisar | alertar, informar, perigo | | to warn; to let know
desistir | parar, largar, persistir | | to give up
negociar | preço, acordo, combinar | | to negotiate
repetir | outra vez, de novo, praticar | | to repeat
descobrir | encontrar, novo, revelar | | to discover`,
    adjective: `
confiável | seguro, honesto, acreditar | | reliable
sustentável | ambiente, verde, reciclar | | sustainable
obrigatório | dever, regra, opcional | | compulsory
independente | sozinho, livre, autonomia | | independent
paciente | esperar, calma, tranquilo | | patient
ambicioso | objetivo, carreira, querer | | ambitious
decepcionado | expectativa, triste, frustrado | | disappointed
aliviado | preocupação, finalmente, respirar | | relieved`,
    abstract: `
a experiência | vivência, aprender, conhecimento | | the experience
o costume | hábito, sempre, tradição | | the custom; the habit
a opinião | pensar, achar, debate | | the opinion
a solução | problema, resposta, resolver | | the solution
a responsabilidade | dever, cuidar, obrigação | | responsibility
a sociedade | pessoas, comunidade, país | | society
a confiança | acreditar, segurança, amizade | | trust
o futuro | amanhã, depois, planos | | the future`,
    expression: `
levar em conta | considerar, pensar, importante | | to take into account
ficar de olho | vigiar, observar, cuidar | | to keep an eye on
pôr a mão na massa | começar, trabalhar, fazer | | to get down to work
estar por dentro | saber, informado, notícia | | to be in the know
valer a pena | compensar, esforço, bom | | to be worth it
mudar de ideia | opinião, pensar, diferente | | to change your mind
em cima da hora | atrasado, último, prazo | | at the last minute`,
    saying: `
cair a ficha | entender, perceber, finalmente | finalmente entender algo | for the penny to drop
pisar na bola | errar, falhar, decepcionar | cometer um erro | to drop the ball
quebrar o galho | ajudar, resolver, improvisar | ajudar a resolver um problema | to help out in a pinch
encher linguiça | falar, à toa, conteúdo | falar muito sem dizer nada | to waffle
ficar de molho | descansar, casa, doente | ficar em repouso | to rest up
dar com a língua nos dentes | segredo, contar, revelar | contar um segredo | to spill the beans
fazer vista grossa | ignorar, fingir, permitir | fingir que não viu | to turn a blind eye`,
    proverb: `
a prática leva à perfeição | treinar, melhorar, repetir | treinando você fica bom | practice makes perfect
antes tarde do que nunca | atrasado, finalmente, chegar | é bom que aconteça, mesmo tarde | better late than never
quem não arrisca não petisca | coragem, tentar, ganhar | sem correr riscos não se ganha nada | nothing ventured, nothing gained
filho de peixe, peixinho é | pais, parecer, herança | os filhos são parecidos com os pais | like father, like son`,
  },
  B2: {
    life: `
o home office | casa, computador, remoto | | working from home
a creche | crianças, pequenas, cuidar | | the daycare
a burocracia | papelada, carimbo, governo | | bureaucracy
o corte de gastos | economia, reduzir, orçamento | | the budget cut
o envelhecimento da população | idosos, aposentadoria, demografia | | the ageing population`,
    food: `
o desperdício de alimentos | jogar fora, comida, lixo | | food waste
a agricultura orgânica | agrotóxico, natural, plantar | | organic farming`,
    work: `
a carga de trabalho | pressão, prazo, horas extras | | the workload
o esgotamento | cansaço, burnout, estresse | | burnout (exhaustion)
a aposentadoria | idoso, parar, INSS | | retirement; pension
a negociação | acordo, conversar, proposta | | the negotiation
o autônomo | freelancer, independente, cliente | | the self-employed worker`,
    travel: `
o turismo de massa | multidão, lotado, viagem | | mass tourism
o roteiro | planejar, caminho, viagem | | the itinerary`,
    hobby: `
a pintura | quadro, tinta, artista | | painting
o podcast | ouvir, episódio, conversa | | the podcast`,
    family: `
o cuidador | idoso, ajudar, doente | | the caregiver
a licença-maternidade | bebê, trabalho, mãe | | maternity leave`,
    animals: `
a espécie ameaçada | extinção, proteger, rara | | the endangered species
o predador | caçar, presa, dentes | | the predator
a ave migratória | voar, sul, inverno | | the migratory bird`,
    nature: `
a mudança climática | aquecimento, planeta, emissões | | climate change
a biodiversidade | espécies, natureza, variedade | | biodiversity
a seca | chuva, sertão, sede | | the drought
o desmatamento | árvores, Amazônia, cortar | | deforestation`,
    feelings: `
a empatia | colocar-se, compreender, sentimento | | empathy
o rancor | mágoa, perdoar, guardar | | resentment
a euforia | alegria, empolgação, extrema | | euphoria
a melancolia | tristeza, nostalgia, sombrio | | melancholy`,
    verb: `
relativizar | exagerar, perspectiva, menos | | to put into perspective
enfatizar | destacar, importante, repetir | | to emphasise
fundamentar | argumento, provas, justificar | | to substantiate
adiar | depois, prazo, atrasar | | to postpone
convencer | argumento, persuadir, opinião | | to convince
criticar | julgar, falar mal, opinião | | to criticise`,
    adjective: `
evidente | óbvio, claro, notar | | evident
decisivo | crucial, importante, final | | decisive
inevitável | certo, acontecer, impedir | | inevitable
vulnerável | frágil, fraco, sensível | | vulnerable
versátil | talentoso, flexível, várias | | versatile
modesto | humilde, simples, orgulho | | modest`,
    abstract: `
o preconceito | discriminação, julgar, injusto | | prejudice
a resiliência | superar, força, dificuldade | | resilience
a consequência | resultado, efeito, causa | | the consequence
a prioridade | importante, primeiro, lista | | the priority
o dilema | escolher, difícil, opção | | the dilemma
a solidariedade | ajudar, juntos, apoio | | solidarity`,
    expression: `
trazer à tona | revelar, assunto, mencionar | | to bring to light
colocar em dúvida | questionar, duvidar, desconfiar | | to call into question
bater o pé | insistir, teimoso, não ceder | | to dig your heels in
uma questão de tempo | logo, esperar, certamente | | a matter of time
sair do controle | caos, descontrolado, pior | | to get out of hand`,
    saying: `
pôr lenha na fogueira | piorar, briga, provocar | piorar uma situação | to add fuel to the fire
chutar o balde | desistir, raiva, largar tudo | desistir de tudo com raiva | to say "to hell with it"
tirar o cavalinho da chuva | desistir, esperança, esquecer | desistir de uma expectativa | don't count on it
ficar em cima do muro | indeciso, neutro, escolher | não tomar partido | to sit on the fence
matar dois coelhos com uma cajadada só | eficiente, simultâneo, vantagem | resolver duas coisas de uma vez | to kill two birds with one stone
custar os olhos da cara | caro, preço, dinheiro | ser muito caro | to cost an arm and a leg`,
    proverb: `
de grão em grão a galinha enche o papo | pouco, paciência, aos poucos | pequenos passos levam ao objetivo | little by little you get there
quem tem boca vai a Roma | perguntar, caminho, chegar | quem pergunta encontra o caminho | if you ask, you'll find your way
água mole em pedra dura tanto bate até que fura | persistência, insistir, conseguir | a persistência vence | persistence pays off
em boca fechada não entra mosquito | silêncio, calar, falar | às vezes é melhor ficar calado | silence is golden`,
  },
};
