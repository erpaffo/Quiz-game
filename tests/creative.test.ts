import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { CREATIVE, drawingError, type CreativePrivate, type CreativePublic, type Drawing } from '../shared/creative';
import { BOT_DOODLES } from '../server/shows/creative/doodles';
import { CREATIVE_PROMPTS } from '../server/shows/creative/CreativeShow';
import { activeShow, makeRoom, runToMenu, startShow, useFakeTime } from './helpers';

useFakeTime();

const doodle = (): Drawing => [[{ c: 0, w: 1, p: [10, 10, 500, 500, 900, 120] }], [{ c: 1, w: 0, p: [20, 20, 600, 600] }]];

describe('Scarabocchi Animati', () => {
  it('drawingError: accetta un disegno valido, rifiuta quelli malformati o enormi', () => {
    assert.equal(drawingError(doodle()), null);
    assert.ok(drawingError([[]]));
    assert.ok(drawingError([[], []]), 'vuoto');
    assert.ok(drawingError([[{ c: 99, w: 0, p: [1, 1] }], []]), 'colore');
    assert.ok(drawingError([[{ c: 0, w: 0, p: [1, 2, 3] }], []]), 'coordinate dispari');
    assert.ok(drawingError([[{ c: 0, w: 0, p: [1, 2000] }], []]), 'fuori tela');
    const huge = [[{ c: 0, w: 0, p: new Array((CREATIVE.MAX_POINTS + 1) * 2).fill(1) }], []];
    assert.ok(drawingError(huge), 'troppi punti');
  });

  it('turno di un disegno: l’artista non scrive titoli, titolo vero vietato, punti all’artista', () => {
    const t = makeRoom(3);
    startShow(t, 'creative');
    const prompt0 = t.mine<CreativePrivate>(0).prompt!;
    assert.ok(prompt0);
    assert.ok(!JSON.stringify(t.tv().show).includes(prompt0), 'la TV non deve vedere i temi');
    assert.equal(t.act(0, { type: 'draw', frames: doodle() }), null);
    mock.timers.tick(CREATIVE.DRAW_MS); // disegna solo il giocatore 0

    const ti = t.state<CreativePublic>();
    assert.ok(ti.step === 'title' && ti.artistId === t.ids[0] && ti.drawing.length === 2);
    assert.match(t.act(0, { type: 'title', text: 'x' }) ?? '', /tuo disegno/);
    assert.match(t.act(1, { type: 'title', text: prompt0.toUpperCase() }) ?? '', /vero/);
    t.act(1, { type: 'title', text: 'Titolo falso uno' });
    t.act(2, { type: 'title', text: 'Titolo falso due' });
    mock.timers.tick(700);

    const ch = t.state<CreativePublic>();
    assert.equal(ch.step, 'choose');
    if (ch.step !== 'choose') return;
    const truthId = ch.options.find((o) => o.text === prompt0)!.id;
    t.act(1, { type: 'choose', optionId: truthId });
    t.act(2, { type: 'choose', optionId: ch.options.find((o) => o.text === 'Titolo falso uno')!.id });
    mock.timers.tick(700);
    const r = t.state<CreativePublic>();
    assert.equal(r.step, 'reveal');
    if (r.step !== 'reveal') return;
    assert.equal(r.points[t.ids[0]], CREATIVE.ARTIST_POINTS);
    assert.equal(r.points[t.ids[1]], CREATIVE.TRUTH_POINTS + CREATIVE.FOOL_POINTS);
    t.room.destroy();
  });

  it('se nessuno disegna si va subito alla classifica e al menù', () => {
    const t = makeRoom(3);
    startShow(t, 'creative');
    const steps = runToMenu(t);
    assert.deepEqual(steps, ['draw', 'final']);
  });

  it('partita con un disegno umano e bot che disegnano e inventano titoli', () => {
    const t = makeRoom(1, 3);
    startShow(t, 'creative');
    t.act(0, { type: 'draw', frames: doodle() });
    const artists = new Set<string>();
    for (let ms = 0; ms < 60 * 60_000 && t.tv().phase !== 'LOBBY'; ms += 250) {
      const st = t.state<CreativePublic>();
      if (st && st.step === 'title') artists.add(st.artistId);
      mock.timers.tick(250);
    }
    assert.equal(t.tv().phase, 'LOBBY');
    assert.equal(artists.size, 4, 'un turno per il disegno umano e uno per ogni bot');
  });

  it('gli scarabocchi dei bot sono validi e legati a temi veri, diversi da quelli degli umani', () => {
    for (const [theme, d] of Object.entries(BOT_DOODLES)) {
      assert.ok(CREATIVE_PROMPTS.includes(theme), theme);
      assert.equal(drawingError(d), null, theme);
    }
    const t = makeRoom(2, 2);
    startShow(t, 'creative');
    const show = activeShow<{ prompts: Map<string, string> }>(t);
    for (const id of t.botIds()) assert.ok(BOT_DOODLES[show.prompts.get(id)!], 'il bot ha un tema con scarabocchio');
    assert.equal(new Set(show.prompts.values()).size, 4, 'nessun tema doppio nello stesso giro');
    t.room.destroy();
  });
});
