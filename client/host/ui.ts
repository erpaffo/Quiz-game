import { CARDS, CARD_TYPES } from '../../shared/cards';
import { CONFIG } from '../../shared/config';
import { GAME_IDS, GAMES } from '../../shared/games';
import type { AnswerResult, CardEvent, GameId, GameLength, LobbySettings, PlayerPublic, PlayState, QuestionPublic, RoomSnapshot } from '../../shared/types';
import { PACK, getShowMeta, type MenuView, type ShowId } from '../../shared/shows';
import { categorySummary, handlePackClick, menuFocus, menuView, packDetail, packGrid } from '../common/pack-menu';
import { clock, esc, OPTION_COLORS, OPTION_LETTERS, PLAYER_COLORS } from '../common/net';
import { renderHostShow, showRenderKey } from '../shows/host-shows';

export interface HostActions {
  addBot(): void;
  start(): void;
  restart(): void;
  setSettings(s: Partial<LobbySettings>): void;
  menuNav(nav: { view?: MenuView; focus?: ShowId }): void;
}

const LENGTHS: { id: GameLength; label: string }[] = [
  { id: 'short', label: `Corta · ${CONFIG.GAMES_PER_LENGTH.short} giochi` },
  { id: 'normal', label: `Normale · ${CONFIG.GAMES_PER_LENGTH.normal} giochi` },
  { id: 'long', label: `Lunga · ${CONFIG.GAMES_PER_LENGTH.long} giochi` }
];

export function phaseKey(s: RoomSnapshot): string {
  const d = s.phaseData;
  if (d.phase === 'PLAY') {
    const st = d.state;
    return `PLAY|${d.game}|${st.step}|${'question' in st ? st.question.id : ''}|${st.step === 'pass' || st.step === 'bet' || st.step === 'transfers' ? s.endsAt : ''}`;
  }
  if (d.phase === 'WHEEL' || d.phase === 'GAME_INTRO' || d.phase === 'GAME_RESULT') return `${d.phase}|${d.gameNumber}`;
  if (d.phase === 'CARD_PICK' || d.phase === 'CARD_RESOLVE') return `${d.phase}|${d.game}|${s.endsAt === null}`;
  // Gli Show cambiano stato di continuo: per la musica e le reazioni conta solo quale Show è in corso.
  if (d.phase === 'SHOW') return `SHOW|${d.show}`;
  return s.phase;
}

export function canStart(s: RoomSnapshot) {
  const online = s.players.filter((p) => p.connected);
  return online.length >= CONFIG.MIN_PLAYERS && online.every((p) => p.ready && p.characterId);
}

export class HostUI {
  private panel = document.getElementById('panel')!;
  private phaseLabel = document.getElementById('phase-label')!;
  private codeChip = document.getElementById('code-chip')!;
  private timerText = document.getElementById('timer-text')!;
  private timerBar = document.getElementById('timer-bar')!;
  private key = '';
  private join: { urls: string[]; index: number; qr: string } | null = null;
  /** Rete Wi-Fi senza internet (hotspot del PC o di un telefono) da mostrare come QR. */
  private wifi: { ssid: string; password: string; qr: string; source: 'pc' | 'manual' } | null = null;
  private wifiForm = false;
  private endsAt: number | null = null;
  private total = 1;
  /** Era in pausa all'ultimo aggiornamento: alla ripresa la barra del tempo non deve tornare piena. */
  private wasPaused = false;
  private lastSecond = -1;
  private s: RoomSnapshot | null = null;
  private panelCleanup: (() => void) | null = null;

