// Dati dei personaggi: ogni skin deve poter diventare un modello 3D valido (colori, tratti e opzioni coerenti).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHARACTERS, getCharacter, resolveLook, sanitizeCustom, traitValue, type CharacterKind } from '../shared/characters';

const HEX = /^#[0-9a-f]{6}$/i;
const FRIENDS: CharacterKind[] = ['sandro', 'samuele', 'valerio', 'paffo', 'pacio', 'j'];

describe('Personaggi: coerenza dei dati', () => {
  it('id e nomi unici; i personaggi degli amici ci sono tutti', () => {
    const ids = CHARACTERS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(CHARACTERS.map((c) => c.name)).size, CHARACTERS.length);
    for (const id of FRIENDS) assert.ok(getCharacter(id), id);
  });

  it('abbastanza combinazioni personaggio/skin per la stanza piena (16 giocatori, tutte diverse)', () => {
    const combos = CHARACTERS.reduce((n, c) => n + c.skins.length, 0);
    assert.ok(combos >= 16, `${combos}`);
  });

  for (const ch of CHARACTERS) {
    it(`«${ch.name}»: skin, colori e tratti validi`, () => {
      assert.ok(ch.skins.length >= 1);
      assert.equal(new Set(ch.skins.map((s) => s.id)).size, ch.skins.length, 'id skin unici');
      const defs = ch.custom ?? [];
      assert.equal(new Set(defs.map((d) => d.id)).size, defs.length, 'id tratti unici');
      for (const d of defs) {
        assert.ok(d.options.length >= 1, d.id);
        assert.equal(new Set(d.options.map((o) => o.id)).size, d.options.length, `opzioni di ${d.id}`);
      }
      for (const skin of ch.skins) {
        for (const [key, value] of Object.entries(skin.colors)) assert.match(value, HEX, `${skin.id}.${key}`);
        // ogni tratto predefinito della skin deve essere un'opzione esistente, e riferirsi a un tratto esistente
        for (const [trait, value] of Object.entries(skin.traits ?? {})) {
          const def = defs.find((d) => d.id === trait);
          assert.ok(def, `${skin.id}: tratto «${trait}» non dichiarato`);
          assert.ok(def.options.some((o) => o.id === value), `${skin.id}: «${trait}»=«${value}» non è un'opzione`);
        }
        const look = resolveLook(ch.id, skin.id);
        assert.ok(look, skin.id);
        for (const d of defs.filter((x) => !x.recolor)) assert.ok(d.options.some((o) => o.id === look.traits[d.id]), `${skin.id}/${d.id}`);
      }
    });

    it(`«${ch.name}»: ogni scelta del giocatore è accettata, ogni valore sbagliato è scartato`, () => {
      for (const d of ch.custom ?? []) {
        for (const o of d.options) {
          assert.deepEqual(sanitizeCustom(ch.id, { [d.id]: o.id }), { [d.id]: o.id });
          const look = resolveLook(ch.id, ch.skins[0].id, { [d.id]: o.id })!;
          if (d.recolor && o.color) assert.equal(look.colors[d.recolor], o.color);
          else if (!d.recolor) assert.equal(traitValue(d, ch.skins[0], { [d.id]: o.id }), o.id);
        }
        assert.deepEqual(sanitizeCustom(ch.id, { [d.id]: 'non-esiste' }), {});
      }
    });
  }
});

describe('Personaggi: gli amici hanno i tratti della descrizione', () => {
  const trait = (id: CharacterKind, name: string) => getCharacter(id)!.custom!.find((d) => d.id === name);

  it('Sandro: barba folta, petto villoso e torso nudo (maglia = colore della pelle) di partenza', () => {
    const look = resolveLook('sandro', 'rilassato')!;
    assert.equal(look.traits.beard, 'full');
    assert.equal(look.traits.chest, 'hairy');
    assert.equal(look.traits.glasses, 'no');
    assert.equal(look.colors.body, look.colors.skin);
  });

  it('i personaggi a torso nudo hanno busto del colore della pelle; J ha la t-shirt scura con stampa', () => {
    for (const id of ['sandro', 'samuele', 'valerio', 'paffo', 'pacio'] as const) {
      for (const s of getCharacter(id)!.skins) assert.equal(s.colors.body, s.colors.skin, `${id}/${s.id}`);
    }
    for (const s of getCharacter('j')!.skins) assert.notEqual(s.colors.body, s.colors.skin);
    assert.equal(resolveLook('j', 'nera')!.traits.print, 'bolt');
  });

  it('accessori richiesti: catenina (Samuele, Pacio), orecchino e perline (Valerio), occhiali (Paffo)', () => {
    assert.equal(resolveLook('samuele', 'estate')!.traits.necklace, 'yes');
    assert.equal(resolveLook('pacio', 'catena')!.traits.chain, 'yes');
    assert.equal(resolveLook('valerio', 'sole')!.traits.earring, 'yes');
    assert.equal(resolveLook('valerio', 'sole')!.traits.choker, 'yes');
    assert.equal(resolveLook('paffo', 'classico')!.traits.glasses, 'yes');
    assert.ok(trait('paffo', 'glasses'));
  });
});
