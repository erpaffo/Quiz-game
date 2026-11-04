# Changelog

Tutte le novità del gioco, dalla più recente. Le versioni seguono `package.json` (formato `MAGGIORE.MINORE.CORREZIONE`).

---

## [0.3.0] – 2026-11-04

Versione «parole che non tornano e release automatiche»: nei giochi del telefono non escono più le stesse parole, le banche sono molto più ricche, arrivano i manuali PDF e le release passano da un controllo AI sulle domande.

### Aggiunto
- **Anti-ripetizione** (telefono): ogni banca (Fronte, Panico, Onda, Tribunale, Catena, Bomba, Impostore, Camaleonte, Duello) ricorda le carte già uscite. Nessuna parola ricompare finché il mazzo non è finito, anche tra una partita e l'altra. «Nuova serata» azzera anche la memoria.
- **Banche molto più ampie**: Fronte 280 carte (prima 204), Duello 58 fatti veri/falsi (prima 40), Camaleonte 46 coppie, Impostore 30 categorie (prima 25), Bomba 56 sillabe e 93 categorie, Panico 123, Onda 77, Tribunale 70, Catena 74. Ogni voce nuova è passata da una revisione automatica: quasi 150 scarti tra fatti sbagliati, quasi-doppioni e taboo che svelavano la parola.
- **Manuali PDF** (cartella `docs/manuali/`, fuori da git): uno per la versione PC (40 pagine, 14 giochi, carte potere, Piramide) e uno per il telefono (21 pagine, 8 giochi), in stile manuale da tavolo. Si generano con `npm run manuali`.
- **Roadmap** per telefono e PC in `docs/ROADMAP_TELEFONO.md` e `docs/ROADMAP_PC.md` (fuori da git).
- **Schermo acceso** anche in Onda e Tribunale (telefono) e un ripiego per il controller in rete locale senza HTTPS.
- **Tasto meno nella Stima** (PC): prima non era possibile rispondere a valori negativi come -273,15.
- **Release automatiche** (GitHub Actions):
  - `verifica-ai.yml`: controlla con DeepSeek (`deepseek-flash`, DeepSeek-V4.1-Flash) che le domande di quiz e Duello siano vere. Gira a ogni modifica delle domande approvate, a mano, e dentro la release. Serve il segreto `DEEPSEEK_API_KEY`.
  - `release.yml`: con un tag `v*` esegue prima la verifica AI, e solo se passa pubblica telefono e PC.
  - `telefono.yml` (ex `pass-pages.yml`) pubblica l'app telefono; `pc.yml` (ex `desktop.yml`) compila i tre eseguibili PC. Entrambi si possono lanciare da soli con i tag `telefono-v*` e `pc-v*`.
- **Registro di verifica** della banca (`npm run banca-db`): ogni domanda ha la colonna «verificata», controllata dalla CI.
- **Script di verifica AI** `npm run ai-verifica` (usa la chiave `DEEPSEEK_API_KEY`).

### Corretto
- **Bomba (telefono)**: «Contesta» una sola volta per round (prima infinita, fermava la miccia); tolta la doppia fanfara a fine partita; la miccia non avanza al ritorno dal background.
- **Fronte (telefono)**: il timer non perde tempo quando la pagina va in background.
- **Impostore (telefono)**: nel classico la coppia categoria/parola non si ripete più nei primi 60 round.
- **Duello (telefono)**: non escono due affermazioni identiche di fila; «L'Australia è più grande della Luna» era indicata come vera ed è falsa; «Un'ora ha 100 minuti» aveva un refuso.
- **Scarabocchi Animati (PC)**: ogni tap su colore, spessore o fotogramma non registra più un altro handler di click. Prima Annulla cancellava più tratti del previsto e la schermata rallentava a ogni tap; dopo un cambio colore la tela poteva non aggiornarsi.
- **Impostore Pack (PC)**: il toggle «mostra/nascondi ruolo» funzionava solo a un tap su due.
- **Leggende del Quiz (PC)**: le domande «Trova la bandiera» mostrano ora le bandiere come immagini.
- **Controller (PC)**: un'azione fatta mentre il telefono è offline viene scartata con un avviso (prima andava persa in silenzio); una risposta rifiutata sblocca di nuovo i pulsanti.
- **Indizio dopo Indizio (PC)**: le parole rivelate compaiono su TV e telefoni.
- **Sottotitoli (PC)**: compaiono anche con la voce spenta.
- **Fuffa d'Autore (PC)**: «Hai scritto la verità!» non conferma più la risposta giusta; il rifiuto è generico.
- **Telefono di prova (`user-packs/telefono.json`)**: le 11 copie identiche della domanda di prova sono state ridotte a una. `addPhoneQuestion` rifiuta ora le domande duplicate.

