// Registro dei giochi del Pack (tranne il quiz, registrato in Room perché usa il suo motore interno).
// Per aggiungere un gioco: plugin in server/shows/<id>/ + una riga qui + voce in shared/shows.ts.

import type { ShowRegistry } from '../core/ShowPlugin';
import type { QuestionPool } from '../QuestionPool';
import { BluffShow } from './bluff/BluffShow';
import { ColpevoleShow } from './colpevole/ColpevoleShow';
import { CreativeShow } from './creative/CreativeShow';
import { FilaShow } from './fila/FilaShow';
import { GemelleShow } from './gemelle/GemelleShow';
import { GuastaShow } from './guastafeste/GuastaShow';
import { ImpostorShow } from './impostor/ImpostorShow';
import { LeggendeShow } from './leggende/LeggendeShow';
import { ScalaShow } from './scala/ScalaShow';
import { SmistShow } from './smistatori/SmistShow';
import { SocialShow } from './social/SocialShow';
import { SondaggiShow } from './sondaggi/SondaggiShow';
import { TempoShowPlugin } from './tempo/TempoShowPlugin';

/** Servizi della stanza che alcuni giochi usano (es. le domande dei pacchetti scelti). */
export interface ShowDeps {
  questionPool(): QuestionPool;
}

export function registerShows(registry: ShowRegistry, deps: ShowDeps) {
  registry.register('tempo', (ctx) => new TempoShowPlugin(ctx));
  registry.register('gemelle', (ctx) => new GemelleShow(ctx));
  registry.register('scala', (ctx) => new ScalaShow(ctx));
  registry.register('bluff', (ctx) => new BluffShow(ctx));
  registry.register('impostor', (ctx) => new ImpostorShow(ctx));
  registry.register('social', (ctx) => new SocialShow(ctx));
  registry.register('sondaggi', (ctx) => new SondaggiShow(ctx));
  registry.register('fila', (ctx) => new FilaShow(ctx));
  registry.register('guastafeste', (ctx) => new GuastaShow(ctx));
  registry.register('creative', (ctx) => new CreativeShow(ctx));
  registry.register('colpevole', (ctx) => new ColpevoleShow(ctx));
  registry.register('smistatori', (ctx) => new SmistShow(ctx));
  registry.register('leggende', (ctx) => new LeggendeShow(ctx, () => deps.questionPool()));
}
