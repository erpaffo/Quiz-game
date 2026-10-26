import { COLPEVOLE, type ColpevolePublic } from '../../shared/colpevole';
import { CREATIVE, type CreativePublic, type Drawing, type Stroke } from '../../shared/creative';
import { type FilaPublic } from '../../shared/fila';
import { GUASTA, type GuastaPublic } from '../../shared/guastafeste';
import { LEGGENDE, type LeggendeHero, type LeggendeMonster, type LeggendePublic } from '../../shared/leggende';
import { getShowMeta, type ShowFinal, type ShowId, type ShowMeta } from '../../shared/shows';
import { SMIST, type SmistPublic, type SmistTeam } from '../../shared/smistatori';
import type { PlayerPublic, RoomSnapshot } from '../../shared/types';
import { esc } from '../common/net';

type NameFn = (id: string | null | undefined) => string;
type ColorFn = (id: string) => string;

export function renderHostShowBatch2(
  s: RoomSnapshot,
  showId: ShowId,
  meta: ShowMeta,
  raw: unknown,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string,
  renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn, extra?: (p: PlayerPublic) => string) => string
): string {
  switch (showId) {
    case 'fila':
      return renderFilaHost(s, meta, raw as FilaPublic, nameOf, colorOf, renderShowFinalHost, renderPlayerChips);
    case 'guastafeste':
      return renderGuastaHost(s, meta, raw as GuastaPublic, nameOf, colorOf, renderShowFinalHost, renderPlayerChips);
    case 'leggende':
      return renderLeggendeHost(s, meta, raw as LeggendePublic, nameOf, colorOf, renderShowFinalHost, renderPlayerChips);
    case 'creative':
      return renderCreativeHost(s, meta, raw as CreativePublic, nameOf, colorOf, renderShowFinalHost, renderPlayerChips);
    case 'colpevole':
      return renderColpevoleHost(s, meta, raw as ColpevolePublic, nameOf, colorOf, renderShowFinalHost, renderPlayerChips);
    case 'smistatori':
      return renderSmistatoriHost(s, meta, raw as SmistPublic, nameOf, colorOf, renderShowFinalHost);
    default:
      return renderGenericHostShow(s, showId, raw, nameOf, colorOf, renderPlayerChips);
  }
}

// ---------------------------------------------------------------------------
// 8. 🧩 FILA INDIANA
// ---------------------------------------------------------------------------