### Pulizia del repository
- Tutti i file generati dall'AI (lotti da verificare, scartati, prompt per Gemini e DeepSeek, rapporti) sono in una sola cartella, `ai-generati/`, esclusa da git. Gli script di banca leggono da lì.
- Rimossi file di prova e build superate (`app-build/`, vecchi installer 0.1.x, cache Python).
- `CHANGELOG.md` torna nel repository.
- `user-packs/telefono.json` non è più tracciato da git: è un pacchetto di prova locale.

### Note
- `scripts/simulate.ts` scrive ancora in `user-packs/` se il server parte senza `USER_PACKS_DIR`. Per le prove usare `USER_PACKS_DIR=<cartella temporanea> npm run dev`.
- Restano aperte: voce del presentatore completa (0.3.0 del PC), TV scollegata = partita in pausa, giocatori offline nei giochi Pack.
- Circa 570 domande nuove sono in attesa di verifica umana nel registro: finché non sono marcate, `banca-db verifica` e la CI segnalano il problema.

### Test
- **270 test**, tutti superati (erano 217). Nuovi test su: mazzi persistenti, nessun doppione nel classico, nessun fatto vero ripetuto, contesta una volta, doppioni in `addPhoneQuestion`, logica della verifica AI.

---

## [0.2.3] – 2026-10-28

Versione «TV stabile»: la serata non rallenta più al terzo gioco, e comincia il lavoro sulla voce del presentatore.

