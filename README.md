# Quiz del Pozzo (Quiz of Well): party quiz in stile PlayLink / Buzz!

Uno schermo principale 3D (TV o PC) e da 2 a **16** smartphone come controller. La serata è uno **show di giochi estratti da una ruota**, con carte potere per attaccare e difendersi, e si chiude con la finale della Piramide. Le domande si possono scrivere da soli nel **Laboratorio Domande**.

Come funziona il gioco, architettura, scelte di progettazione e sviluppi futuri: [docs/PROGETTO.md](docs/PROGETTO.md).

## Scaricare e giocare (consigliato): doppio clic

Dalla pagina **Releases** del repository trovi un file per ogni sistema. Non serve installare nulla, né Node.js, né usare il terminale.

| Sistema | File | Come si avvia |
|---|---|---|
| Windows | `...-win-x64.exe` | Doppio clic. Se compare «Windows ha protetto il PC»: *Ulteriori informazioni → Esegui comunque* |
| macOS | `...-mac-universal.dmg` | Trascina l'app in Applicazioni, poi **tasto destro → Apri → Apri** la prima volta |
| Linux | `...-linux-x64.AppImage` | Rendilo eseguibile (*Proprietà → Permessi*) e doppio clic. Se serve: `libfuse2` |

Gli avvisi sono normali: le firme di Microsoft e Apple sono a pagamento e l'app è gratuita e non firmata. Per giocare: il gioco si apre a schermo intero (**F11** alterna, **Esc** esce), sullo schermo compare il QR e gli amici entrano col telefono sulla stessa rete Wi-Fi. Le istruzioni complete sono nel file `build/LEGGIMI.txt`, allegato a ogni release.

Il menu **Gioco** ha il Laboratorio Domande, l'apertura della cartella dei pacchetti e, su Windows con Wi-Fi, l'**hotspot (modalità bosco)** con un clic. I pacchetti personali si salvano nella cartella dati dell'utente (`%APPDATA%\QuizDelPozzo` su Windows) e restano anche aggiornando l'app.

### Creare gli eseguibili

