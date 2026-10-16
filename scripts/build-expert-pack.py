"""Genera il pacchetto di serie «Sfida da esperti» e assegna la difficoltà ai pacchetti esistenti.
   python scripts/build-expert-pack.py
Domande originali. Nelle domande a scelta multipla la risposta giusta è la prima: il server rimescola le opzioni.
Difficoltà: 1 facile · 2 media · 3 difficile (la Piramide sale da 2 a 3)."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, 'server', 'data', 'packs')

CATEGORIES = [
    {"id": "geo", "name": "Geografia per esperti", "icon": "🧭", "color": "#2a9d8f"},
    {"id": "sto", "name": "Storia per esperti", "icon": "⚔️", "color": "#b5838d"},
    {"id": "sci", "name": "Scienza per esperti", "icon": "⚛️", "color": "#4361ee"},
    {"id": "art", "name": "Arte & Letteratura", "icon": "🖋️", "color": "#e9a800"},
    {"id": "cin", "name": "Cinema & Serie", "icon": "🎞️", "color": "#e63946"},
    {"id": "mus", "name": "Musica per esperti", "icon": "🎼", "color": "#9d4edd"},
    {"id": "spo", "name": "Sport per esperti", "icon": "🏅", "color": "#f77f00"},
    {"id": "lin", "name": "Parole difficili", "icon": "📚", "color": "#43aa8b"},
    {"id": "mit", "name": "Miti e leggende", "icon": "🏺", "color": "#6a4c93"},
    {"id": "tec", "name": "Tecnologia e invenzioni", "icon": "🔧", "color": "#4cc9f0"},
]

# (categoria, difficoltà, domanda, giusta, sbagliata1, sbagliata2, sbagliata3)
Q = [
    # ------------------------------------------------------------- geografia
    ("geo", 3, "Qual è la capitale del Kazakistan?", "Astana", "Almaty", "Biškek", "Taškent"),
    ("geo", 3, "Qual è il lago più profondo del mondo?", "Bajkal", "Tanganica", "Mar Caspio", "Lago Superiore"),
    ("geo", 3, "Quale fiume attraversa Baghdad?", "Tigri", "Eufrate", "Giordano", "Nilo"),
    ("geo", 2, "Qual è la capitale della Nuova Zelanda?", "Wellington", "Auckland", "Christchurch", "Hamilton"),
    ("geo", 3, "Dove si trova il punto più basso delle terre emerse?", "Sulle rive del Mar Morto", "Nella Valle della Morte", "Nella depressione di Qattara", "Sul lago Assal"),
    ("geo", 3, "Di quale Stato africano è capitale Ouagadougou?", "Burkina Faso", "Mali", "Niger", "Senegal"),
    ("geo", 3, "Qual è il fiume più lungo d'Europa?", "Volga", "Danubio", "Reno", "Dnepr"),
    ("geo", 2, "In quale Paese si trova gran parte del deserto di Atacama?", "Cile", "Perù", "Argentina", "Bolivia"),
    ("geo", 2, "Quale stretto separa l'Asia dall'America?", "Stretto di Bering", "Stretto di Magellano", "Stretto di Hormuz", "Stretto di Malacca"),
    ("geo", 3, "Qual è il Paese più popoloso dell'Africa?", "Nigeria", "Etiopia", "Egitto", "Repubblica Democratica del Congo"),
    ("geo", 2, "Quale città calabrese si affaccia sullo Stretto di Messina?", "Reggio Calabria", "Catanzaro", "Cosenza", "Crotone"),
    ("geo", 3, "Qual è la regione italiana più estesa?", "Sicilia", "Piemonte", "Sardegna", "Lombardia"),
    ("geo", 2, "Qual è il capoluogo del Molise?", "Campobasso", "Isernia", "Termoli", "Pescara"),
    ("geo", 3, "Qual è il lago più grande dell'Africa?", "Lago Vittoria", "Lago Tanganica", "Lago Ciad", "Lago Malawi"),
    ("geo", 3, "Quale Paese ha il maggior numero di fusi orari, contando i territori d'oltremare?", "Francia", "Russia", "Stati Uniti", "Regno Unito"),
    # ------------------------------------------------------------- storia
    ("sto", 2, "In che anno si combatté la battaglia di Waterloo?", "1815", "1805", "1812", "1821"),
    ("sto", 2, "Quale re di Francia fu ghigliottinato nel 1793?", "Luigi XVI", "Luigi XIV", "Luigi XV", "Carlo X"),
    ("sto", 3, "Quale imperatore fece costruire il vallo nel nord della Britannia a partire dal 122 d.C.?", "Adriano", "Traiano", "Claudio", "Antonino Pio"),
    ("sto", 3, "In che anno furono firmati i Trattati di Roma che istituirono la CEE?", "1957", "1951", "1962", "1949"),
    ("sto", 3, "Chi fu il primo Capo provvisorio dello Stato della Repubblica Italiana?", "Enrico De Nicola", "Luigi Einaudi", "Alcide De Gasperi", "Giovanni Gronchi"),
    ("sto", 2, "In quale città fu assassinato l'arciduca Francesco Ferdinando nel 1914?", "Sarajevo", "Vienna", "Belgrado", "Budapest"),
    ("sto", 3, "Quale dinastia regnò sul Regno delle Due Sicilie?", "Borbone", "Savoia", "Asburgo", "Angiò"),
    ("sto", 2, "Quale condottiero cartaginese attraversò le Alpi con gli elefanti?", "Annibale", "Amilcare", "Asdrubale", "Scipione"),
    ("sto", 3, "In che anno Costantinopoli cadde in mano agli Ottomani?", "1453", "1492", "1204", "1389"),
    ("sto", 2, "Chi fu l'ultimo zar di Russia?", "Nicola II", "Alessandro III", "Pietro il Grande", "Alessandro II"),
    ("sto", 3, "Quale papa bandì la prima crociata nel 1095?", "Urbano II", "Gregorio VII", "Innocenzo III", "Bonifacio VIII"),
    ("sto", 3, "Come si chiamava la nave del viaggio di Charles Darwin?", "Beagle", "Endeavour", "Bounty", "Victoria"),
    ("sto", 2, "In che anno si dissolse l'Unione Sovietica?", "1991", "1989", "1993", "1985"),
    ("sto", 3, "Quale battaglia del 1571 vide la flotta della Lega Santa sconfiggere quella ottomana?", "Lepanto", "Azio", "Trafalgar", "Salamina"),
    ("sto", 3, "Chi era il presidente degli Stati Uniti durante la crisi dei missili di Cuba?", "John F. Kennedy", "Dwight Eisenhower", "Lyndon Johnson", "Richard Nixon"),
    # ------------------------------------------------------------- scienza
    ("sci", 2, "Qual è il simbolo chimico del potassio?", "K", "P", "Po", "Pt"),
    ("sci", 3, "Quanti sono i pianeti nani riconosciuti dall'Unione Astronomica Internazionale?", "5", "3", "8", "1"),
    ("sci", 2, "Qual è l'unità di misura della frequenza?", "Hertz", "Newton", "Pascal", "Joule"),
    ("sci", 3, "Chi propose il modello atomico detto «a panettone»?", "J. J. Thomson", "Ernest Rutherford", "Niels Bohr", "John Dalton"),
    ("sci", 3, "Qual è l'osso più piccolo del corpo umano?", "Staffa", "Incudine", "Martello", "Ioide"),
    ("sci", 3, "Quale gas nobile è il più abbondante nell'atmosfera terrestre?", "Argon", "Neon", "Elio", "Xeno"),
    ("sci", 3, "Come si chiama la costante che vale circa 6,022 × 10²³?", "Numero di Avogadro", "Costante di Planck", "Costante di Boltzmann", "Costante di Faraday"),
    ("sci", 3, "Chi scoprì la radioattività naturale nel 1896?", "Henri Becquerel", "Marie Curie", "Ernest Rutherford", "Wilhelm Röntgen"),
    ("sci", 2, "Quale organello produce la maggior parte dell'energia della cellula?", "Mitocondrio", "Ribosoma", "Lisosoma", "Apparato di Golgi"),
    ("sci", 2, "Qual è il numero atomico del carbonio?", "6", "12", "8", "14"),
    ("sci", 2, "Quale vitamina è chiamata anche acido ascorbico?", "Vitamina C", "Vitamina B12", "Vitamina D", "Vitamina E"),
    ("sci", 3, "Come si chiama il passaggio diretto dallo stato solido a quello gassoso?", "Sublimazione", "Evaporazione", "Condensazione", "Fusione"),
    ("sci", 2, "Intorno a quale pianeta orbita Titano?", "Saturno", "Giove", "Urano", "Nettuno"),
    ("sci", 3, "Qual è la luna più grande del Sistema solare?", "Ganimede", "Titano", "Callisto", "Io"),
    ("sci", 3, "Quale scienziato italiano guidò la prima reazione nucleare a catena controllata, nel 1942?", "Enrico Fermi", "Ettore Majorana", "Emilio Segrè", "Bruno Pontecorvo"),
    ("sci", 3, "Quale legge afferma che, a temperatura costante, pressione e volume di un gas sono inversamente proporzionali?", "Legge di Boyle", "Legge di Charles", "Legge di Avogadro", "Legge di Hooke"),
    # ------------------------------------------------------------- arte e letteratura
    ("art", 2, "Chi ha scritto «Il Principe»?", "Niccolò Machiavelli", "Francesco Guicciardini", "Baldassarre Castiglione", "Tommaso Moro"),
    ("art", 2, "Chi dipinse «La Primavera» conservata agli Uffizi?", "Sandro Botticelli", "Raffaello", "Leonardo da Vinci", "Tiziano"),
    ("art", 2, "Chi scrisse «L'infinito»?", "Giacomo Leopardi", "Ugo Foscolo", "Giosuè Carducci", "Giovanni Pascoli"),
    ("art", 2, "Chi è l'autore de «Il fu Mattia Pascal»?", "Luigi Pirandello", "Italo Svevo", "Gabriele D'Annunzio", "Giovanni Verga"),
    ("art", 2, "Quale pittore dipinse «Guernica»?", "Pablo Picasso", "Salvador Dalí", "Joan Miró", "Francisco Goya"),
    ("art", 3, "Chi ha scritto «Cent'anni di solitudine»?", "Gabriel García Márquez", "Jorge Luis Borges", "Isabel Allende", "Mario Vargas Llosa"),
    ("art", 3, "In quale museo è esposta «La ronda di notte» di Rembrandt?", "Rijksmuseum di Amsterdam", "Louvre di Parigi", "Museo del Prado", "National Gallery di Londra"),
    ("art", 3, "Chi scolpì «Apollo e Dafne» della Galleria Borghese?", "Gian Lorenzo Bernini", "Antonio Canova", "Michelangelo", "Donatello"),
    ("art", 3, "Chi è l'autore de «La coscienza di Zeno»?", "Italo Svevo", "Luigi Pirandello", "Alberto Moravia", "Cesare Pavese"),
    ("art", 2, "Chi scrisse la poesia «X Agosto»?", "Giovanni Pascoli", "Giacomo Leopardi", "Giosuè Carducci", "Eugenio Montale"),
    ("art", 2, "Chi ha scritto «Guerra e pace»?", "Lev Tolstoj", "Fëdor Dostoevskij", "Anton Čechov", "Ivan Turgenev"),
    ("art", 2, "Chi dipinse «La persistenza della memoria», con gli orologi molli?", "Salvador Dalí", "René Magritte", "Max Ernst", "Joan Miró"),
    ("art", 3, "Quale poeta, autore di «Ossi di seppia», vinse il Nobel nel 1975?", "Eugenio Montale", "Salvatore Quasimodo", "Giuseppe Ungaretti", "Umberto Saba"),
    ("art", 3, "Quale opera giovanile di Dante alterna prosa e poesia ed è dedicata a Beatrice?", "Vita nova", "Convivio", "De vulgari eloquentia", "Monarchia"),
    ("art", 3, "Chi affrescò la Cappella degli Scrovegni a Padova?", "Giotto", "Masaccio", "Cimabue", "Piero della Francesca"),
    ("art", 3, "In quale città è ambientato l'«Ulisse» di James Joyce?", "Dublino", "Londra", "Trieste", "Parigi"),
    # ------------------------------------------------------------- cinema e serie
    ("cin", 3, "Quale film vinse il primo Oscar al miglior film?", "Ali (Wings)", "Metropolis", "Il cantante di jazz", "Aurora"),
    ("cin", 2, "Chi ha diretto «2001: Odissea nello spazio»?", "Stanley Kubrick", "Steven Spielberg", "Ridley Scott", "George Lucas"),
    ("cin", 3, "Quale attore ha vinto più Oscar come miglior attore protagonista?", "Daniel Day-Lewis", "Jack Nicholson", "Marlon Brando", "Tom Hanks"),
    ("cin", 3, "In quale film di Sergio Leone si sente «L'estasi dell'oro»?", "Il buono, il brutto, il cattivo", "Per un pugno di dollari", "C'era una volta il West", "Giù la testa"),
    ("cin", 2, "Chi interpretò il Joker ne «Il cavaliere oscuro» del 2008?", "Heath Ledger", "Joaquin Phoenix", "Jack Nicholson", "Jared Leto"),
    ("cin", 2, "Chi diresse «Ladri di biciclette»?", "Vittorio De Sica", "Roberto Rossellini", "Federico Fellini", "Luchino Visconti"),
    ("cin", 3, "Come si chiama l'albergo di «Shining»?", "Overlook Hotel", "Bates Motel", "Grand Budapest Hotel", "Hotel Continental"),
    ("cin", 3, "Quale film di Hayao Miyazaki vinse l'Oscar al miglior film d'animazione?", "La città incantata", "Il mio vicino Totoro", "Principessa Mononoke", "Il castello errante di Howl"),
    ("cin", 3, "In «Casablanca», come si chiama il locale di Rick?", "Rick's Café Américain", "Moulin Rouge", "Copacabana", "Blue Parrot"),
    ("cin", 2, "Chi diresse «Il Gattopardo» del 1963?", "Luchino Visconti", "Federico Fellini", "Michelangelo Antonioni", "Pier Paolo Pasolini"),
    ("cin", 2, "Quante stagioni ha «Breaking Bad»?", "5", "4", "6", "7"),
    ("cin", 2, "In quale serie compare il pubblicitario Don Draper?", "Mad Men", "Suits", "I Soprano", "Boardwalk Empire"),
    ("cin", 3, "Quale film ha vinto 11 Oscar, come «Titanic» e «Ben-Hur»?", "Il Signore degli Anelli - Il ritorno del re", "Avatar", "Il Padrino", "La La Land"),
    ("cin", 2, "Chi interpretò Mary Poppins nel film del 1964?", "Julie Andrews", "Audrey Hepburn", "Judy Garland", "Emily Blunt"),
    ("cin", 3, "Quale regista italiano ha vinto l'Oscar per «Mediterraneo»?", "Gabriele Salvatores", "Giuseppe Tornatore", "Roberto Benigni", "Nanni Moretti"),
    # ------------------------------------------------------------- musica
    ("mus", 2, "Chi compose «Le nozze di Figaro»?", "Wolfgang Amadeus Mozart", "Gioachino Rossini", "Giuseppe Verdi", "Antonio Salieri"),
    ("mus", 2, "Chi compose «Il barbiere di Siviglia» del 1816?", "Gioachino Rossini", "Wolfgang Amadeus Mozart", "Gaetano Donizetti", "Vincenzo Bellini"),
    ("mus", 2, "Quante sinfonie completò Beethoven?", "9", "7", "10", "12"),
    ("mus", 2, "Quale strumento suonava Niccolò Paganini?", "Violino", "Pianoforte", "Violoncello", "Chitarra"),
    ("mus", 3, "Da quale opera è tratta l'aria «Nessun dorma»?", "Turandot", "Tosca", "La bohème", "Madama Butterfly"),
    ("mus", 3, "Quale gruppo pubblicò l'album «OK Computer» nel 1997?", "Radiohead", "Oasis", "Blur", "Muse"),
    ("mus", 3, "Chi vinse il primo Festival di Sanremo nel 1951?", "Nilla Pizzi", "Domenico Modugno", "Claudio Villa", "Mina"),
    ("mus", 2, "Quale cantautore scrisse «Bocca di rosa»?", "Fabrizio De André", "Francesco Guccini", "Francesco De Gregori", "Luigi Tenco"),
    ("mus", 2, "In che anno morì Freddie Mercury?", "1991", "1987", "1995", "1989"),
    ("mus", 2, "Chi compose il balletto «Il lago dei cigni»?", "Pëtr Il'ič Čajkovskij", "Sergej Rachmaninov", "Igor' Stravinskij", "Sergej Prokof'ev"),
    ("mus", 2, "Quale band pubblicò l'album «The Wall» nel 1979?", "Pink Floyd", "Genesis", "Queen", "The Who"),
    ("mus", 3, "Come si chiama una scala di cinque note?", "Pentatonica", "Cromatica", "Esatonale", "Diatonica"),
    ("mus", 3, "Chi cantò «Almeno tu nell'universo» a Sanremo 1989?", "Mia Martini", "Loredana Bertè", "Mina", "Patty Pravo"),
    ("mus", 3, "Quale trombettista jazz era soprannominato «Satchmo»?", "Louis Armstrong", "Duke Ellington", "Miles Davis", "Dizzy Gillespie"),
    ("mus", 3, "Quale compositore scrisse la «Messa da requiem» in memoria di Alessandro Manzoni?", "Giuseppe Verdi", "Giacomo Puccini", "Gioachino Rossini", "Pietro Mascagni"),
    # ------------------------------------------------------------- sport
    ("spo", 3, "Quale nazionale vinse il primo Mondiale di calcio, nel 1930?", "Uruguay", "Argentina", "Brasile", "Italia"),
    ("spo", 3, "Quanti Tour de France ha vinto Eddy Merckx?", "5", "4", "6", "7"),
    ("spo", 2, "In quale sport si assegna la Stanley Cup?", "Hockey su ghiaccio", "Baseball", "Football americano", "Basket"),
    ("spo", 3, "Quale tennista è stato il primo uomo a vincere 24 titoli del Grande Slam?", "Novak Djokovic", "Rafael Nadal", "Roger Federer", "Pete Sampras"),
    ("spo", 3, "Chi vinse il primo campionato mondiale di Formula 1, nel 1950?", "Giuseppe Farina", "Juan Manuel Fangio", "Alberto Ascari", "Stirling Moss"),
    ("spo", 2, "Quanti punti vale un touchdown nel football americano?", "6", "7", "3", "5"),
    ("spo", 3, "Qual è la gara di nuoto in piscina più lunga alle Olimpiadi?", "1500 metri stile libero", "800 metri stile libero", "400 metri misti", "3000 metri stile libero"),
    ("spo", 2, "Quale squadra italiana ha vinto più Champions League/Coppe dei Campioni?", "Milan", "Inter", "Juventus", "Roma"),
    ("spo", 3, "Chi vinse il Pallone d'Oro nel 2006?", "Fabio Cannavaro", "Andrea Pirlo", "Zinedine Zidane", "Ronaldinho"),
    ("spo", 3, "In quale sport si usa il termine «albatross»?", "Golf", "Tennis", "Cricket", "Vela"),
    ("spo", 2, "Quante prove compongono il decathlon?", "10", "7", "8", "12"),
    ("spo", 2, "In che anno l'Italia vinse il suo primo Mondiale di calcio?", "1934", "1938", "1930", "1950"),
    ("spo", 3, "Chi è stato il primo italiano a vincere le ATP Finals di tennis?", "Jannik Sinner", "Adriano Panatta", "Matteo Berrettini", "Lorenzo Musetti"),
    ("spo", 2, "Quale pugile era soprannominato «The Greatest»?", "Muhammad Ali", "Mike Tyson", "Joe Frazier", "George Foreman"),
    ("spo", 3, "In quale città si sono svolte le prime Olimpiadi invernali, nel 1924?", "Chamonix", "Sankt Moritz", "Lake Placid", "Oslo"),
    # ------------------------------------------------------------- parole
    ("lin", 2, "Che cosa significa l'espressione latina «ad hoc»?", "Apposta per questo scopo", "In ritardo", "Per sempre", "A caso"),
    ("lin", 3, "Che cos'è un'«ubbia»?", "Un timore o pregiudizio infondato", "Un'ubriacatura", "Una bugia", "Una gran fretta"),
    ("lin", 2, "Quale parola è un sinonimo di «prolisso»?", "Verboso", "Conciso", "Prodigo", "Pigro"),
    ("lin", 3, "Da quale lingua deriva la parola «algebra»?", "Arabo", "Greco", "Latino", "Persiano"),
    ("lin", 3, "Che cosa significa «ipso facto»?", "Immediatamente, per il fatto stesso", "Per ipotesi", "Al contrario", "Senza alcun dubbio"),
    ("lin", 3, "Qual è il plurale corretto di «capoufficio»?", "Capiufficio", "Capouffici", "Capiuffici", "Capoufficio"),
    ("lin", 3, "Da quale città deriva il nome «jeans»?", "Genova", "Nîmes", "Napoli", "Venezia"),
    ("lin", 3, "Che cos'è una «sinecura»?", "Un incarico ben pagato e poco faticoso", "Una malattia leggera", "Una medicina", "Un'attenzione eccessiva per sé"),
    ("lin", 2, "Che cos'è un «lapsus»?", "Un errore involontario", "Un ritardo", "Un'abbreviazione", "Un proverbio"),
    ("lin", 2, "Quale parola indica l'avversione verso gli stranieri?", "Xenofobia", "Misantropia", "Misoginia", "Agorafobia"),
    ("lin", 3, "Che cosa significa «serendipità»?", "Trovare qualcosa di buono per caso, cercando altro", "Serenità d'animo", "Sincerità assoluta", "Malinconia della sera"),
    ("lin", 3, "Quale figura retorica c'è in «Il silenzio assordante»?", "Ossimoro", "Metafora", "Iperbole", "Anafora"),
    # ------------------------------------------------------------- miti
    ("mit", 2, "Chi era la moglie di Ulisse?", "Penelope", "Elena", "Andromaca", "Circe"),
    ("mit", 3, "Quale titano fu condannato a reggere la volta celeste?", "Atlante", "Prometeo", "Crono", "Iperione"),
    ("mit", 2, "Chi è il padre di Thor nella mitologia norrena?", "Odino", "Loki", "Baldr", "Týr"),
    ("mit", 2, "Qual era il nome romano di Afrodite?", "Venere", "Minerva", "Diana", "Giunone"),
    ("mit", 2, "Chi uccise il Minotauro?", "Teseo", "Perseo", "Giasone", "Eracle"),
    ("mit", 2, "Come si chiama il cane a tre teste guardiano dell'Ade?", "Cerbero", "Ortro", "Idra", "Chimera"),
    ("mit", 2, "Chi rubò il fuoco agli dèi per darlo agli uomini?", "Prometeo", "Epimeteo", "Atlante", "Efesto"),
    ("mit", 2, "Chi guidò gli Argonauti alla ricerca del vello d'oro?", "Giasone", "Teseo", "Achille", "Perseo"),
    ("mit", 3, "Quale dio egizio aveva la testa di sciacallo?", "Anubi", "Horus", "Ra", "Thot"),
    ("mit", 2, "Quale re trasformava in oro tutto ciò che toccava?", "Mida", "Creso", "Minosse", "Tantalo"),
    ("mit", 3, "Come si chiama il serpente del mondo, nemico di Thor?", "Jörmungandr", "Fenrir", "Níðhöggr", "Sleipnir"),
    ("mit", 3, "Chi era la musa della poesia epica?", "Calliope", "Clio", "Euterpe", "Talia"),
    # ------------------------------------------------------------- tecnologia
    ("tec", 2, "Chi è considerato l'inventore del World Wide Web?", "Tim Berners-Lee", "Vint Cerf", "Bill Gates", "Alan Turing"),
    ("tec", 2, "In che anno è stata fondata Google?", "1998", "1995", "2001", "2004"),
    ("tec", 3, "Quale linguaggio di programmazione creò Guido van Rossum?", "Python", "Java", "Ruby", "C++"),
    ("tec", 2, "Che cosa significa la sigla «CPU»?", "Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Control Power Unit"),
    ("tec", 3, "Quale azienda mise in commercio il primo microprocessore, il 4004?", "Intel", "IBM", "Motorola", "AMD"),
    ("tec", 3, "Quanti byte ci sono in un kibibyte (KiB)?", "1024", "1000", "512", "2048"),
    ("tec", 3, "Quale ingegnere italiano progettò l'Intel 4004?", "Federico Faggin", "Pier Giorgio Perotto", "Guglielmo Marconi", "Antonio Meucci"),
    ("tec", 3, "Chi guidò il progetto dell'Olivetti Programma 101, uno dei primi personal computer?", "Pier Giorgio Perotto", "Federico Faggin", "Adriano Olivetti", "Camillo Olivetti"),
    ("tec", 2, "Che cosa significa la sigla «HTTP»?", "HyperText Transfer Protocol", "High Transfer Text Protocol", "HyperText Transmission Process", "Host Text Transfer Protocol"),
    ("tec", 2, "Come si chiamava il primo satellite artificiale?", "Sputnik 1", "Explorer 1", "Vostok 1", "Telstar"),
    ("tec", 3, "Chi è considerata la prima programmatrice della storia?", "Ada Lovelace", "Grace Hopper", "Margaret Hamilton", "Hedy Lamarr"),
    ("tec", 3, "Quale scienziato ideò la macchina astratta alla base dell'informatica teorica?", "Alan Turing", "John von Neumann", "Claude Shannon", "Charles Babbage"),
]

questions = []
for i, (cat, diff, text, *opts) in enumerate(Q, 1):
    assert len(opts) == 4 and len({o.lower() for o in opts}) == 4, text
    questions.append({"id": f"esp-{i:03d}", "categoryId": cat, "type": "multiple", "text": text,
                      "options": opts, "correctIndex": 0, "difficulty": diff})

pack = {"id": "esperti", "name": "Sfida da esperti",
        "description": "Domande più difficili, ideali per la finale. Difficoltà media e difficile.",
        "builtIn": True, "updatedAt": 0, "categories": CATEGORIES, "questions": questions}
json.dump(pack, open(os.path.join(PACKS, 'esperti.json'), 'w', encoding='utf8', newline='\n'), ensure_ascii=False, indent=1)
print('esperti', len(questions), 'domande',
      {d: sum(1 for q in questions if q['difficulty'] == d) for d in (2, 3)})

# ------------------------------------------------------------- difficoltà dei pacchetti esistenti
DEFAULTS = {'base': 1, 'cultura': 2, 'pop': 2, 'stime': 2}
# Bandiere: i continenti con Stati meno noti sono più difficili.
FLAG_DIFF = {'europa': 2, 'nordamerica': 2, 'sudamerica': 2, 'asia': 3, 'africa': 3, 'oceania': 3}
for pid in ['base', 'cultura', 'pop', 'stime', 'bandiere']:
    path = os.path.join(PACKS, f'{pid}.json')
    pack = json.load(open(path, encoding='utf8'))
    for q in pack['questions']:
        if 'difficulty' in q:
            continue
        q['difficulty'] = FLAG_DIFF.get(q['categoryId'], 2) if pid == 'bandiere' else DEFAULTS[pid]
    json.dump(pack, open(path, 'w', encoding='utf8', newline='\n'), ensure_ascii=False, indent=1)
    print(pid, {d: sum(1 for q in pack['questions'] if q['difficulty'] == d) for d in (1, 2, 3)})