### Aggiunto
- **Copione della voce, 1ª parte** (`docs/COPIONE_VOCE.md`): 55 righe e 94 battute per il menù del Pack, le 44 battute del quiz, la Macchina del Tempo, Fuffa d'Autore e l'Impostore. Ogni battuta ha testo, gioco, momento, durata massima e varianti; in fondo ci sono le **25 chiavi nuove** da doppiare. Restano da scrivere gli altri 10 giochi.
- **Contratto del catalogo voci** (`shared/voice.ts`): le 30 chiavi del quiz sono «congelate» (non si rinominano più, così le 44 battute esistenti restano valide) e i giochi del Pack usano il formato `<gioco>/<passo>`.
- **Il server annuncia le fasi del quiz** (ruota, ingresso nel minigioco, risposta giusta/sbagliata/nessuno, podio) con il messaggio `VOICE_SAY`. Per ora la TV lo riceve ma **non lo suona**: il lettore della voce arriva con la 0.3.0, quindi non cambia nulla di quello che si sente giocando.
- **`npm run banca -- controlla` con due avvisi nuovi**: «risposta svelata» (la risposta di una domanda compare nel testo di un'altra) e «banalità» (vero/falso con parole come «sempre»/«mai», o numero già scritto nella domanda). Sono **avvisi**, non errori: mostrano `file:riga` e il lotto resta promovibile.

### Corretto
- **Memoria della TV (il difetto che rallentava la serata)**: podi, piramide, trofeo e bomba ora si liberano davvero quando spariscono dalla scena, e i numeri dei gradini escono dal DOM. Dopo più partite la memoria della grafica non cresce più, invece di accumularsi a ogni gioco.
- **Battute e animazioni «in ritardo»**: i timer di audio e di scena vengono annullati al cambio fase, a «Riavvia» e a «Esci», quindi non capita più che una voce o un'animazione parta sopra la schermata sbagliata.
- **Orologio della TV più stabile**: l'ora del server non viene più riallineata di colpo a ogni aggiornamento ma con una media mobile (si riallinea subito solo se lo scarto supera 1,5 secondi per quattro aggiornamenti di fila). I cronometri non saltano più a scatti.

### Test
- 5 test nuovi: gli avvisi della banca domande (`tests/banca.test.ts`) e il catalogo voci — ogni battuta annunciata esiste in `audio.json`, le 44 battute del quiz restano intatte, l'evento `VOICE_SAY` viene davvero emesso (`tests/voice.test.ts`). Totale: **217 test**, tutti superati.

---

## [0.2.2] – 2026-10-27

### Aggiunto
- **Filtro per argomento nel quiz**: nel sottomenù del quiz si possono accendere uno o più argomenti (arte, storia, scienza, geografia, musica...) per giocare solo con quelli, oltre al filtro per difficoltà già esistente. Funziona su tutti i pacchetti, non solo sulla banca domande (`shared/topics.ts`).
- **Controlli automatici (`ci.yml`)**: a ogni push e pull request su GitHub, controllo dei tipi, test, build e verifica della banca domande (lotti e pacchetti generati aggiornati), più una prova non bloccante nel browser (Chromium e WebKit). Dependabot per gli aggiornamenti delle dipendenze.
- **Scarabocchi Animati**: i bot ora disegnano davvero (6 scarabocchi pronti legati ai temi del gioco), invece di lasciare il foglio bianco.
- **Banca domande**: promossi i lotti `G013`–`G036` di Gemini (657 domande e contenuti tascabili approvati, 23 scartati dopo revisione) — centinaia di nuove domande in arte, cibo, cinema, lingua, musica, sport e storia, più 3 nuovi mazzi per l'app tascabile (Bomba Verbale per categorie, Catena Scarabocchiata, Lunghezza d'Onda).

### Corretto
- **Fine del quiz**: dopo il podio ora si torna da soli al menù dei giochi, come già succede negli altri giochi del Pack (prima il quiz restava fermo sulla classifica).

### Modificato
- Piccole rifiniture di interfaccia (etichette dei badge di fine minigioco, colori delle opzioni di risposta).
- Dipendenze aggiornate: `electron`, `express`, `socket.io`, `tsx`.

### Test
- Nuovi test per il filtro per argomento (`tests/quiz-filtri.test.ts`) e per la fine del quiz (`tests/quiz-fine.test.ts`). Totale: **212 test**, tutti superati.

---

## [0.2.1] – 2026-10-27

Versione di correzioni, nata da un controllo completo del codice.

### Corretto
- **Bomba a Orologeria e pausa**: dopo una pausa della TV la bomba poteva scoppiare in mano a chi aveva appena risposto giusto. Ora la pausa non consuma più la miccia.
- **Punti per velocità e pausa**: rispondere subito dopo una pausa valeva il minimo dei punti (la pausa contava come tempo di risposta). Ora il tempo in pausa non conta, in tutti i giochi del quiz.
- **Indizio dopo Indizio**: i telefoni ricevevano subito la domanda intera (si poteva leggere in anticipo). Ora arrivano solo le parole già svelate; dopo una pausa lo svelamento riparte da dove si era fermato.
- **Banca domande, `npm run banca -- costruisci`**: un errore a metà cancellava i pacchetti già presenti. Ora prima controlla tutto, poi sostituisce.

### Sicurezza
- **Riconnessione**: ogni giocatore riceve una chiave segreta. Senza la chiave nessuno può più prendere il posto di un altro in partita.
  *Nota*: chi aveva il gioco aperto con la versione precedente, se perde la connessione, deve rientrare una volta scrivendo codice e nome.
