# Sapere è Potere: party quiz in stile PlayLink / Buzz!

Uno schermo principale 3D (TV o PC) e da 2 a **16** smartphone come controller. La serata è uno **show di giochi estratti da una ruota**, con carte potere per attaccare e difendersi, e si chiude con la finale della Piramide. Le domande si possono scrivere da soli nel **Laboratorio Domande**.

## Avvio

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

## Giocare offline (senza internet)

Dopo `npm install` e `npm run build` non serve più internet: font, librerie e domande sono tutti in locale. Serve solo che PC e telefoni siano sulla **stessa rete Wi-Fi**:

1. **Hotspot di un telefono** (il metodo più semplice): attiva l'hotspot su un telefono, anche con i dati mobili spenti, e collega a quella rete il PC e gli altri telefoni.
2. **Un router di casa anche senza internet**: basta che sia acceso.

Poi:

- Avvia il gioco con `npm start`. Nel terminale compaiono gli indirizzi per i telefoni.
- Il QR code sullo schermo usa l'indirizzo del PC in quella rete. Se non funziona, premi **«Prova un altro indirizzo»** sotto il QR.
- **Windows Firewall:** al primo avvio Windows chiede se consentire Node.js. Spunta anche le **reti pubbliche**, perché gli hotspot spesso vengono classificati come rete pubblica. Se hai già risposto di no, apri un prompt come amministratore ed esegui:
  ```
  netsh advfirewall firewall add rule name="Sapere e Potere" dir=in action=allow protocol=TCP localport=3000
  ```

## La serata

1. **Lobby:** ognuno sceglie personaggio, skin e selfie dal telefono. Sul PC si scelgono:
   - **Ruota casuale**: la durata (Corta 3 giochi, Normale 5, Lunga 7) e quali giochi possono uscire;
   - oppure **Scaletta in ordine**: i giochi uno dopo l'altro, nell'ordine deciso da te (fino a 12), senza ruota;
   - i **pacchetti di domande**: Pacchetto base, Cultura generale, Pop & Intrattenimento, Numeri & Stime, **Bandiere del mondo** e quelli creati da te.
   Le domande si estraggono **bilanciate per categoria**: un pacchetto grande, come le bandiere, non monopolizza la serata.
2. Per ogni gioco: **ruota** → spiegazione delle regole → **carte** → gioco → classifica.
3. **Finale:** Piramide della Conoscenza.

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

### Gruppi numerosi (da 7 a 16 giocatori)

Dai 7 giocatori in su il gioco cambia alcune regole per restare divertente per tutti:

- **Studio TV su due file**: quella dietro su una gradinata e sfalsata. Personaggi più piccoli, etichette compatte, camera più arretrata.
- **Niente accanimenti**: ogni giocatore può subire al massimo 3 attacchi per gioco. Gli altri rimbalzano con «🛑 troppi attacchi».
- **Il Più Veloce** premia i primi tre (1000, 600 e 300 punti), non solo il primo.
- **Ruba Punti**: nessuno paga più di due furti per domanda. Oltre, paga la banca.
- **Ritmo**: le animazioni delle carte durano al massimo 7 secondi. Classifiche e risultati vanno su due colonne e mostrano i conteggi invece delle liste di nomi.
- **Carte**: chi è al centro dell'attenzione (il primo in classifica) è protetto dal tetto agli attacchi; a tutti conviene giocare le difese.

### Carte potere

All'inizio di ogni gioco peschi 3 carte e ne giochi 1. Con 3 risposte giuste di fila guadagni una giocata in più.

- **Attacchi**: 🧊 Ghiaccio, 🟢 Melma, 💣 Bombette, 🔒 Lucchetto. Se più giocatori colpiscono la stessa persona, gli effetti si sommano.
- **Difese**:
  - 🛡️ Scudo: blocca gli attacchi.
  - 🪞 Specchio: rimanda gli attacchi a chi li ha lanciati.
  - 👻 Mantello: devia gli attacchi su un altro giocatore.
  - 🧪 Antidoto: neutralizza gli attacchi e dà +150 punti per ognuno.
- **Bonus**:
  - 💎 Doppio: punti doppi alla prossima risposta giusta.
  - ✂️ 50:50: elimina due risposte sbagliate nelle prossime 2 domande.

## Laboratorio Domande

Si apre da `editor.html`, oppure dal link nella lobby e nella schermata iniziale dello schermo principale.

- Crea **pacchetti** e **categorie** con icona e colore.
- Tipi di domanda: **risposta multipla** (da 2 a 4 risposte), **vero/falso**, **numerica** (per La Stima).
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
scripts/     simulate.ts: serata completa scriptata, senza browser
```

- `npm run dev`: avvia con ricarica automatica del codice.
- `GAME_SPEED=10 npm run dev` + `npm run simulate`: simula una serata completa a velocità ×10. Variabili utili: `LENGTH=short|normal|long` (durata), `BOTS=15` (numero di bot, fino a 15), `SEQUENCE=bomb,estimate` (scaletta), `ONLY_GAMES=bomb,wager` (lato server: limita la ruota ai giochi indicati).
- Tempi e punteggi sono in `shared/config.ts`.
