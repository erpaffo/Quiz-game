import {
  LEGGENDE,
  type LeggendeHero,
  type LeggendeItem,
  type LeggendeMonster,
  type LeggendePrivate,
  type LeggendePublic,
  type LeggendeQuestion
} from '../../../shared/leggende';
import { BaseShow } from '../../core/BaseShow';
import { isIntIn, payloadOf } from '../../core/input';
import type { ActionResult, RoomSessionContext } from '../../core/ShowPlugin';
import type { Player } from '../../players';
import type { McDef, QuestionPool } from '../../QuestionPool';
import { pick, shuffle } from '../../util';

const ITEM_IDS = Object.keys(LEGGENDE.ITEMS) as LeggendeItem[];
const isItem = (v: unknown): v is LeggendeItem => typeof v === 'string' && (ITEM_IDS as string[]).includes(v);

type Result = Extract<LeggendePublic, { step: 'result' }>;

/**
 * 🐉 Leggende del Quiz: tutti insieme contro 3 mostri e il drago. Ogni risposta giusta è un colpo;
 * se sbagliate in troppi il mostro attacca. Oro per il negozio dopo ogni mostro. Si vince o si perde
 * insieme; la classifica finale premia chi ha inflitto più danni.
 */
export class LeggendeShow extends BaseShow<LeggendePublic, LeggendePrivate> {
  readonly id = 'leggende' as const;

  private pool: QuestionPool | null = null;
  private heroes = new Map<string, LeggendeHero>();
  private gold = 0;
  private stage = 0;
  /** Cuori iniziali di ogni eroe (regola «Vite degli eroi»). */
  private get maxHearts(): number {
    return Number(this.opt('hearts')) || LEGGENDE.HEARTS;
  }
  /** Mostri scelti nel menù: i primi della lista + sempre il drago come boss finale. */
  private monsters: (typeof LEGGENDE.MONSTERS)[number][] = [];
  private monster: LeggendeMonster = { id: '', name: '', icon: '', hp: 0, maxHp: 0, boss: false };
  private questionsOnMonster = 0;
  private def: McDef | null = null;
  private question: LeggendeQuestion | null = null;
  private answers = new Map<string, { optionIndex: number; at: number }>();
  private lensed = new Map<string, number[]>();
  private ready = new Set<string>();
  private lastResult: Result | null = null;

  constructor(
    ctx: RoomSessionContext,
    private readonly makePool: () => QuestionPool
  ) {
    super(ctx);
  }

  protected checkContent(): string | null {
    this.pool = this.makePool();
    return this.pool.mcCount < 20 ? 'Servono almeno 20 domande a scelta multipla nei pacchetti scelti' : null;
  }

  start(): ActionResult {
    this.pool ??= this.makePool();
    const all = LEGGENDE.MONSTERS;
    this.monsters = [...all.slice(0, this.rounds - 1), all[all.length - 1]];
    for (const p of this.ctx.players()) this.heroes.set(p.id, { playerId: p.id, hearts: this.maxHearts, items: [], damage: 0, shielded: false });
    this.nextMonster();
    return null;
  }

  private alive(): LeggendeHero[] {
    return [...this.heroes.values()].filter((h) => h.hearts > 0 && this.ctx.get(h.playerId)?.connected);
  }

  private isAlive(playerId: string) {
    return (this.heroes.get(playerId)?.hearts ?? 0) > 0;
  }

  private nextMonster() {
    const m = this.monsters[this.stage];
    const online = [...this.heroes.keys()].filter((id) => this.ctx.get(id)?.connected).length;
    const hp = m.hpPerHero * (online || this.heroes.size);
    this.stage++;
    this.monster = { id: m.id, name: m.name, icon: m.icon, hp, maxHp: hp, boss: m.boss };
    this.questionsOnMonster = 0;
    this.go('intro', LEGGENDE.INTRO_MS, () => this.nextQuestion());
  }

  private nextQuestion() {
    this.questionsOnMonster++;
    this.answers.clear();
    this.lensed.clear();
    this.def = this.pool!.drawMc({ multipleOnly: true });
    const d = this.def;
    this.question = {
      id: d.id,
      category: d.category.name,
      text: d.text,
      options: d.options,
      ...(d.image ? { image: d.image } : {}),
      ...(d.optionImages ? { optionImages: d.optionImages } : {})
    };
    this.go('question', LEGGENDE.QUESTION_MS, () => this.resolve());
  }

  private hitMonster(hero: LeggendeHero, damage: number): number {
    const dealt = Math.min(damage, Math.max(0, this.monster.hp));
    this.monster.hp -= dealt;
    hero.damage += dealt;
    const p = this.ctx.get(hero.playerId);
    if (p) this.ctx.addScore(p, dealt);
    return dealt;
  }