- **Laboratorio domande**: nuova chiave facoltativa `EDITOR_KEY`. Se impostata, creare, modificare o cancellare pacchetti e caricare file richiede la chiave (il Laboratorio la chiede una volta e la ricorda). Senza la variabile funziona tutto come prima. Va impostata prima di mettere il gioco online con il Cloudflare Tunnel.

### Modificato
- `Dockerfile` e `docker-compose.yml` sono ora salvati in git, così l'installazione sul Raspberry con `git clone` funziona.
- `docker-compose.yml`: aggiunta la variabile `EDITOR_KEY`.
- `.dockerignore`: escluse le cartelle `app-build` e `build` (build Docker più leggera).

### Rimosso
- La copia doppia di `build-exe.bat` dentro la cartella del progetto (resta quella nella cartella principale).
- Il metodo inutilizzato `ShowRegistry.availableIds()`.

### Test
- Nuovi test per la pausa (Bomba, Classico, Indizio), per le API del Laboratorio (con e senza chiave), per la riconnessione e per `costruisci`. Totale: **205 test**, tutti superati.

---

## [0.2.0] – 2026-10-27

### Aggiunto
- **Banca domande** (`banca-domande/`): domande scritte e verificate da due autori (Claude e Gemini), con revisione incrociata prima dell'approvazione.
  - Comandi `npm run banca` (`controlla`, `promuovi`, `costruisci`, `stato`, `elenco`) e `npm run banca-db` (registro `DATABASE.csv` con la colonna «verificata»).
  - Importazione da Wikidata e Open Trivia DB (`scripts/import/`).
- **Nuovi pacchetti di serie** `banca-*` per 13 categorie: arte, cibo, cinema, geografia, lingua, miti, musica, natura, scienza, spazio, sport, storia, tecnologia.
- Contenuti nuovi per l'app **Party Tascabile** (parole, categorie, domande dei giochi offline).

### Modificato
- Il gioco si chiama ora **«Quiz del Pozzo»**, con una nuova icona.

---

## [0.1.1] – 2026-10-26

### Aggiunto
- **Hub multi-gioco**: dal menù si sceglie tra il quiz e **13 nuovi party game**: Macchina del Tempo, Anime Gemelle, Scala del Nonsenso, Leggende del Quiz, Guastafeste, Fila Indiana, Chi di Noi?, Miniera dei Sondaggi, Scarabocchi Animati, Il Colpevole, Smistatori, Fuffa d'Autore e L'Impostore. Ogni gioco ha le sue regole e il numero di round regolabile.
- **Party Tascabile** (`/pass/`): app separata da giocare passandosi un solo telefono, senza TV. 8 giochi, funziona anche **offline** e si può installare sull'iPhone.
- **Pausa** dalla TV (tasto Esc): il tempo si ferma e i telefoni non possono agire.
- Supporto **Docker** per il Raspberry Pi e pubblicazione dell'app tascabile su GitHub Pages.
- Test automatici dei giochi (anche con dati «assurdi», per controllare che il server non cada).

---

## [0.1.0] – 2026-10-16

### Aggiunto
- **App desktop** per Windows, macOS e Linux: si apre con un doppio clic, senza installare Node.js. Gli eseguibili si creano da soli con GitHub Actions.
- **Modalità bosco**: su Windows il PC crea il proprio hotspot Wi-Fi e si gioca senza internet.
- **Pacchetto bandiere** e nuovi pacchetti di domande.
- Laboratorio domande migliorato.

### Aggiornamento del 2026-10-17
- **Selfie con sfondo rimosso** (MediaPipe) da mettere sul personaggio.
- Personaggi 3D migliorati.

---

## [Primo rilascio] – 2026-10-14

- Party quiz multigiocatore: la TV mostra il gioco in 3D, i telefoni fanno da controller.
- 8 giochi del quiz (Classico, Il Più Veloce, Bomba a Orologeria, Ruba Punti, Scommessa, Raffica, La Stima, Indizio dopo Indizio), carte potere e finale a Piramide.
- Laboratorio domande per creare pacchetti propri.
