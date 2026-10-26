// Pezzi di interfaccia riusati dagli 8 giochi: Scudo Anti-Sbirciata, conto alla rovescia, timer, riepiloghi.

import type { Player, Sfx } from './types';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function tag(p: Player): string {
  return `<span class="pp-tag" style="--pc:${p.color}">${esc(p.name)}</span>`;
}

/** Registro di timer e animazioni: `clear()` li ferma tutti (uscita dal gioco o cambio schermata). */
export class Timers {
  private timeouts = new Set<number>();
  private intervals = new Set<number>();
  private frames = new Set<number>();

  after(ms: number, fn: () => void): number {
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
    return id;
  }

  every(ms: number, fn: () => void): number {
    const id = window.setInterval(fn, ms);
    this.intervals.add(id);
    return id;
  }

  stop(id: number) {
    window.clearTimeout(id);
    window.clearInterval(id);
    this.timeouts.delete(id);
    this.intervals.delete(id);
  }

  /** Chiama `fn(trascorsi ms)` a ogni fotogramma finché non restituisce false. */
  loop(fn: (dt: number) => boolean | void) {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (fn(dt) === false) return;
      const id = requestAnimationFrame(step);
      this.frames.add(id);
    };
    const id = requestAnimationFrame(step);
    this.frames.add(id);
  }

  clear() {
    this.timeouts.forEach((id) => window.clearTimeout(id));
    this.intervals.forEach((id) => window.clearInterval(id));
    this.frames.forEach((id) => cancelAnimationFrame(id));
    this.timeouts.clear();
    this.intervals.clear();
    this.frames.clear();
  }
}

/** Mostra una schermata e collega i tocchi: ogni elemento con data-act="nome" chiama acts[nome](elemento). */
export function screen(root: HTMLElement, html: string, acts: Record<string, (el: HTMLElement) => void> = {}) {
  root.innerHTML = html;
  root.onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || !root.contains(el) || (el as HTMLButtonElement).disabled) return;
    acts[el.dataset.act!]?.(el);
  };
  root.onpointerdown = null;
  root.scrollTop = 0;
}

/**
 * Scudo Anti-Sbirciata: «Passa il telefono a X» → tieni premuto per vedere il segreto (rilasci = coperto)
 * → dopo averlo visto almeno una volta compare «Fatto, passa». Funziona con il dito e con il mouse.
 * Il segreto compare DENTRO l'area premuta, che «cattura» il dito: così il rilascio arriva sempre e il
 * segreto si copre (anche se l'app va in secondo piano mentre è scoperto).
 */
export function shield(
  root: HTMLElement,
  o: { player: Player; title?: string; secretHtml: string; doneLabel?: string; onDone: () => void }
) {
  let seen = false;
  root.innerHTML = `
    <div class="pp-shield" style="--pc:${o.player.color}">
      <div class="pp-shield-top">📲 Passa il telefono a</div>
      <div class="pp-shield-name">${esc(o.player.name)}</div>
      ${o.title ? `<div class="pp-shield-sub">${esc(o.title)}</div>` : ''}
      <div class="pp-hold" data-hold role="button" tabindex="0">
        <span class="pp-hold-label">👁️ Tieni premuto per guardare in segreto</span>
        <div class="pp-secret" hidden>${o.secretHtml}</div>
      </div>
      <button class="pp-btn pp-done" data-done disabled>✅ ${esc(o.doneLabel ?? 'Ho visto, vai avanti')}</button>
    </div>`;
  const hold = root.querySelector<HTMLElement>('[data-hold]')!;
  const secret = root.querySelector<HTMLElement>('.pp-secret')!;
  const done = root.querySelector<HTMLButtonElement>('[data-done]')!;
  const hide = () => {
    if (secret.hidden) return;
    secret.hidden = true;
    hold.classList.remove('on');
    if (seen) done.disabled = false;
    window.removeEventListener('pointerup', hide);
    window.removeEventListener('pointercancel', hide);
    window.removeEventListener('blur', hide);
    document.removeEventListener('visibilitychange', hide);
  };
  hold.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      hold.setPointerCapture(e.pointerId);
    } catch {
      /* non tutti i browser: ci pensa l'ascolto su window */
    }
    secret.hidden = false;
    hold.classList.add('on');
    seen = true;
    window.addEventListener('pointerup', hide);
    window.addEventListener('pointercancel', hide);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
  });
  hold.addEventListener('pointerup', hide);
  hold.addEventListener('pointercancel', hide);
  hold.addEventListener('lostpointercapture', hide);
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  root.onclick = (e) => {
    if ((e.target as HTMLElement).closest('[data-done]') && !done.disabled) {
      hide();
      o.onDone();
    }
  };
}

/** Schermata «Passa il telefono a X» senza segreti in vista: si va avanti solo quando X tocca il bottone. */
export function cover(root: HTMLElement, player: Player, o: { title?: string; button?: string; onGo: () => void }) {
  screen(
    root,
    `<div class="pp-shield" style="--pc:${player.color}">
      <div class="pp-shield-top">📲 Passa il telefono a</div>
      <div class="pp-shield-name">${esc(player.name)}</div>
      ${o.title ? `<div class="pp-shield-sub">${esc(o.title)}</div>` : ''}
      <button class="pp-btn big" data-act="go">${esc(o.button ?? `Sono ${player.name}: vai!`)}</button>
    </div>`,
    { go: () => o.onGo() }
  );
}

/** «3… 2… 1…» a tutto schermo, poi `onDone`. */
export function countdown(root: HTMLElement, timers: Timers, sfx: Sfx, o: { title: string; last?: string; onDone: () => void }) {
  let n = 3;
  const draw = () => {
    root.innerHTML = `<div class="pp-center"><div class="pp-muted">${esc(o.title)}</div><div class="pp-count pop">${n > 0 ? n : esc(o.last ?? 'VIA!')}</div></div>`;
  };
  draw();
  sfx.beep();
  const id = timers.every(800, () => {
    n--;
    draw();
    if (n > 0) sfx.beep();
    else {
      sfx.beep(true);
      timers.stop(id);
      timers.after(500, o.onDone);
    }
  });
}

/** Elenco dei punti di una partita (per i riepiloghi dentro i giochi). */
export function pointsList(players: Player[], points: Record<string, number>): string {
  const rows = players
    .map((p) => ({ p, n: points[p.id] ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .map(({ p, n }) => `<li>${tag(p)}<b>${n > 0 ? `+${n}` : n}</b></li>`)
    .join('');
  return `<ol class="pp-points">${rows}</ol>`;
}

/** Finestra di conferma dentro l'app (niente popup del browser). */
export function ask(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'pp-modal';
    el.innerHTML = `<div class="pp-modal-box"><p>${esc(text)}</p><div class="pp-row"><button class="pp-btn ghost" data-no>${esc(no)}</button><button class="pp-btn" data-yes>${esc(yes)}</button></div></div>`;
    const close = (v: boolean) => {
      el.remove();
      resolve(v);
    };
    el.querySelector('[data-yes]')!.addEventListener('click', () => close(true));
    el.querySelector('[data-no]')!.addEventListener('click', () => close(false));
    document.body.appendChild(el);
  });
}