  private resolve() {
    const d = this.def!;
    const fighters = this.alive();
    const correct = fighters.filter((h) => this.answers.get(h.playerId)?.optionIndex === d.correctIndex);
    const fastest = [...correct].sort((a, b) => this.answers.get(a.playerId)!.at - this.answers.get(b.playerId)!.at)[0];
    const results = fighters.map((h) => {
      const a = this.answers.get(h.playerId);
      const ok = a?.optionIndex === d.correctIndex;
      const base = h === fastest ? Math.round(LEGGENDE.DAMAGE * LEGGENDE.FAST_FACTOR) : LEGGENDE.DAMAGE;
      return { playerId: h.playerId, optionIndex: a?.optionIndex ?? null, correct: ok, damage: ok ? this.hitMonster(h, base) : 0 };
    });

    let attack: Result['attack'] = null;
    if (this.monster.hp > 0 && correct.length < fighters.length * LEGGENDE.ATTACK_THRESHOLD) {
      attack = { hit: [], blocked: [] };
      for (const h of fighters) {
        if (correct.includes(h)) continue;
        if (h.shielded) {
          h.shielded = false;
          attack.blocked.push(h.playerId);
        } else {
          h.hearts--;
          attack.hit.push(h.playerId);
        }
      }
    }

    const outcome = this.monster.hp <= 0 ? 'defeated' : this.questionsOnMonster >= LEGGENDE.MAX_QUESTIONS_PER_MONSTER ? 'escaped' : 'fighting';
    if (outcome === 'defeated') this.gold += LEGGENDE.GOLD_PER_HERO * this.heroes.size;
    this.lastResult = {
      step: 'result',
      ...this.header(),
      monster: { ...this.monster },
      question: this.question!,
      correctIndex: d.correctIndex,
      results,
      attack,
      outcome
    };
    this.go('result', LEGGENDE.RESULT_MS, () => this.afterResult(outcome));
  }

  private afterResult(outcome: Result['outcome']) {
    if (![...this.heroes.values()].some((h) => h.hearts > 0)) return this.end('defeat');
    if (outcome === 'fighting') return this.nextQuestion();
    if (this.monster.boss) return this.end(outcome === 'defeated' ? 'victory' : 'defeat');
    this.ready.clear();
    this.go('shop', LEGGENDE.SHOP_MS, () => this.nextMonster());
  }

  private end(result: 'victory' | 'defeat') {
    if (result === 'victory') for (const p of this.ctx.players()) this.ctx.addScore(p, LEGGENDE.VICTORY_BONUS);
    this.go(result, LEGGENDE.END_MS, () => this.finish());
  }

  private header() {
    return { stage: this.stage, stages: this.monsters.length, heroes: [...this.heroes.values()].map((h) => ({ ...h, items: [...h.items] })), gold: this.gold };
  }

  handleAction(p: Player, a: unknown): ActionResult {
    const hero = this.heroes.get(p.id);
    if (!hero) return 'Non sei nella squadra';
    if (hero.hearts <= 0) return 'Sei KO: aspetta che un compagno ti rianimi nel negozio';

    const answer = payloadOf(a, 'answer');
    if (answer) {
      const d = this.def;
      if (this.step !== 'question' || !d || answer.questionId !== d.id) return 'Domanda non attiva';
      if (this.answers.has(p.id)) return 'Hai già risposto';
      if (!isIntIn(answer.optionIndex, 0, d.options.length - 1)) return 'Risposta non valida';
      if (this.lensed.get(p.id)?.includes(answer.optionIndex)) return 'Quella risposta l’ha eliminata la Lente';
      this.answers.set(p.id, { optionIndex: answer.optionIndex, at: Date.now() });
      return null;
    }

    const use = payloadOf(a, 'use');
    if (use) return this.useItem(hero, use.item);

    const buy = payloadOf(a, 'buy');
    if (buy) {
      if (this.step !== 'shop') return 'Il negozio è chiuso';
      if (!isItem(buy.item)) return 'Oggetto sconosciuto';
      const price = LEGGENDE.ITEMS[buy.item].price;
      if (this.gold < price) return 'Oro insufficiente';
      if (hero.items.length >= LEGGENDE.ITEM_SLOTS) return `Puoi portare al massimo ${LEGGENDE.ITEM_SLOTS} oggetti`;
      this.gold -= price;
      hero.items.push(buy.item);
      return null;
    }

    const revive = payloadOf(a, 'revive');
    if (revive) {
      if (this.step !== 'shop') return 'Si rianima solo nel negozio';
      const target = typeof revive.targetId === 'string' ? this.heroes.get(revive.targetId) : undefined;
      if (!target || target.hearts > 0) return 'Nessun compagno KO da rianimare';
      if (this.gold < LEGGENDE.REVIVE_PRICE) return 'Oro insufficiente';
      this.gold -= LEGGENDE.REVIVE_PRICE;
      // Ruota della fortuna: torna con 1–3 cuori.
      target.hearts = 1 + Math.floor(Math.random() * this.maxHearts);
      return null;
    }

    if (payloadOf(a, 'ready')) {
      if (this.step !== 'shop') return 'Non è il momento';
      this.ready.add(p.id);
      return null;
    }
    return 'Azione non valida';
  }