function renderFilaHost(
  s: RoomSnapshot,
  meta: ShowMeta,
  st: FilaPublic,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string,
  renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn) => string
): string {
  switch (st.step) {
    case 'sort':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Round ${st.number}/${st.total}</span>
            <span class="chip hot">1° ${esc(st.from)} ➔ ${st.items.length}° ${esc(st.to)}</span>
          </div>
          <h1 class="qtext">${esc(st.title)}</h1>
          <div class="opts two-col">
            ${st.items.map((it, i) => `<div class="opt pop" style="animation-delay:${i * 0.05}s"><span class="opt-letter">🧩</span><span class="opt-text">${esc(it.label)}</span></div>`).join('')}
          </div>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'reveal':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Soluzione ${st.number}/${st.total}</span>
            <span class="chip hot">${esc(st.from)} ➔ ${esc(st.to)}</span>
          </div>
          <h1 class="qtext">${esc(st.title)}</h1>
          <div class="num-Wait">
            ${st.correct.map((c, i) => `<div class="num-row pop best" style="animation-delay:${i * 0.08}s"><span>${i + 1}°</span><b>${esc(c.label)}</b><span></span><em class="up">${esc(c.value)}</em></div>`).join('')}
          </div>
          <div class="tempo-players-status">
            ${st.results.map((r) => `<span class="start-chip ${r.perfect ? 'done-chip' : ''}" style="--pc:${colorOf(r.playerId)}">${r.perfect ? '🎯 FILA PERFETTA!' : ''} ${nameOf(r.playerId)} <b>+${r.points}</b></span>`).join('')}
          </div>
        </div>`;

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 9. 💥 GUASTAFESTE
// ---------------------------------------------------------------------------

function renderGuastaHost(
  s: RoomSnapshot,
  meta: ShowMeta,
  st: GuastaPublic,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string,
  renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn) => string
): string {
  switch (st.step) {
    case 'favorite':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead"><span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total} · ${esc(st.roundName)}</span></div>
          <h1 class="qtext">Scrivete sul telefono una cosa che amate… gli altri dovranno rovinarla!</h1>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'write':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead"><span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Round ${st.round}/${st.total} · ${esc(st.roundName)}</span></div>
          <h1 class="qtext">Rispondete ai vostri 2 temi sul telefono!</h1>
          ${renderPlayerChips(s, st.submitted, colorOf)}
        </div>`;

    case 'vote':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Sfida ${st.index}/${st.count} · ${esc(st.roundName)}</span>
            <span class="chip hot">Votate sul telefono!</span>
          </div>
          <h1 class="qtext">${esc(st.prompt)}</h1>
          <div class="guasta-duel">
            <div class="show-card duel-card pop"><div class="duel-badge">A</div><div class="duel-text">«${esc(st.answers[0])}»</div></div>
            <div class="duel-vs">⚡ VS ⚡</div>
            <div class="show-card duel-card pop" style="animation-delay:0.1s"><div class="duel-badge">B</div><div class="duel-text">«${esc(st.answers[1])}»</div></div>
          </div>
          ${renderPlayerChips(s, st.voted, colorOf)}
        </div>`;

    case 'result':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Risultato ${st.index}/${st.count}</span>
            ${st.sweep ? `<span class="chip hot">💥 CAPPOTTO! +${GUASTA.SWEEP_BONUS * st.round}</span>` : ''}
          </div>
          <h1 class="qtext">${esc(st.prompt)}</h1>
          <div class="guasta-duel">
            ${st.answers.map((a, i) => `<div class="show-card duel-card ${a.votes >= (st.answers[1 - i]?.votes ?? 0) && a.votes > 0 ? 'winner' : ''} pop"><div class="duel-author" style="color:${colorOf(a.playerId)}">${nameOf(a.playerId)}</div><div class="duel-text">«${esc(a.text)}»</div><div class="match-pts">${a.votes} ${a.votes === 1 ? 'voto' : 'voti'} · <b>+${a.points} pti</b></div></div>`).join('<div class="duel-vs">⚡</div>')}
          </div>
        </div>`;

    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 10. 🐉 LEGGENDE DEL QUIZ
// ---------------------------------------------------------------------------

function renderMonsterBar(m: LeggendeMonster, stage: number, stages: number, gold: number): string {
  const pct = Math.max(0, Math.min(100, Math.round((m.hp / Math.max(1, m.maxHp)) * 100)));
  return `
    <div class="leggende-monster-bar">
      <div class="monster-head">
        <span class="monster-icon">${m.icon}</span>
        <div>
          <b>${esc(m.name)}</b> ${m.boss ? '<span class="chip hot">🔥 BOSS FINALE</span>' : `<small class="muted">(Mostro ${stage}/${stages})</small>`}
          <div class="monster-hp-track"><i style="width:${pct}%"></i></div>
        </div>
        <span class="monster-hp-val">❤️ ${m.hp}/${m.maxHp}</span>
        <span class="chip" style="background:#ffd60a;color:#14063a">💰 ${gold} oro</span>
      </div>
    </div>`;
}

function renderHeroesBar(heroes: LeggendeHero[], nameOf: NameFn, colorOf: ColorFn): string {
  return `
    <div class="tempo-players-status">
      ${heroes.map((h) => {
        const hearts = h.hearts > 0 ? '❤️'.repeat(h.hearts) : '💀 KO';
        const items = h.items.map((it) => LEGGENDE.ITEMS[it].icon).join('');
        return `<span class="start-chip ${h.hearts > 0 ? 'done-chip' : 'waiting-chip'}" style="--pc:${colorOf(h.playerId)}">${nameOf(h.playerId)} ${hearts} ${h.shielded ? '🛡️' : ''} ${items} <small>(⚔️${h.damage})</small></span>`;
      }).join('')}
    </div>`;
}

function renderLeggendeHost(
  s: RoomSnapshot,
  meta: ShowMeta,
  st: LeggendePublic,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string,
  _renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn) => string
): string {
  switch (st.step) {
    case 'intro':
      return `<div class="qcard show-stage pop">${renderMonsterBar(st.monster, st.stage, st.stages, st.gold)}<div class="big-answer pop">${st.monster.icon} ${esc(st.monster.name)}</div><div class="sub big">⚔️ Ogni risposta giusta infligge <b>${LEGGENDE.DAMAGE} danni</b>!</div>${renderHeroesBar(st.heroes, nameOf, colorOf)}</div>`;
    case 'question':
      return `<div class="qcard show-stage pop">${renderMonsterBar(st.monster, st.stage, st.stages, st.gold)}<div class="qhead"><span class="chip" style="background:${meta.color};color:#fff">⚔️ Attacco #${st.number} · ${esc(st.question.category)}</span></div><h1 class="qtext">${esc(st.question.text)}</h1><div class="opts">${st.question.options.map((o, i) => `<div class="opt"><span class="opt-letter">${String.fromCharCode(65 + i)}</span><span class="opt-text">${esc(o)}</span></div>`).join('')}</div>${renderHeroesBar(st.heroes, nameOf, colorOf)}</div>`;
    case 'result': {
      const totalDmg = st.results.reduce((sum, r) => sum + r.damage, 0);
      const outcomeBanner = st.outcome === 'defeated' ? '🎉 MOSTRO SCONFITTO!' : st.outcome === 'escaped' ? '💨 Il mostro è fuggito!' : totalDmg > 0 ? `⚔️ Colpo di squadra: -${totalDmg} PV!` : '😱 Nessun danno!';
      const atkBanner = st.attack ? `<div class="sub big" style="color:#ff4d6d">🔥 Contrattacco! ${st.attack.hit.length ? `Colpiti (-1 ❤️): ${st.attack.hit.map(nameOf).join(', ')}` : ''} ${st.attack.blocked.length ? `🛡️ Parato: ${st.attack.blocked.map(nameOf).join(', ')}` : ''}</div>` : '';
      return `<div class="qcard show-stage pop">${renderMonsterBar(st.monster, st.stage, st.stages, st.gold)}<div class="phase-title">${outcomeBanner}</div>${atkBanner}<div class="opts">${st.question.options.map((o, i) => `<div class="opt ${i === st.correctIndex ? 'correct' : 'dim'}"><span class="opt-letter">${String.fromCharCode(65 + i)}</span><span class="opt-text">${esc(o)}</span><div class="voters">${st.results.filter((r) => r.optionIndex === i).map((p) => `<em>${nameOf(p.playerId)}${p.damage ? ` -${p.damage}` : ''}</em>`).join('')}</div></div>`).join('')}</div>${renderHeroesBar(st.heroes, nameOf, colorOf)}</div>`;
    }
    case 'shop':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:#ffd60a;color:#14063a">🛒 Mercante · 💰 ${st.gold} oro di squadra</span></div><div class="phase-title">Acquistate oggetti o rianimate i caduti dal telefono!</div><div class="show-cards-grid">${(Object.keys(LEGGENDE.ITEMS) as (keyof typeof LEGGENDE.ITEMS)[]).map((k) => { const it = LEGGENDE.ITEMS[k]; return `<div class="show-card"><div class="match-word">${it.icon} ${esc(it.name)}</div><div class="match-pts">💰 ${it.price} oro</div><small class="muted">${esc(it.description)}</small></div>`; }).join('')}</div>${renderHeroesBar(st.heroes, nameOf, colorOf)}</div>`;
    case 'victory':
    case 'defeat':
      return `<div class="qcard show-stage pop"><div class="mg-badge ${st.step === 'victory' ? 'gold' : 'sabotage'}">${st.step === 'victory' ? '🏆 VITTORIA EROICA!' : '💀 LA SQUADRA È CADUTA!'}</div>${renderHeroesBar(st.heroes, nameOf, colorOf)}</div>`;
    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 11. ✏️ SCARABOCCHI ANIMATI
// ---------------------------------------------------------------------------

function strokeToPolyline(s: Stroke): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) pts.push(`${s.p[i]},${s.p[i + 1]}`);
  const color = CREATIVE.COLORS[s.c] ?? '#1d1d1f';
  const width = CREATIVE.WIDTHS[s.w] ?? 14;
  if (pts.length === 1) return `<circle cx="${s.p[0]}" cy="${s.p[1]}" r="${width / 2}" fill="${color}" />`;
  return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" />`;
}

export function renderAnimatedDrawingSvg(drawing: Drawing): string {
  const f0 = (drawing[0] ?? []).map(strokeToPolyline).join('');
  const f1 = (drawing[1] ?? drawing[0] ?? []).map(strokeToPolyline).join('');
  return `<div class="creative-svg-wrap pop"><svg viewBox="0 0 ${CREATIVE.CANVAS} ${CREATIVE.CANVAS}" class="creative-svg"><rect width="${CREATIVE.CANVAS}" height="${CREATIVE.CANVAS}" rx="36" fill="#ffffff" /><g class="creative-frame frame-0">${f0}</g><g class="creative-frame frame-1">${f1}</g></svg></div>`;
}

function renderCreativeHost(
  s: RoomSnapshot,
  meta: ShowMeta,
  st: CreativePublic,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string,
  renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn) => string
): string {
  switch (st.step) {
    case 'draw':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} ${esc(meta.name)}</span><span class="chip hot">🎨 Disegnate in 2 fotogrammi sul telefono!</span></div><h1 class="qtext">Ognuno ha ricevuto un titolo segreto da animare!</h1>${renderPlayerChips(s, st.submitted, colorOf)}</div>`;
    case 'title':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Opera ${st.index}/${st.count} · Artista: ${nameOf(st.artistId)}</span><span class="chip hot">Inventate un titolo falso!</span></div>${renderAnimatedDrawingSvg(st.drawing)}${renderPlayerChips(s, st.submitted, colorOf)}</div>`;
    case 'choose':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Opera ${st.index}/${st.count} · Artista: ${nameOf(st.artistId)}</span><span class="chip hot">Qual è il TITOLO VERO?</span></div><div class="creative-split">${renderAnimatedDrawingSvg(st.drawing)}<div class="opts">${st.options.map((o, i) => `<div class="opt pop" style="animation-delay:${i * 0.05}s"><span class="opt-letter">${String.fromCharCode(65 + i)}</span><span class="opt-text">${esc(o.text)}</span></div>`).join('')}</div></div>${renderPlayerChips(s, st.chosen, colorOf)}</div>`;
    case 'reveal':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:${meta.color};color:#14063a">${meta.icon} Rivelazione ${st.index}/${st.count} · Artista: ${nameOf(st.artistId)}</span></div><div class="creative-split">${renderAnimatedDrawingSvg(st.drawing)}<div class="opts">${st.options.map((o, i) => `<div class="opt ${o.isTruth ? 'correct' : o.pickedBy.length ? 'fooled' : 'dim'} pop" style="animation-delay:${i * 0.08}s"><span class="opt-letter">${o.isTruth ? '✓' : '🎭'}</span><div class="opt-body"><div class="opt-text">${esc(o.text)}</div><small class="opt-meta">${o.isTruth ? `🎨 TITOLO VERO (${nameOf(st.artistId)})` : o.authors.length ? `🎭 Falso di ${o.authors.map(nameOf).join(', ')}` : '🏠 Titolo della casa'}</small></div><div class="voters">${o.pickedBy.map((id) => `<em>${nameOf(id)}</em>`).join('')}</div></div>`).join('')}</div></div></div>`;
    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 12. 🔍 IL COLPEVOLE (Suspectives)
// ---------------------------------------------------------------------------

function renderColpevoleHost(
  s: RoomSnapshot,
  meta: ShowMeta,
  st: ColpevolePublic,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string,
  renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn) => string
): string {
  switch (st.step) {
    case 'survey':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Sondaggio Preliminare</span></div><h1 class="qtext">Rispondete alle ${COLPEVOLE.QUESTIONS} domande sul vostro telefono: diventeranno gli indizi del caso!</h1>${renderPlayerChips(s, st.submitted, colorOf)}</div>`;
    case 'role':
      return `<div class="qcard show-stage pop"><div class="qhead"><span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Caso ${st.case}/${st.cases}</span></div><h1 class="qtext">🤫 Scoprite il vostro ruolo sul telefono!</h1><div class="sub big">Il <b>Colpevole</b> può falsificare in segreto una delle sue risposte sul tabellone…</div></div>`;
    case 'clue':
    case 'alibi':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Caso ${st.case}/${st.cases} · Indizi ${st.clues.length}/${COLPEVOLE.CLUES}</span>
            ${st.step === 'alibi' ? '<span class="chip hot">📝 Scrivete il vostro alibi!</span>' : ''}
          </div>
          <div class="show-cards-grid">
            ${st.clues.map((c, i) => {
              const q = st.questions[c.questionIndex];
              return `<div class="show-card pop" style="animation-delay:${i * 0.08}s"><small class="muted">${esc(q?.text ?? '')}</small><div class="match-word">🔍 «${esc(q?.options[c.answer] ?? '')}»</div></div>`;
            }).join('')}
          </div>
          <div class="sub">Sospettati che combaciano sul tabellone: ${st.suspects.length ? st.suspects.map(nameOf).join(', ') : 'Nessuno (qualcuno ha falsificato una risposta!)'}</div>
          ${st.step === 'alibi' ? renderPlayerChips(s, st.submitted, colorOf) : ''}
        </div>`;
    case 'vote':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead"><span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Caso ${st.case}/${st.cases} · Accusa Finale!</span></div>
          <div class="show-cards-grid">
            ${st.alibis.map((a) => `<div class="show-card" style="--pc:${colorOf(a.playerId)}"><b style="color:${colorOf(a.playerId)}">${nameOf(a.playerId)} ${st.suspects.includes(a.playerId) ? '⚠️' : ''}</b><div class="duel-text">«${esc(a.text ?? 'Nessun alibi')}»</div></div>`).join('')}
          </div>
          ${renderPlayerChips(s, st.voted, colorOf)}
        </div>`;
    case 'reveal': {
      const fQuestion = st.falsified !== null ? st.questions[st.falsified]?.text : null;
      return `
        <div class="qcard show-stage pop">
          <div class="mg-badge ${st.caught ? 'gold' : 'sabotage'}">${st.caught ? '🎉 COLPEVOLE SMASCHERATO!' : '🕵️ IL COLPEVOLE L\'HA FATTA FRANCA!'}</div>
          <h1 class="qtext">Il Colpevole era ${nameOf(st.culpritId)}!</h1>
          <div class="sub">${fQuestion ? `Aveva falsificato la risposta a: «${esc(fQuestion)}»` : 'Non aveva falsificato nessuna risposta!'}</div>
          <div class="num-Wait">
            ${st.votes.map((v) => `<div class="num-row pop"><span>🗳️</span><b>${nameOf(v.playerId)}</b><span>ha accusato <b>${v.targetId ? nameOf(v.targetId) : 'nessuno'}</b></span><em class="up">+${st.points[v.playerId] ?? 0}</em></div>`).join('')}
          </div>
        </div>`;
    }
    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

// ---------------------------------------------------------------------------
// 13. 🗂️ SMISTATORI (Idol Factions)
// ---------------------------------------------------------------------------

function renderSmistatoriHost(
  _s: RoomSnapshot,
  meta: ShowMeta,
  st: SmistPublic,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderShowFinalHost: (meta: ShowMeta, st: ShowFinal, nameOf: NameFn) => string
): string {
  switch (st.step) {
    case 'teams':
      return `
        <div class="qcard show-stage pop">
          <div class="mg-badge gold">${meta.icon} SQUADRE PRONTE!</div>
          <div class="guasta-duel">
            <div class="show-card duel-card"><div class="match-word">🟦 Squadra A</div><div>${st.teams.A.map((id) => `<span class="start-chip" style="--pc:${colorOf(id)}">${nameOf(id)}</span>`).join(' ')}</div></div>
            <div class="duel-vs">⚡ VS ⚡</div>
            <div class="show-card duel-card"><div class="match-word">🟧 Squadra B</div><div>${st.teams.B.map((id) => `<span class="start-chip" style="--pc:${colorOf(id)}">${nameOf(id)}</span>`).join(' ')}</div></div>
          </div>
        </div>`;
    case 'round':
      return `
        <div class="qcard show-stage pop">
          <div class="qhead">
            <span class="chip" style="background:${meta.color};color:#fff">${meta.icon} Round ${st.round}/${st.total}</span>
            <span class="chip hot">⬅️ ${esc(st.left)} · vs · ${esc(st.right)} ➡️</span>
          </div>
          <div class="guasta-duel">
            ${(['A', 'B'] as SmistTeam[]).map((tm) => {
              const t = st.teams[tm];
              return `<div class="show-card duel-card">
                <div class="match-word">${tm === 'A' ? '🟦 Squadra A' : '🟧 Squadra B'}</div>
                <div class="big-answer">${t.score} pti</div>
                <div class="sub">${t.streak >= SMIST.STREAK ? `🔥 Serie x${SMIST.STREAK_MULT} (${t.streak})` : `Serie: ${t.streak}`} · ${t.done}/${t.total}</div>
                <div class="match-pts">📱 In mano a: <b>${t.assignee ? nameOf(t.assignee) : 'Completato!'}</b></div>
              </div>`;
            }).join('<div class="duel-vs">⚡</div>')}
          </div>
          <div class="tempo-players-status">
            ${st.feed.map((f) => `<span class="start-chip ${f.correct ? 'done-chip' : 'waiting-chip'}">${f.correct ? '✓' : '✗'} [${f.team}] ${nameOf(f.playerId)}: «${esc(f.word)}»</span>`).join('')}
          </div>
        </div>`;
    case 'result':
      return `
        <div class="qcard show-stage pop">
          <div class="mg-badge gold">${st.winner ? `🏆 VINCE LA SQUADRA ${st.winner}!` : '🤝 PAREGGIO!'}</div>
          <h1 class="qtext">🟦 Squadra A: ${st.teams.A.score} pti — 🟧 Squadra B: ${st.teams.B.score} pti</h1>
        </div>`;
    case 'final':
      return renderShowFinalHost(meta, st, nameOf);
  }
}

function renderGenericHostShow(
  s: RoomSnapshot,
  showId: string,
  rawState: unknown,
  nameOf: NameFn,
  colorOf: ColorFn,
  renderPlayerChips: (s: RoomSnapshot, actedIds: string[], colorOf: ColorFn) => string
): string {
  const show = getShowMeta(showId);
  const st = rawState as Record<string, unknown>;
  const headline = String(st.prompt ?? st.question ?? st.event ?? st.title ?? '');
  return `<div class="qcard show-stage pop"><div class="phase-title">${show.icon} ${esc(show.name)}</div>${headline ? `<h1 class="qtext">${esc(headline)}</h1>` : ''}${renderPlayerChips(s, s.players.filter((p) => p.hasActed).map((p) => p.id), colorOf)}</div>`;
}