- **Automatico (GitHub Actions):** a ogni push il file `.github/workflows/desktop.yml` compila Windows, Mac e Linux su macchine apposite, controlla che l'app impacchettata parta (prova senza finestre) e salva i 3 file tra gli artefatti. Con un tag di versione (es. `git tag v1.0.0 && git push --tags`) crea anche la **Release** con i file da scaricare. Costa zero per i repository pubblici.
- **Sul tuo PC:** `npm run desktop:build` crea l'eseguibile del tuo sistema nella cartella `release/`. Mac e Linux si possono creare solo sul rispettivo sistema (o con GitHub Actions).
- `npm run desktop` prova l'app da sorgente; `npm run desktop:smoke` controlla l'app impacchettata (pagine, pacchetti, bandiere, WebSocket, salvataggio e caricamento della finestra) senza aprirla.
- **Cambiare il nome del gioco:** modifica solo `shared/brand.json` (titoli, logo, nome dell'app e dei file si aggiornano da soli). Il nome scelto, «Quiz del Pozzo» (in inglese «Quiz of Well»), è nostro: non usare nomi di giochi di altri.
- L'icona è provvisoria (`build/icon.png`, 1024×1024): sostituiscila con la tua.

## Avvio da sorgente (sviluppo)

```bash
npm install        # solo la prima volta (serve internet)
npm run build      # compila il client
npm start          # avvia il gioco su http://localhost:3000
```

| Pagina | Dove aprirla |
|---|---|
| `http://localhost:3000/host.html` | Schermo principale, sul PC collegato alla TV |
| `http://localhost:3000/editor.html` | Laboratorio Domande, sul PC |
| QR code sullo schermo | Controller, sui telefoni |

Per provare da soli: nella lobby premi **«🤖 Aggiungi bot»**.

## Giocare senza internet (anche in un bosco 🌲)

Non servono né internet né un router: basta una **rete Wi-Fi locale**, che può creare il PC stesso oppure un telefono. Font, librerie, bandiere e domande sono tutti nel progetto.

### Prima di partire (a casa, con internet)

1. Esegui `npm install` e `npm run build`.
2. Fai una **prova generale senza internet**: stacca il router (o scollega il cavo) e prova `npm run bosco`. Se funziona a casa, funzionerà anche nel bosco.
3. Al primo avvio Windows chiede il permesso del firewall per Node.js: spunta anche le **reti pubbliche**, perché la rete dell'hotspot viene di solito classificata così. Se hai già risposto di no, apri un prompt come amministratore ed esegui:
   ```
   netsh advfirewall firewall add rule name="Quiz del Pozzo" dir=in action=allow protocol=TCP localport=3000
   ```
4. Porta un caricatore o un power bank: l'hotspot consuma batteria.

### A) Hotspot creato dal PC: `npm run bosco` (consigliato)

Serve un PC con Wi-Fi, ad esempio un portatile.

```bash
npm run bosco              # accende l'hotspot, avvia il gioco e apre lo schermo principale
npm run bosco -- -Check    # verifica soltanto se il PC può creare l'hotspot (non cambia nulla)
```

- L'hotspot di Windows si accende anche senza internet, con nome rete `QuizDelPozzo` e una password generata al primo avvio. Entrambi restano salvati in `bosco.json`, così i telefoni si ricollegano da soli le volte successive.
- Sulla TV compaiono **due QR**: il **QR 1** collega il telefono alla rete, il **QR 2** apre il gioco.
- Se il telefono avvisa «rete senza internet», scegli **Resta connesso**.
- Con **Ctrl+C** si chiude il gioco e si spegne l'hotspot.
- In *Impostazioni → Rete → Hotspot mobile* conviene disattivare lo spegnimento automatico per risparmio energetico.

### B) Hotspot creato da un telefono

1. Su un telefono attiva l'**hotspot**, anche con i dati mobili spenti. Android è il più affidabile; su iPhone l'hotspot può richiedere un piano dati attivo.
2. Collega il PC a quella rete e avvia il gioco con `npm start`.
3. Nella lobby premi **«🌲 Senza internet? Mostra il QR dell'hotspot»** e inserisci nome e password della rete. Compare il QR per collegarsi, che resta salvato anche per le volte successive.

### Se il QR del gioco non funziona

Sotto il QR c'è **«Prova un altro indirizzo»**, utile se il PC è collegato a più reti.

Un PC **senza scheda Wi-Fi**, come un fisso collegato via cavo, non può creare l'hotspot né collegarsi a quello di un telefono: serve una chiavetta Wi-Fi USB. Con `npm run bosco -- -Check` lo verifichi subito.

## La serata

1. **Lobby:** ognuno sceglie personaggio, skin e selfie dal telefono. Il selfie viene ritagliato da solo (solo testa e capelli, senza sfondo) e diventa la testa del personaggio, come in Buzz!; se il ritaglio non riesce lo si sistema a mano in un ovale. Sul PC si scelgono:
   - **Ruota casuale**: la durata (Corta 3 giochi, Normale 5, Lunga 7) e quali giochi possono uscire;
   - oppure **Scaletta in ordine**: i giochi uno dopo l'altro, nell'ordine deciso da te (fino a 12), senza ruota;
   - i **pacchetti di domande**: Pacchetto base, Cultura generale, Pop & Intrattenimento, Numeri & Stime, **Bandiere del mondo**, **Per esperti** (domande difficili), **Melodie famose** (per Indovina il Brano) e quelli creati da te.
   Le domande si estraggono **bilanciate per categoria**: un pacchetto grande, come le bandiere, non monopolizza la serata.
2. Per ogni gioco: **ruota** → spiegazione delle regole → **carte** → gioco → classifica.
3. **Finale:** Piramide della Conoscenza. Prima di ogni domanda c'è il **sabotaggio**: l'ultimo della piramide lancia 2 attacchi contro chi vuole, il penultimo 1 (con almeno 3 giocatori). Le domande sono sempre a risposta multipla e diventano più difficili salendo: prima Medie, poi Difficili.

### Giochi

| | Gioco | Regole |
|---|---|---|
| 🎯 | Classico | Si vota la categoria (il Joker la impone), poi 4 domande a punti per velocità |
| ⚡ | Il Più Veloce | Solo il primo che risponde giusto prende 1000 punti; chi sbaglia ne perde 300 |
| 💣 | Bomba a Orologeria | Rispondi giusto per lanciare la bomba a un avversario; allo scoppio chi la tiene perde 1000 punti |
| 🦝 | Ruba Punti | Chi risponde giusto ruba punti a chi vuole: 500 il più veloce, 250 gli altri |
| 🎰 | Scommessa | Vedi la categoria e punti: giusto vinci la puntata, sbagliato la perdi |
| 🔥 | Raffica | 45 secondi al proprio ritmo; le serie di risposte giuste alzano il moltiplicatore fino a ×4 |
| 📏 | La Stima | Risposte numeriche: vince il più vicino (+500 se esatta) |
| 🧩 | Indizio dopo Indizio | La domanda si svela parola per parola: prima rispondi, più vinci, ma l'errore costa |
| 🎵 | Indovina il Brano | Lo schermo suona una melodia: titolo o compositore dal telefono, punti per velocità. Esce solo se c'è il pacchetto Melodie famose (o domande tue con un brano) |

### Gruppi numerosi (da 7 a 16 giocatori)

Dai 7 giocatori in su il gioco cambia alcune regole per restare divertente per tutti:

- **Studio TV su due file**: quella dietro su una gradinata e sfalsata. Personaggi più piccoli, etichette compatte, camera più arretrata.
- **Niente accanimenti**: ogni giocatore può subire al massimo 3 attacchi per gioco. Gli altri rimbalzano con «🛑 troppi attacchi».
- **Il Più Veloce** premia i primi tre (1000, 600 e 300 punti), non solo il primo.
- **Ruba Punti**: nessuno paga più di due furti per domanda. Oltre, paga la banca.
- **Ritmo**: le animazioni delle carte durano al massimo 7 secondi. Classifiche e risultati vanno su due colonne e mostrano i conteggi invece delle liste di nomi.
- **Carte**: chi è al centro dell'attenzione (il primo in classifica) è protetto dal tetto agli attacchi; a tutti conviene giocare le difese.

### Personaggi

8 personaggi cartoon, con 2 o 3 skin ciascuno: Rocky Ciuffo, Cap. Orbita, Chef Baffo, Nonna Sprint, Quizbot 3000, Barba Libro, **Sandro** e **Basso**. In lobby, **🎨 Personalizza** permette di ricolorare la skin e, per alcuni personaggi, di scegliere gli accessori:

- **Sandro**: occhiali, barba, gratta e vinci oppure schedina con le carte, fiches o carte in tasca, espressione fiduciosa o preoccupata.
- **Basso**: capelli corti o codino, barbetta, manga o action figure, borsa a tracolla con spille, stampa della felpa (robot o stella), posa tranquilla o dinamica.

### Carte potere

All'inizio di ogni gioco peschi 3 carte e ne giochi 1. Con 3 risposte giuste di fila guadagni una giocata in più.

- **Attacchi**: 🧊 Ghiaccio, 🟢 Melma, 💣 Bombette, 🔒 Lucchetto. Se più giocatori colpiscono la stessa persona, gli effetti si sommano.
- **Difese**:
  - 🛡️ Scudo: blocca gli attacchi.
  - 🪞 Specchio: rimanda gli attacchi a chi li ha lanciati.
  - 👻 Mantello: devia gli attacchi su un altro giocatore.
  - 🧪 Antidoto: neutralizza gli attacchi e dà +150 punti per ognuno.
- **Bonus**:
  - 💎 Doppio: raddoppia la prossima risposta giusta, con un bonus massimo di +500.
  - ✂️ 50:50: elimina due risposte sbagliate (per quante domande dipende dal gioco).

La 🟢 Melma ha al massimo 2 strati e si stacca quando ne hai pulito poco più di metà.

**Bilanciamento per gioco.** Alcune carte non si pescano in certi giochi, e lo schermo lo dice durante la scelta delle carte:

| Gioco | Carte escluse | 50:50 | Perché |
|---|---|---|---|
| 🎯 Classico | — | 2 domande | |
| ⚡ Il Più Veloce | — | 1 domanda | basta una domanda "facile" per vincere 1000 punti |
| 💣 Bomba | 💎 Doppio | 2 domande | qui si vince evitando lo scoppio, non accumulando |
| 🦝 Ruba Punti | — | 1 domanda | il Doppio raddoppia quanto rubi, con il tetto di +500 |
| 🎰 Scommessa | 💎 Doppio | 1 domanda | la puntata è già un moltiplicatore: con il Doppio si quadruplicava |
| 🔥 Raffica | 💎 Doppio, 🔒 Lucchetto | 4 domande | domande da 2 secondi: il lucchetto la rovinava |
| 📏 La Stima | — | intervallo | |
| 🧩 Indizi | — | 1 domanda | |
| 🎵 Indovina il Brano | 💣 Bombette | 1 domanda | i titoli devono restare leggibili |

## Audio e voce del presentatore

Lo schermo principale ha musica di sottofondo (lobby, giochi, tensione della Bomba, finale, vittoria), effetti sonori e una voce che commenta: benvenuto, nomi dei giochi, carte, risposte giuste e sbagliate, sabotaggio, vincitore. Quelli inclusi sono **segnaposto**: le musiche e gli effetti sono sintetizzati, la voce è quella di sintesi di Windows.

- Volume: pulsante 🔊 in alto a destra (musica, effetti e voce separati), tasto **M** per il muto.
- I file stanno in `client/public/audio/` (`music/`, `sfx/`, `voice/`, `melodie/`). L'elenco è in `client/public/audio/audio.json`: ogni suono può avere più varianti, scelte a caso.
- **Per usare la tua voce** registra file con lo stesso nome (es. `voice/welcome-1.mp3`) e sostituiscili. Oppure aggiungi varianti all'elenco in `audio.json`. Se un file manca, il gioco usa un suono sintetizzato.
- **Nell'app desktop** usa il menu **Gioco → Apri la cartella degli audio personalizzati**: i file messi lì (stessi percorsi, es. `voice/welcome-1.mp3`, o un tuo `audio.json`) hanno la precedenza su quelli di serie, anche dopo un aggiornamento.
- Per rigenerare i segnaposto: `python scripts/build-audio.py` (richiede Python con numpy e ffmpeg; la voce usa la sintesi vocale di Windows).

## Laboratorio Domande

Si apre da `editor.html`, oppure dal link nella lobby e nella schermata iniziale dello schermo principale.

- Crea **pacchetti** e **categorie** con icona e colore.
- Tipi di domanda: **risposta multipla** (da 2 a 4 risposte), **vero/falso**, **numerica** (per La Stima).
- **Difficoltà** (Facile, Media, Difficile): la Piramide finale pesca solo domande Medie e Difficili.
- **Immagini e brani**: il pulsante «Carica…» copia il file sul PC (cartella `user-media/`, nell'app desktop la cartella dati dell'utente) e funziona offline. Le domande con un brano finiscono in «Indovina il Brano».
- Scrivi `{giocatore}` e in partita diventerà il nome di un giocatore a caso: «Qual è il film preferito di {giocatore}?».
- **Esporta/Importa** in JSON per scambiare i pacchetti con gli amici.
- Il pacchetto di serie non si modifica: usa **Duplica**.
- Dal telefono, in lobby: **«➕ Aggiungi una domanda per gli amici»**. Le domande finiscono nel pacchetto «📱 Domande degli amici».

I pacchetti personali sono file JSON nella cartella `user-packs/`: fanne una copia di backup.

## Bandiere del mondo

Il pacchetto contiene le bandiere dei **195 Stati sovrani**: i 193 membri ONU più Città del Vaticano e Palestina. Sono divise in 6 categorie per continente e ogni Stato ha due domande:

- «Di quale Paese è questa bandiera?», con la bandiera mostrata in TV e sul telefono;
- «Trova la bandiera di questo Stato», con 4 bandiere come risposte.

Le risposte sbagliate sono bandiere dello stesso continente, quindi più simili e più difficili. Le immagini sono in `client/public/flags/` e funzionano offline. Provengono dal progetto open source [flag-icons](https://github.com/lipis/flag-icons) (licenza MIT).

Per rigenerare il pacchetto: `node scripts/build-flags.mjs`.

Anche le tue domande possono avere un'immagine: nel Laboratorio c'è il campo «Immagine», dove scrivere un percorso come `/flags/it.svg` oppure un indirizzo web (che però richiede internet).

## Prestazioni

Lo schermo principale passa da solo alla qualità bassa se il PC non regge. Puoi anche forzarla con `host.html?q=low` oppure `host.html?q=high`. Apri i controller sui telefoni, non in altre schede dello stesso PC.

## Sviluppo

```
shared/      contratto eventi, tipi, giochi, carte, pacchetti (validazione), configurazione
server/      Express + Socket.IO; Room.ts (regia dello show), games/ (un file per gioco),
             logic/ (carte, punteggi, voto, piramide), PackStore + QuestionPool (domande)
client/      host (Three.js), controller (mobile), editor (Laboratorio)
desktop/     app Electron (finestra, menu, hotspot, prova automatica)
scripts/     simulate.ts (serata scriptata, senza browser), desktop-*.mjs (impacchettamento)
build/       icona e LEGGIMI.txt allegato alle release
```

- `npm run dev`: avvia con ricarica automatica del codice.
- `GAME_SPEED=10 npm run dev` + `npm run simulate`: simula una serata completa a velocità ×10. Variabili utili: `LENGTH=short|normal|long` (durata), `BOTS=15` (numero di bot, fino a 15), `SEQUENCE=bomb,estimate` (scaletta), `ONLY_GAMES=bomb,wager` (lato server: limita la ruota ai giochi indicati).
- Tempi e punteggi sono in `shared/config.ts`.
- `server/app.ts` contiene tutto il server come funzione `startServer(...)`: lo usano sia `server/index.ts` (terminale) sia l'app desktop.

## Crediti

- Bandiere: [flag-icons](https://github.com/lipis/flag-icons) (MIT).
- Ritaglio del selfie: [MediaPipe](https://ai.google.dev/edge/mediapipe) e il modello *selfie multiclass* di Google (Apache 2.0), eseguiti sul telefono senza internet.