  constructor(
    private actions: HostActions,
    private onTick: (secondsLeft: number, phase: string) => void,
    private onCycleUrl: () => void,
    private onWifiSave: (wifi: { ssid: string; password: string } | null) => void
  ) {
    this.panel.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      if (form.id !== 'wifi-form') return;
      e.preventDefault();
      const data = new FormData(form);
      const ssid = String(data.get('ssid') ?? '').trim();
      if (!ssid) return;
      this.wifiForm = false;
      this.onWifiSave({ ssid, password: String(data.get('password') ?? '') });
    });
    this.panel.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'bot') this.actions.addBot();
      if (act === 'start') this.actions.start();
      if (act === 'restart') this.actions.restart();
      if (act === 'url') this.onCycleUrl();
      if (act === 'wifi-open' || act === 'wifi-cancel') {
        this.wifiForm = act === 'wifi-open';
        this.key = '';
        if (this.s) this.render(this.s);
        if (this.wifiForm) this.panel.querySelector<HTMLInputElement>('#wifi-form input')?.focus();
      }
      if (act === 'wifi-clear') {
        this.wifiForm = false;
        this.onWifiSave(null);
      }
      if (this.s && handlePackClick(t, this.s, { nav: (n) => this.actions.menuNav(n), set: (x) => this.actions.setSettings(x) })) return;
      const len = t.closest<HTMLElement>('[data-length]')?.dataset.length as GameLength | undefined;
      if (len) this.actions.setSettings({ length: len });
      if (this.s?.phaseData.phase !== 'LOBBY') return;
      const st = this.s.phaseData.settings;
      const data = t.closest<HTMLElement>('[data-pack],[data-mode],[data-game],[data-seq-add],[data-seq-up],[data-seq-del]')?.dataset;
      if (!data) return;
      if (data.pack) {
        const ex = new Set(st.excluded);
        if (ex.has(data.pack)) ex.delete(data.pack);
        else ex.add(data.pack);
        this.actions.setSettings({ excluded: [...ex] });
      }
      if (data.mode) this.actions.setSettings({ mode: data.mode as LobbySettings['mode'] });
      if (data.game) {
        const id = data.game as GameId;
        this.actions.setSettings({ games: st.games.includes(id) ? st.games.filter((g) => g !== id) : [...st.games, id] });
      }
      if (data.seqAdd && st.sequence.length < CONFIG.MAX_SEQUENCE) this.actions.setSettings({ sequence: [...st.sequence, data.seqAdd as GameId] });
      if (data.seqDel) this.actions.setSettings({ sequence: st.sequence.filter((_, i) => i !== Number(data.seqDel)) });
      if (data.seqUp) {
        const i = Number(data.seqUp);
        const seq = st.sequence.slice();
        [seq[i - 1], seq[i]] = [seq[i], seq[i - 1]];
        this.actions.setSettings({ sequence: seq });
      }
    });
    setInterval(() => this.updateTimer(), 100);
  }

  setWifi(wifi: HostUI['wifi']) {
    this.wifi = wifi;
    this.key = '';
    if (this.s) this.render(this.s);
  }

  setJoin(urls: string[], index: number, qr: string) {
    this.join = { urls, index, qr };
    this.key = '';
    if (this.s) this.render(this.s);
  }

  private name(id: string | null | undefined) {
    return esc(this.s?.players.find((p) => p.id === id)?.name ?? '???');
  }

  render(s: RoomSnapshot) {
    this.s = s;
    if (s.endsAt !== this.endsAt) {
      const resumed = this.wasPaused && !s.paused;
      this.endsAt = s.endsAt;
      if (!resumed) this.total = Math.max(1, clock.remaining(s.endsAt) ?? 1);
      this.lastSecond = -1;
    }
    this.wasPaused = !!s.paused;
    this.codeChip.textContent = s.code;
    this.phaseLabel.textContent = this.phaseText(s);

    const key = this.renderKey(s);
    if (key !== this.key) {
      this.key = key;
      this.panelCleanup?.();
      this.panelCleanup = null;
      this.panel.innerHTML = this.html(s);
      this.afterRender(s);
    }
    this.updateLive(s);
  }

  private phaseText(s: RoomSnapshot) {
    const d = s.phaseData;
    switch (d.phase) {
      case 'LOBBY':
        return "Sala d'attesa";
      case 'GAME_OVER':
        return 'Fine partita';
      case 'PYRAMID_INTRO':
        return 'Finale';
      case 'WHEEL':
      case 'GAME_INTRO':
      case 'GAME_RESULT':
        return `Gioco ${d.gameNumber} di ${d.totalGames}`;
      case 'CARD_PICK':
      case 'CARD_RESOLVE':
        return `${GAMES[d.game].icon} ${GAMES[d.game].name}`;
      case 'PLAY':
        return d.game === 'pyramid' ? '🔺 Finale' : `${GAMES[d.game].icon} ${GAMES[d.game].name}`;
      case 'SHOW':
        return `${getShowMeta(d.show).icon} ${getShowMeta(d.show).name}`;
    }
  }

  private renderKey(s: RoomSnapshot) {
    const d = s.phaseData;
    if (d.phase === 'LOBBY') {
      const ready = s.players.map((p) => `${p.connected ? 1 : 0}${p.ready ? 1 : 0}${p.characterId ? 1 : 0}${p.name}`).join('|');
      return `LOBBY|${this.join?.index}|${!!this.join}|${this.wifi?.ssid}|${this.wifi?.password}|${this.wifiForm}|${s.players.length}|${ready}|${JSON.stringify(s.menu)}|${JSON.stringify(d.settings)}|${JSON.stringify(d.packs)}`;
    }
    if (d.phase === 'SHOW') return showRenderKey(s);
    if (d.phase === 'PLAY' && (d.state.step === 'blitz' || d.state.step === 'blitzEnd')) return `${phaseKey(s)}|${JSON.stringify(d.state.progress)}`;
    // Indizio dopo Indizio: il testo svelato cambia, il pannello va ridisegnato (phaseKey no: resetterebbe musica/reazioni).
    if (d.phase === 'PLAY' && d.state.step === 'question' && d.state.question.clue) return `${phaseKey(s)}|${d.state.question.text}`;
    return phaseKey(s);
  }

  /** Aggiornamenti leggeri senza ridisegnare il pannello (contatori). */
  private updateLive(s: RoomSnapshot) {
    const live = this.panel.querySelector('[data-live]');
    if (live) {
      const online = s.players.filter((p) => p.connected);
      live.textContent = `${online.filter((p) => p.hasActed).length}/${online.length}`;
    }
  }

  private updateTimer() {
    if (this.s?.paused) return; // in pausa il conto alla rovescia resta fermo
    const rem = this.endsAt === null ? null : clock.remaining(this.endsAt);
    if (rem === null) {
      if (this.timerText.textContent) this.timerText.textContent = '';
      this.timerBar.style.transform = 'scaleX(0)';
      return;
    }
    const sec = Math.ceil(rem / 1000);
    if (this.timerText.textContent !== String(sec)) this.timerText.textContent = String(sec);
    this.timerBar.style.transform = `scaleX(${Math.min(1, rem / this.total)})`;
    this.timerBar.classList.toggle('urgent', sec <= 5);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      if (this.s) this.onTick(sec, this.s.phase);
    }
  }

  /** Animazioni del pannello: rullo della ruota, testo svelato parola per parola. */
  private afterRender(s: RoomSnapshot) {
    const d = s.phaseData;
    if (d.phase === 'WHEEL') {
      const strip = this.panel.querySelector<HTMLElement>('.reel-strip');
      if (strip) {
        const item = strip.querySelector<HTMLElement>('.reel-item')!;
        const step = item.offsetWidth + 16;
        const stop = d.stop;
        const offset = -(stop * step) + (strip.parentElement!.clientWidth - item.offsetWidth) / 2;
        requestAnimationFrame(() => {
          strip.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.7, 0.15, 1)';
          strip.style.transform = `translateX(${offset}px)`;
        });
        const t = setTimeout(() => strip.children[stop]?.classList.add('chosen'), 3300);
        this.panelCleanup = () => clearTimeout(t);
      }
    }
    if (d.phase === 'PLAY' && d.state.step === 'question' && d.state.question.clue) {
      const el = this.panel.querySelector<HTMLElement>('.qtext');
      const q = d.state.question;
      if (el && q.clue) {
        const words = q.text.split(/\s+/);
        const { startedAt, wordMs } = q.clue;
        const draw = () => {
          const shown = Math.min(words.length, Math.max(1, Math.floor((clock.now() - startedAt) / wordMs) + 1));
          el.innerHTML = words.map((w, i) => (i < shown ? esc(w) : '<span class="clue-hidden">▮▮▮</span>')).join(' ');
          return shown >= words.length;
        };
        draw();
        const t = setInterval(() => draw() && clearInterval(t), 120);
        this.panelCleanup = () => clearInterval(t);
      }
    }
  }

  // ------------------------------------------------------------ template

  private html(s: RoomSnapshot): string {
    const d = s.phaseData;
    switch (d.phase) {
      case 'LOBBY':
        return this.lobby(s);
      case 'WHEEL':
        return `
          <div class="phase-title pop">🎡 Gioco ${d.gameNumber} di ${d.totalGames}</div>
          <div class="reel"><div class="reel-strip">${d.reel.map((id) => `
            <div class="reel-item" style="--gc:${GAMES[id].color}"><span>${GAMES[id].icon}</span>${esc(GAMES[id].name)}</div>`).join('')}
          </div><div class="reel-marker"></div></div>`;
      case 'GAME_INTRO': {
        const g = GAMES[d.game];
        return `
          <div class="game-intro pop" style="--gc:${g.color}">
            <div class="game-icon">${g.icon}</div>
            <div class="game-name">${esc(g.name)}</div>
            <ul class="game-rules">${g.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          </div>`;
      }
      case 'CARD_PICK':
        return `
          <div class="phase-title pop">🃏 Giocate le carte!</div>
          <div class="sub">Attacca, difenditi o prenditi un bonus dal telefono · Pronti: <b data-live></b></div>
          <div class="card-legend">${CARD_TYPES.filter((t) => !GAMES[d.game].cards.excluded.includes(t)).map((t) => `
            <div class="legend-card ${CARDS[t].kind}" style="--pw:${CARDS[t].color}"><span>${CARDS[t].icon}</span><b>${CARDS[t].label}</b></div>`).join('')}
          </div>
          ${GAMES[d.game].cards.note ? `<div class="sub card-note">⚖️ ${esc(GAMES[d.game].cards.note)}</div>` : ''}`;
      case 'CARD_RESOLVE':
        return `
          <div class="phase-title pop">💥 Le carte!</div>
          <div class="attacks ${d.events.length > 8 ? 'compact' : ''}">${d.events.slice(0, 12).map((e, i) => `<div class="attack pop" style="animation-delay:${0.15 + i * (d.events.length > 8 ? 0.2 : 0.45)}s">${this.eventText(e)}</div>`).join('')}
            ${d.events.length > 12 ? `<div class="attack">…e altre ${d.events.length - 12} carte!</div>` : ''}</div>`;
      case 'PLAY':
        return this.play(d.game, d.state);
      case 'SHOW':
        return renderHostShow(s, (id) => this.name(id), (id) => PLAYER_COLORS[Math.max(0, s.players.findIndex((p) => p.id === id)) % PLAYER_COLORS.length]);
      case 'GAME_RESULT':
        return this.scoreboard(s.players, `${GAMES[d.game].icon} ${GAMES[d.game].name} · Classifica`, d.deltas);
      case 'PYRAMID_INTRO':
        return `
          <div class="mg-intro pop">
            <div class="mg-badge gold">Finale</div>
            <div class="phase-title">La Scalata della Piramide della Conoscenza</div>
            <div class="rules">
              <div>📈 Si parte più in alto se si hanno più punti</div>
              <div>✅ Risposta giusta: <b>+1 gradino</b></div>
              <div>⚡ La più veloce: <b>+2 gradini</b></div>
              <div>🏆 Chi arriva per primo al gradino ${d.steps} vince!</div>
            </div>
            <div class="starts">${s.players.slice().sort((a, b) => b.pyramidStep - a.pyramidStep).map((p, i) => `
              <span class="start-chip pop" style="animation-delay:${2.6 + i * 0.25}s">${esc(p.name)} <b>${p.pyramidStep ? `gradino ${p.pyramidStep}` : 'da terra'}</b></span>`).join('')}
            </div>
          </div>`;
      case 'GAME_OVER': {
        const winner = s.players.find((p) => p.id === d.winnerId);
        return `
          <div class="gameover pop">
            <div class="mg-badge gold">Vincitore</div>
            <div class="winner">🏆 ${esc(winner?.name ?? '')}</div>
            <div class="podium">${d.podium.slice(0, 6).map((id, i) => {
              const p = s.players.find((x) => x.id === id);
              return `<div class="row"><span class="row-pos">${i + 1}°</span><span class="row-name">${this.name(id)}</span>
                <span class="row-mid">gradino ${p?.pyramidStep ?? 0}</span><b>${(p?.score ?? 0).toLocaleString('it-IT')}</b></div>`;
            }).join('')}</div>
            <button class="btn" data-act="restart">🔁 Gioca ancora</button>
          </div>`;
      }
    }
  }

  private eventText(e: CardEvent) {
    const c = CARDS[e.card];
    const last = e.path[e.path.length - 1];
    if (e.result === 'self') return `<b>${this.name(e.from)}</b> attiva <span class="attack-icon">${c.icon}</span> ${c.label}`;
    const reflected = e.path.length > 2 && last === e.from;
    const outcome =
      e.result === 'hit' ? (reflected ? '🔄 rimbalzato indietro!' : e.path.length > 2 ? '👻 deviato!' : 'colpito!') :
      e.result === 'blocked' ? `${CARDS[e.defense!].icon} bloccato!` :
      e.result === 'absorbed' ? `🧪 neutralizzato! +${CONFIG.ANTIDOTE_POINTS}` :
      e.result === 'crowded' ? '🛑 troppi attacchi, rimbalza!' :
      '👻 a vuoto!';
    return `<b>${this.name(e.from)}</b> <span class="attack-icon">${c.icon}</span> ➜ <b>${this.name(last)}</b> <em>${outcome}</em>`;
  }

  private qcard(q: QuestionPublic, head: string, body: string) {
    return `
      <div class="qcard pop">
        <div class="qhead">
          <span class="chip" style="background:${q.category.color}">${q.category.icon} ${esc(q.category.name)}</span>
          ${q.total ? `<span class="chip">Domanda ${q.number}/${q.total}</span>` : ''}
          ${head}
        </div>
        <h1 class="qtext">${esc(q.text)}</h1>
        ${q.image ? `<img class="q-image" src="${esc(q.image)}" alt="">` : ''}
        ${body}
      </div>`;
  }

  /** Chi ha scelto una risposta: nomi, oppure solo il conteggio con tanti giocatori. */
  private voters(list: AnswerResult[], withPoints: boolean) {
    if (!list.length) return '';
    if ((this.s?.players.length ?? 0) > 8) return `<em>👤 ${list.length}</em>`;
    return list.map((r) => `<em>${this.name(r.playerId)}${withPoints && r.points ? ` ${r.points > 0 ? '+' : ''}${r.points}` : ''}</em>`).join('');
  }

  private get crowded() {
    return (this.s?.players.length ?? 0) > 8 ? 'two-col' : '';
  }

  private options(q: QuestionPublic, reveal?: { correctIndex: number; voters: (i: number) => string }) {
    const imgs = q.optionImages;
    return `<div class="opts ${q.options.length === 2 ? 'two' : ''} ${imgs ? 'img' : ''}">${q.options.map((o, i) => `
      <div class="opt opt-${i} ${reveal ? (i === reveal.correctIndex ? 'correct' : 'wrong') : ''}" style="--oc:${OPTION_COLORS[i]}">
        <b>${reveal && i === reveal.correctIndex ? '✓' : OPTION_LETTERS[i]}</b>
        ${imgs ? `<img class="opt-img" src="${esc(imgs[i])}" alt="">` : ''}
        <span class="${imgs && !reveal ? 'sr-only' : ''}">${esc(o)}</span>
        ${reveal ? `<div class="voters">${reveal.voters(i)}</div>` : ''}
      </div>`).join('')}</div>`;
  }

  private play(game: string, st: PlayState): string {
    switch (st.step) {
      case 'vote':
        return `
          <div class="phase-title pop">Votate la categoria!</div>
          <div class="cats">${st.categories.map((c, i) => `
            <div class="cat pop" style="--cc:${c.color}; animation-delay:${i * 0.08}s"><div class="cat-icon">${c.icon}</div><div class="cat-name">${esc(c.name)}</div></div>`).join('')}
          </div>
          <div class="sub">🃏 il <b>Joker</b> impone la vostra scelta · Votato: <b data-live></b></div>`;
      case 'voteResult':
        return `
          <div class="phase-title">${st.jokerBy ? `🃏 Joker di ${this.name(st.jokerBy)}!` : 'La categoria è…'}</div>
          <div class="cats">${st.categories.map((c) => `
            <div class="cat ${c.id === st.category.id ? 'win' : 'lose'}" style="--cc:${c.color}">
              <div class="cat-icon">${c.icon}</div><div class="cat-name">${esc(c.name)}</div><div class="cat-votes">${st.tally[c.id] ?? 0} voti</div>
            </div>`).join('')}
          </div>`;
      case 'question': {
        let head = '<span class="chip">Risposte: <b data-live></b></span>';
        if (game === 'bomb') head = `<span class="chip hot">💣 ${this.name(st.holder)}</span>` + head;
        if (game === 'fastest') head = '<span class="chip hot">⚡ Vince il primo!</span>' + head;
        if (game === 'clues') head = '<span class="chip hot">🧩 Prima rispondi, più vinci</span>' + head;
        const listening = st.question.audio ? '<div class="listening">🎵 <span class="eq"><i></i><i></i><i></i><i></i><i></i></span> Ascoltate!</div>' : '';
        return this.qcard(st.question, head, listening + this.options(st.question));
      }
      case 'reveal': {
        const extra =
          game === 'fastest' ? `<span class="chip hot">${st.podium && st.podium.length > 1 ? `⚡ ${st.podium.map((id, i) => `${i + 1}° ${this.name(id)}`).join(' · ')}` : st.winner ? `⚡ ${this.name(st.winner)} è il più veloce!` : '⚡ Nessuno ha indovinato'}</span>` :
          game === 'bomb' ? `<span class="chip hot">💣 resta a ${this.name(st.holder)}</span>` : '';
        return this.qcard(st.question, extra, this.options(st.question, {
          correctIndex: st.correctIndex,
          voters: (i) => this.voters(st.results.filter((r) => r.optionIndex === i), true)
        }));
      }
      case 'steal':
        return this.qcard(
          st.question,
          `<span class="chip hot">🦝 Ladri: ${st.thieves.map((t) => `${this.name(t.playerId)} (${t.amount})`).join(', ')} · scelgono la vittima…</span>`,
          this.options(st.question, {
            correctIndex: st.correctIndex,
            voters: (i) => this.voters(st.results.filter((r) => r.optionIndex === i), false)
          })
        );
      case 'transfers':
        return `
          <div class="phase-title pop">🦝 Furti!</div>
          <div class="attacks">${st.transfers.map((t, i) => `
            <div class="attack pop" style="animation-delay:${i * 0.3}s"><b>${this.name(t.to)}</b> ruba <b class="gold">${t.amount}</b> punti a <b>${this.name(t.from)}</b></div>`).join('') || '<div class="attack">Nessuno da derubare!</div>'}
          </div>`;
      case 'bet':
        return `
          <div class="phase-title pop">🎰 Puntate! Domanda ${st.number} di ${st.total}</div>
          <div class="bet-cat-big pop" style="--cc:${st.category.color}"><span>${st.category.icon}</span>${esc(st.category.name)}</div>
          <div class="sub">Quanto vi fidate di voi stessi? · Puntato: <b data-live></b></div>`;
      case 'pass':
        return `<div class="phase-title pop">💣 ${this.name(st.holder)} ha risposto giusto!</div><div class="sub big">A chi lancerà la bomba?…</div>`;
      case 'boom':
        return `<div class="boom pop">💥 BOOM!</div><div class="sub big">${this.name(st.holder)} perde <b class="gold">${st.penalty}</b> punti</div>`;
      case 'numeric':
        return `
          <div class="qcard pop">
            <div class="qhead"><span class="chip" style="background:${st.question.category.color}">${st.question.category.icon} ${esc(st.question.category.name)}</span>
              <span class="chip">Domanda ${st.question.number}/${st.question.total}</span><span class="chip">Stime: <b data-live></b></span></div>
            <h1 class="qtext">${esc(st.question.text)}</h1>
            <div class="sub big">📏 Scrivete la vostra stima sul telefono${st.question.unit ? ` (in ${esc(st.question.unit)})` : ''}</div>
          </div>`;
      case 'numericReveal': {
        const rows = st.guesses.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
        return `
          <div class="qcard">
            <h1 class="qtext">${esc(st.question.text)}</h1>
            <div class="big-answer pop">${st.answer.toLocaleString('it-IT')} ${esc(st.question.unit)}</div>
            <div class="rows ${this.crowded}">${rows.map((g) => `
              <div class="row pop"><span class="row-pos">${g.rank ? `${g.rank}°` : '–'}</span><span class="row-name">${this.name(g.playerId)}</span>
              <span class="row-mid">${g.value === null ? 'nessuna stima' : g.value.toLocaleString('it-IT')}</span><b>${g.points ? `+${g.points}` : ''}</b></div>`).join('')}
            </div>
          </div>`;
      }
      case 'blitz':
      case 'blitzEnd': {
        const rows = st.progress.slice().sort((a, b) => b.points - a.points);
        const max = Math.max(1, ...rows.map((r) => r.points));
        return `
          <div class="scoreboard ${this.crowded}">
            <div class="phase-title">${st.step === 'blitz' ? '🔥 Raffica! Rispondete a più domande che potete' : '🔥 Fine della Raffica!'}</div>
            ${rows.map((r) => `
              <div class="score-row">
                <span class="row-pos">${r.multiplier > 1 ? `×${r.multiplier}` : ''}</span>
                <span class="row-name">${this.name(r.playerId)} ${r.streak >= 3 ? `🔥${r.streak}` : ''}</span>
                <span class="score-bar"><i style="width:${(r.points / max) * 100}%"></i></span>
                <b>${r.correct}/${r.answered} · ${r.points}</b>
              </div>`).join('')}
          </div>`;
      }
      case 'sabotage':
        return `
          <div class="mg-intro pop">
            <div class="mg-badge sabotage">Sabotaggio</div>
            <div class="phase-title">Gli ultimi in classifica scelgono chi colpire!</div>
            <div class="attacks">${st.saboteurs.map((s) => `
              <div class="attack">🔻 <b>${this.name(s.playerId)}</b> · ${s.left} ${s.left === 1 ? 'attacco' : 'attacchi'}</div>`).join('')}
            </div>
            <div class="sub">Pronti: <b data-live></b></div>
          </div>`;
      case 'sabotageResult':
        return `
          <div class="phase-title pop">🔻 Sabotaggio!</div>
          <div class="attacks">${st.events.map((e, i) => `<div class="attack pop" style="animation-delay:${0.15 + i * 0.45}s">${this.eventText(e)}</div>`).join('')}</div>`;
    }
  }

  private lobby(s: RoomSnapshot) {
    const d = s.phaseData;
    if (d.phase !== 'LOBBY') return '';
    const n = s.players.length;
    const url = this.join?.urls[this.join.index];
    const other = this.join && this.join.urls.length > 1 ? '<button class="link-btn small" data-act="url">Non funziona? Prova un altro indirizzo ↻</button>' : '';
    const wifiForm = `
      <form id="wifi-form" class="wifi-form">
        <div class="muted small">Nome e password dell'hotspot (del telefono o del PC): comparirà il QR per collegarsi.</div>
        <input name="ssid" placeholder="Nome della rete" maxlength="32" value="${esc(this.wifi?.ssid ?? '')}" required>
        <input name="password" placeholder="Password" maxlength="63" value="${esc(this.wifi?.password ?? '')}">
        <div><button class="btn" type="submit">Mostra QR</button> <button class="btn secondary" type="button" data-act="wifi-cancel">Annulla</button></div>
      </form>`;
    let join = '<div class="join-text"><div class="muted">Preparazione…</div></div>';
    if (this.join && url && this.wifi && !this.wifiForm) {
      // Gioco senza internet: prima ci si collega alla rete dell'hotspot, poi si apre il gioco.
      join = `
        <div class="join-steps">
          <div class="join-step"><span class="step-n">1</span><img class="qr small" src="${this.wifi.qr}" alt="QR della rete Wi-Fi">
            <div class="muted small">Collegati alla rete</div><b class="wifi-name">📶 ${esc(this.wifi.ssid)}</b>
            ${this.wifi.password ? `<small>password: <b>${esc(this.wifi.password)}</b></small>` : '<small>rete aperta</small>'}</div>
          <div class="join-step"><span class="step-n">2</span><img class="qr small" src="${this.join.qr}" alt="QR del gioco">
            <div class="muted small">Apri il gioco</div><div class="join-url small">${esc(url.replace(/^https?:\/\//, ''))}</div>${other}</div>
          <div class="join-step code"><div class="muted small">Codice stanza</div><div class="room-code">${esc(s.code)}</div>
            ${this.wifi.source === 'manual' ? '<button class="link-btn small" data-act="wifi-open">Cambia rete</button> <button class="link-btn small" data-act="wifi-clear">Togli</button>' : '<small class="muted">Hotspot del PC 🌲</small>'}</div>
        </div>`;
    } else if (this.join && url) {
      join = `<img class="qr" src="${this.join.qr}" alt="QR code per entrare">
         <div class="join-text">
           <div class="muted">Dal telefono (stesso Wi-Fi) inquadra il QR oppure apri</div>
           <div class="join-url">${esc(url.replace(/^https?:\/\//, ''))}</div>
           ${other}
           <div class="muted">Codice stanza</div>
           <div class="room-code">${esc(s.code)}</div>
           ${this.wifiForm ? wifiForm : '<button class="link-btn small" data-act="wifi-open">🌲 Senza internet? Mostra il QR dell\'hotspot</button>'}
         </div>`;
    }

    const online = s.players.filter((p) => p.connected);
    const ready = { total: online.length, done: online.filter((p) => p.ready && p.characterId).length, missing: online.filter((p) => !(p.ready && p.characterId)).map((p) => p.name) };
    const view = menuView(s);
    const focus = menuFocus(s);
    const hint = view === 'cover' ? 'Premi «Scegli un gioco» per cominciare.' : view === 'grid' ? 'Tocca un gioco per vederne le regole.' : '';

    let main: string;
    if (view === 'cover') {
      main = this.packCover();
    } else if (view === 'grid') {
      main = `
        <div class="hub-header-row">
          <span class="hub-section-title">🎮 Scegli il gioco della serata</span>
          <button class="pk-back" data-pk-view="cover">◀ Copertina</button>
        </div>
        ${packGrid(s, { canControl: true, tv: true })}`;
    } else {
      main = packDetail(s, { canControl: true, tv: true, extra: focus === 'quiz' ? this.quizExtra(s) : '' });
    }

    return `
      <div class="lobby pop">
        <div class="lobby-left">
          <div class="join-card">${join}</div>
          <div class="lobby-players-card">
            <h2>${ready.done} su ${ready.total} pronti <small>(max ${CONFIG.MAX_PLAYERS})</small></h2>
            <div class="ready-line ${ready.missing.length ? 'wait' : 'all'}">${n === 0 ? 'Nessuno è ancora entrato.' : ready.missing.length ? `Aspettiamo ${ready.missing.map(esc).join(', ')}` : 'Tutti pronti: il capo stanza può avviare.'}</div>
            ${hint ? `<div class="muted small">${hint}</div>` : ''}
            <div class="lobby-actions">
              <button class="btn secondary" data-act="bot" ${n >= CONFIG.MAX_PLAYERS ? 'disabled' : ''}>🤖 Aggiungi bot</button>
            </div>
          </div>
        </div>
        <div class="lobby-side">${main}</div>
      </div>`;
  }

  /** Copertina del Pack: la prima schermata, prima della griglia dei giochi. */
  private packCover() {
    return `
      <div class="pk pk-tv pk-cover">
        <span class="pk-edition">${esc(PACK.edition)}</span>
        <h1>${esc(PACK.name)}</h1>
        <p class="pk-tagline">${esc(PACK.tagline)}</p>
        <div class="pk-cats">${categorySummary().map((c) => `<span>${c.icon} ${esc(c.label)}<small>${c.count}</small></span>`).join('')}</div>
        <button class="btn pk-go" data-pk-view="grid">▶ Scegli un gioco</button>
        <div class="muted small">I giocatori entrano dal telefono con il QR a sinistra. Il capo stanza 👑 sceglie il gioco.</div>
      </div>`;
  }

  /** Impostazioni in più del quiz (modalità, giochi della ruota o scaletta, pacchetti), dentro il suo sottomenù. */
  private quizExtra(s: RoomSnapshot) {
    const d = s.phaseData;
    if (d.phase !== 'LOBBY') return '';
    const st = d.settings;
    const active = d.packs.filter((p) => !st.excluded.includes(p.id));
    const totals = active.reduce((t, p) => ({ mc: t.mc + p.multiple + p.truefalse, num: t.num + p.numeric }), { mc: 0, num: 0 });
    // Stessi requisiti del server (games/index.ts → gameAvailable), stimati dai totali dei pacchetti.
    const missing = (id: GameId) => (id === 'estimate' ? (totals.num < 2 ? 'servono domande numeriche' : '') : totals.mc < 4 ? 'servono più domande' : '');
    const chip = (id: GameId, attrs: string, cls: string) => {
      const why = missing(id);
      return `<button class="game-chip ${cls} ${why ? 'off' : ''}" ${attrs} title="${why}" style="--gc:${GAMES[id].color}">${GAMES[id].icon} ${esc(GAMES[id].name)}${why ? ' ⚠️' : ''}</button>`;
    };

    const gamesSetting = st.mode === 'wheel'
      ? `<div class="setting"><span class="muted">Giochi che possono uscire dalla ruota <small>(${st.games.length}/${GAME_IDS.length})</small></span>
           <div class="games">${GAME_IDS.map((id) => chip(id, `data-game="${id}"`, st.games.includes(id) ? 'on' : '')).join('')}</div>
         </div>`
      : `<div class="setting"><span class="muted">Scaletta: ${st.sequence.length} giochi, poi la finale <small>(tocca un gioco qui sotto per aggiungerlo)</small></span>
           <ol class="seq">${st.sequence.map((id, i) => `
             <li style="--gc:${GAMES[id].color}"><span>${i + 1}. ${GAMES[id].icon} ${esc(GAMES[id].name)}</span>
               <button data-seq-up="${i}" ${i === 0 ? 'disabled' : ''} title="Sposta su">▲</button>
               <button data-seq-del="${i}" title="Togli">✕</button></li>`).join('') || '<li class="empty-seq">Scaletta vuota</li>'}
           </ol>
           <div class="games">${GAME_IDS.map((id) => chip(id, `data-seq-add="${id}"`, 'add')).join('')}</div>
         </div>`;

    return `
      <div class="setting"><span class="muted">Come si scelgono i minigiochi</span>
        <div class="seg">
          <button data-mode="wheel" class="${st.mode === 'wheel' ? 'on' : ''}">🎡 Ruota casuale</button>
          <button data-mode="sequence" class="${st.mode === 'sequence' ? 'on' : ''}">📋 Scaletta in ordine</button>
        </div>
      </div>
      ${st.mode === 'wheel' ? `<div class="setting"><span class="muted">Durata rapida</span>
        <div class="seg">${LENGTHS.map((l) => `<button data-length="${l.id}" class="${st.length === l.id ? 'on' : ''}">${l.label}</button>`).join('')}</div>
      </div>` : ''}
      ${gamesSetting}
      <div class="setting"><span class="muted">Pacchetti di domande <small>(${totals.mc} domande + ${totals.num} numeriche)</small></span>
        <div class="packs">${d.packs.map((p) => `
          <button class="pack ${st.excluded.includes(p.id) ? '' : 'on'}" data-pack="${p.id}">
            ${st.excluded.includes(p.id) ? '⬜' : '✅'} ${esc(p.name)} <small>${p.multiple + p.truefalse + p.numeric}</small>
          </button>`).join('')}
          <a class="pack add" href="./editor.html" target="_blank">✏️ Laboratorio</a>
        </div>
      </div>`;
  }

  private scoreboard(players: PlayerPublic[], title: string, deltas: Record<string, number> = {}) {
    const sorted = players.slice().sort((a, b) => a.rank - b.rank);
    const max = Math.max(1, ...sorted.map((p) => p.score));
    return `
      <div class="scoreboard ${this.crowded}">
        <div class="phase-title">${title}</div>
        ${sorted.map((p, i) => {
          const dlt = deltas[p.id] ?? 0;
          return `
          <div class="score-row pop" style="animation-delay:${i * 0.08}s">
            <span class="row-pos">${p.rank}°</span>
            <span class="row-name">${esc(p.name)}</span>
            <span class="score-bar"><i style="width:${(p.score / max) * 100}%"></i></span>
            <b>${p.score.toLocaleString('it-IT')} ${dlt ? `<em class="${dlt > 0 ? 'up' : 'down'}">${dlt > 0 ? '+' : ''}${dlt}</em>` : ''}</b>
          </div>`;
        }).join('')}
      </div>`;
  }

  // ------------------------------------------------------------ effetti UI

  banner(text: string, color = 'var(--gold)') {
    const el = document.createElement('div');
    el.className = 'banner';
    el.style.setProperty('--bc', color);
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  toast(text: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  confetti() {
    const colors = ['#ffd60a', '#ff4d6d', '#4cc9f0', '#7bd389', '#c77dff', '#ff9f1c'];
    const layer = document.createElement('div');
    layer.className = 'confetti';
    for (let i = 0; i < 120; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 2.5}s`;
      c.style.animationDuration = `${2.5 + Math.random() * 2}s`;
      layer.appendChild(c);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 7000);
  }
}