  private useItem(hero: LeggendeHero, item: unknown): ActionResult {
    if (!isItem(item)) return 'Oggetto sconosciuto';
    const idx = hero.items.indexOf(item);
    if (idx < 0) return 'Non hai questo oggetto';
    const inBattle = this.step === 'question';
    if (!inBattle && !(item === 'potion' && this.step === 'shop')) return 'Puoi usarlo solo durante una domanda';
    switch (item) {
      case 'potion':
        if (hero.hearts >= this.maxHearts) return 'Hai già tutti i cuori';
        hero.hearts++;
        break;
      case 'shield':
        if (hero.shielded) return 'Lo scudo è già alzato';
        hero.shielded = true;
        break;
      case 'lens': {
        if (this.lensed.has(hero.playerId) || this.answers.has(hero.playerId)) return 'La Lente non serve più per questa domanda';
        const d = this.def!;
        const wrong = shuffle(d.options.map((_, i) => i).filter((i) => i !== d.correctIndex));
        this.lensed.set(hero.playerId, wrong.slice(0, 2).sort());
        break;
      }
      case 'bomb':
        this.hitMonster(hero, LEGGENDE.BOMB_DAMAGE);
        // Mostro abbattuto dalla bomba: si chiude subito la domanda.
        if (this.monster.hp <= 0) this.endEarly();
        break;
    }
    hero.items.splice(idx, 1);
    return null;
  }

  hasActed(p: Player): boolean {
    if (!p.connected || !this.isAlive(p.id)) return this.step === 'question' || this.step === 'shop';
    if (this.step === 'question') return this.answers.has(p.id);
    if (this.step === 'shop') return this.ready.has(p.id);
    return false;
  }

  bot(b: Player): void {
    const hero = this.heroes.get(b.id);
    if (!hero || hero.hearts <= 0) return;
    if (this.step === 'question') {
      const d = this.def!;
      if (hero.hearts === 1 && hero.items.includes('potion')) this.botAct(b, 500, 1_500, () => ({ type: 'use', item: 'potion' }));
      if (hero.items.includes('bomb') && Math.random() < 0.3) this.botAct(b, 1_000, 3_000, () => ({ type: 'use', item: 'bomb' }));
      const right = Math.random() < 0.6;
      const wrong = d.options.map((_, i) => i).filter((i) => i !== d.correctIndex);
      this.botAct(b, 2_000, 9_000, () => ({ type: 'answer', questionId: d.id, optionIndex: right ? d.correctIndex : pick(wrong) }));
    }
    if (this.step === 'shop') {
      this.botAct(b, 1_500, 4_000, () => {
        const ko = [...this.heroes.values()].find((h) => h.hearts <= 0);
        if (ko && this.gold >= LEGGENDE.REVIVE_PRICE) return { type: 'revive', targetId: ko.playerId };
        if (hero.hearts <= 1 && this.gold >= LEGGENDE.ITEMS.potion.price) return { type: 'buy', item: 'potion' };
        return null;
      });
      this.botAct(b, 5_000, 8_000, () => ({ type: 'ready' }));
    }
  }

  protected stepState(): LeggendePublic | null {
    const h = this.header();
    switch (this.step) {
      case 'intro':
        return { step: 'intro', ...h, monster: { ...this.monster } };
      case 'question':
        return { step: 'question', ...h, monster: { ...this.monster }, question: this.question!, number: this.questionsOnMonster, answered: [...this.answers.keys()] };
      case 'result':
        return this.lastResult && { ...this.lastResult, ...h };
      case 'shop':
        return { step: 'shop', ...h, ready: [...this.ready] };
      case 'victory':
      case 'defeat':
        return { step: this.step, ...h };
      default:
        return null;
    }
  }

  privateState(p: Player): LeggendePrivate {
    const hero = this.heroes.get(p.id);
    return {
      hearts: hero?.hearts ?? 0,
      maxHearts: this.maxHearts,
      items: [...(hero?.items ?? [])],
      shielded: hero?.shielded ?? false,
      myAnswer: this.step === 'question' ? (this.answers.get(p.id)?.optionIndex ?? null) : null,
      removed: this.step === 'question' ? (this.lensed.get(p.id) ?? []) : []
    };
  }
}
