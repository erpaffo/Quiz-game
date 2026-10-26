import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import { CATEGORY_COLORS, DIFFICULTY_LABEL, newId, PACK_LIMITS, PLACEHOLDER, validatePack, type Difficulty, type Pack, type PackCategory, type PackQuestion } from '../../shared/packs';
import type { PackSummary } from '../../shared/types';
import '../common/base.css';
import { esc, OPTION_COLORS, OPTION_LETTERS } from '../common/net';
import './editor.css';

// Laboratorio Domande: editor dei pacchetti (stanno in user-packs/ come file JSON).
// Le modifiche restano locali finché non si preme «Salva»; la validazione è la stessa del server.

type QType = PackQuestion['type'];

const listEl = document.getElementById('pack-list')!;
const main = document.getElementById('ed-main')!;
const importInput = document.getElementById('import') as HTMLInputElement;

let summaries: PackSummary[] = [];
let pack: Pack | null = null;
let dirty = false;
let filter = 'all';
let search = '';
/** Domanda in modifica: id esistente, 'new' oppure null. */
let editing: string | null = null;
let editingCat: string | null = null;
let draftType: QType = 'multiple';

const TYPE_LABEL: Record<QType, string> = { multiple: 'Multipla', truefalse: 'Vero/Falso', numeric: 'Numerica' };

function toast(text: string, good = true) {
  const el = document.createElement('div');
  el.className = `toast ${good ? 'good' : ''}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const KEY_STORE = 'sep:editorKey';

/** fetch con la chiave del Laboratorio (serve solo se il server ha EDITOR_KEY): chiesta al primo rifiuto e ricordata. */
async function send(url: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
  const go = () => fetch(url, { ...init, headers: { ...init.headers, 'X-Editor-Key': localStorage.getItem(KEY_STORE) ?? '' } });
  const res = await go();
  if (res.status !== 401) return res;
  const key = prompt('Chiave del Laboratorio (EDITOR_KEY del server):');
  if (!key) return res;
  localStorage.setItem(KEY_STORE, key.trim());
  return go();
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await send(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore del server');
  return data as T;
}

// ------------------------------------------------------------ pacchetti

async function loadList(selectId?: string) {
  summaries = await api<PackSummary[]>('GET', '/api/packs');
  renderList();
  const id = selectId ?? pack?.id ?? summaries.find((s) => !s.builtIn)?.id ?? summaries[0]?.id;
  if (id && (!pack || pack.id !== id || selectId)) await openPack(id);
}

async function openPack(id: string) {
  if (dirty && !confirm('Ci sono modifiche non salvate. Vuoi abbandonarle?')) return;
  pack = await api<Pack>('GET', `/api/packs/${encodeURIComponent(id)}`);
  dirty = false;
  filter = 'all';
  editing = null;
  editingCat = null;
  renderList();
  render();
}

function renderList() {
  listEl.innerHTML = summaries
    .map((s) => `
      <button class="pack-item ${s.id === pack?.id ? 'on' : ''}" data-open="${esc(s.id)}">
        <b>${s.builtIn ? '🔒 ' : ''}${esc(s.name)}</b>
        <small>${s.multiple + s.truefalse + s.numeric} domande · ${s.categories} categorie</small>
      </button>`)
    .join('');
}

function markDirty() {
  dirty = true;
  const btn = main.querySelector<HTMLButtonElement>('[data-act="save"]');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '💾 Salva modifiche';
  }
}

async function save() {
  if (!pack) return;
  try {
    const valid = validatePack(pack);
    const saved = await api<Pack>('PUT', `/api/packs/${encodeURIComponent(valid.id)}`, valid);
    pack = saved;
    dirty = false;
    toast('Pacchetto salvato ✓');
    await loadList(saved.id);
  } catch (err) {
    toast(`⚠️ ${(err as Error).message}`, false);
  }
}

function download(p: Pack) {
  const blob = new Blob([JSON.stringify({ ...p, builtIn: false }, null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${p.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pacchetto'}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function createPack(base?: Pack) {
  const p: Pack = base
    ? { ...structuredClone(base), id: newId('pk'), name: `${base.name} (copia)`.slice(0, PACK_LIMITS.NAME), builtIn: false }
    : {
        id: newId('pk'),
        name: 'Nuovo pacchetto',
        description: '',
        builtIn: false,
        updatedAt: Date.now(),
        categories: [{ id: newId('c'), name: 'Domande tra amici', icon: '🎉', color: CATEGORY_COLORS[0] }],
        questions: []
      };
  try {
    const saved = await api<Pack>('PUT', `/api/packs/${encodeURIComponent(p.id)}`, p);
    dirty = false;
    await loadList(saved.id);
    toast(base ? 'Copia creata: ora puoi modificarla' : 'Pacchetto creato');
  } catch (err) {
    toast(`⚠️ ${(err as Error).message}`, false);
  }
}

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  try {
    const saved = await api<Pack>('POST', '/api/packs', JSON.parse(await file.text()));
    dirty = false;
    await loadList(saved.id);
    toast(`Importato «${saved.name}»: ${saved.questions.length} domande`);
  } catch (err) {
    toast(`⚠️ Importazione fallita: ${(err as Error).message}`, false);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

// ------------------------------------------------------------ rendering

function catOf(id: string): PackCategory | undefined {
  return pack?.categories.find((c) => c.id === id);
}

function thumb(q: PackQuestion) {
  const src = q.image ?? (q.type === 'multiple' ? q.optionImages?.[q.correctIndex] : undefined);
  if (src) return `<img class="q-thumb" src="${esc(src)}" alt="" loading="lazy">`;
  return q.audio ? '<span class="q-thumb audio" title="Domanda con brano audio">🎵</span>' : '<span class="q-thumb"></span>';
}

function answerSummary(q: PackQuestion) {
  if (q.type === 'multiple') return `✓ ${esc(q.options[q.correctIndex])} <span class="muted">· ${q.options.length} risposte${q.optionImages ? ' illustrate' : ''}</span>`;
  if (q.type === 'truefalse') return q.answer ? '✅ Vero' : '❌ Falso';
  return `= ${q.answer.toLocaleString('it-IT')} ${esc(q.unit)}`;
}

function render() {
  if (!pack) {
    main.innerHTML = '<div class="empty">Seleziona o crea un pacchetto.</div>';
    return;
  }
  const ro = pack.builtIn;
  const counts = new Map<string, number>();
  for (const q of pack.questions) counts.set(q.categoryId, (counts.get(q.categoryId) ?? 0) + 1);
  const needle = search.trim().toLowerCase();
  const questions = pack.questions.filter(
    (q) => (filter === 'all' || q.categoryId === filter) && (!needle || q.text.toLowerCase().includes(needle))
  );

  main.innerHTML = `
    <section class="ed-card">
      ${ro ? '<div class="notice">🔒 Questo è il pacchetto di serie: non si può modificare. Usa <b>Duplica</b> per crearne una copia tua.</div>' : ''}
      <div class="pack-head">
        <input class="pack-name" data-field="name" value="${esc(pack.name)}" maxlength="${PACK_LIMITS.NAME}" ${ro ? 'disabled' : ''} placeholder="Nome del pacchetto">
        <div class="toolbar">
          ${ro ? '' : `<button class="btn" data-act="save" ${dirty ? '' : 'disabled'}>${dirty ? '💾 Salva modifiche' : '✓ Salvato'}</button>`}
          <button class="btn secondary" data-act="export">📤 Esporta</button>
          <button class="btn secondary" data-act="duplicate">📄 Duplica</button>
          ${ro ? '' : '<button class="btn secondary danger" data-act="delete-pack">🗑️ Elimina</button>'}
        </div>
      </div>
      <input class="pack-desc" data-field="description" value="${esc(pack.description)}" maxlength="${PACK_LIMITS.DESCRIPTION}" ${ro ? 'disabled' : ''} placeholder="Descrizione (facoltativa)">
    </section>

    <section class="ed-card">
      <h3>Categorie</h3>
      <div class="cat-chips">
        <button class="cat-chip ${filter === 'all' ? 'on' : ''}" data-filter="all">Tutte <small>${pack.questions.length}</small></button>
        ${pack.categories.map((c) => `
          <span class="cat-chip ${filter === c.id ? 'on' : ''}" style="--cc:${c.color}">
            <button data-filter="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)} <small>${counts.get(c.id) ?? 0}</small></button>
            ${ro ? '' : `<button class="mini" data-edit-cat="${esc(c.id)}" title="Modifica categoria">✎</button>`}
          </span>`).join('')}
        ${ro ? '' : '<button class="cat-chip add" data-act="new-cat">+ Categoria</button>'}
      </div>
      ${editingCat ? catForm(editingCat) : ''}
    </section>

    <section class="ed-card">
      <div class="q-toolbar">
        <h3>Domande <small class="muted">${questions.length}</small></h3>
        <input type="search" id="search" value="${esc(search)}" placeholder="🔎 Cerca…">
        ${ro ? '' : `<button class="btn" data-act="new-q" ${pack.categories.length ? '' : 'disabled'}>➕ Nuova domanda</button>`}
      </div>
      ${editing === 'new' ? questionForm(null) : ''}
      <div class="q-list">
        ${questions.map((q) => (editing === q.id ? questionForm(q) : `
          <div class="q-row">
            <span class="q-type ${q.type}">${TYPE_LABEL[q.type]}</span>
            <span class="q-cat" style="--cc:${catOf(q.categoryId)?.color ?? '#888'}">${esc(catOf(q.categoryId)?.icon ?? '')}</span>
            ${thumb(q)}
            <div class="q-body"><div>${esc(q.text)}</div><small>${answerSummary(q)}${q.difficulty ? ` <span class="diff d${q.difficulty}">${DIFFICULTY_LABEL[q.difficulty]}</span>` : ''}</small></div>
            ${ro ? '' : `<button class="mini" data-edit-q="${esc(q.id)}">✎ Modifica</button>`}
          </div>`)).join('') || '<div class="empty">Nessuna domanda. Premi «Nuova domanda» per iniziare!</div>'}
      </div>
    </section>`;
}

function catForm(id: string) {
  const c = id === 'new' ? { id: 'new', name: '', icon: '🎉', color: CATEGORY_COLORS[(pack?.categories.length ?? 0) % CATEGORY_COLORS.length] } : catOf(id)!;
  return `
    <form class="inline-form" id="cat-form">
      <label>Icona<input name="icon" value="${esc(c.icon)}" maxlength="4" class="emoji"></label>
      <label class="grow">Nome<input name="name" value="${esc(c.name)}" maxlength="${PACK_LIMITS.CATEGORY_NAME}" required placeholder="Es: Le figuracce di Marco"></label>
      <label>Colore<input type="color" name="color" value="${c.color}"></label>
      <div class="form-actions">
        <button class="btn" type="submit">${id === 'new' ? 'Aggiungi' : 'Applica'}</button>
        <button class="btn secondary" type="button" data-act="cancel-cat">Annulla</button>
        ${id === 'new' ? '' : '<button class="btn secondary danger" type="button" data-act="delete-cat">Elimina categoria</button>'}
      </div>
    </form>`;
}

function questionForm(q: PackQuestion | null) {
  const type = q?.type ?? draftType;
  const defaultCat = filter !== 'all' ? filter : pack!.categories[0]?.id;
  const options = q?.type === 'multiple' ? q.options : [];
  const correct = q?.type === 'multiple' ? q.correctIndex : 0;
  return `
    <form class="q-form" id="q-form">
      <div class="seg">${(['multiple', 'truefalse', 'numeric'] as QType[]).map((t) => `<button type="button" data-qtype="${t}" class="${t === type ? 'on' : ''}">${TYPE_LABEL[t]}</button>`).join('')}</div>
      <input type="hidden" name="type" value="${type}">
      <label>Categoria<select name="categoryId">${pack!.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === (q?.categoryId ?? defaultCat) ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
      <label>Domanda<textarea name="text" rows="2" maxlength="${PACK_LIMITS.TEXT}" required placeholder="Es: Qual è il film preferito di ${PLACEHOLDER}?">${esc(q?.text ?? '')}</textarea></label>
      <label>Difficoltà<select name="difficulty">
        <option value="">Automatica</option>
        ${([1, 2, 3] as Difficulty[]).map((d) => `<option value="${d}" ${q?.difficulty === d ? 'selected' : ''}>${DIFFICULTY_LABEL[d]}</option>`).join('')}
      </select></label>
      <div class="muted small">La Piramide finale pesca solo domande a risposta multipla, prima Medie e poi Difficili. Senza indicazione una domanda conta come Media.</div>
      <div class="media-row">
        <label class="grow">Immagine (facoltativa)<input name="image" maxlength="${PACK_LIMITS.IMAGE}" value="${esc(q?.image ?? '')}" placeholder="Es: /flags/it.svg oppure https://…/foto.jpg"></label>
        <button type="button" class="btn secondary" data-upload="image">📁 Carica…</button>
      </div>
      <img class="q-preview" data-preview="image" src="${esc(q?.image ?? '')}" alt="" ${q?.image ? '' : 'hidden'}>
      <div class="media-row">
        <label class="grow">Brano audio (facoltativo)<input name="audio" maxlength="${PACK_LIMITS.IMAGE}" value="${esc(q?.audio ?? '')}" placeholder="Es: /media/canzone.mp3"></label>
        <button type="button" class="btn secondary" data-upload="audio">🎵 Carica…</button>
      </div>
      <audio class="q-audio" data-preview="audio" controls preload="none" src="${esc(q?.audio ?? '')}" ${q?.audio ? '' : 'hidden'}></audio>
      <div class="muted small">🎵 Le domande con un brano finiscono nel gioco «Indovina il Brano»: lo schermo lo suona e i telefoni scelgono la risposta.</div>
      ${q?.type === 'multiple' && q.optionImages ? '<div class="muted small">🖼️ Le risposte di questa domanda sono illustrate: le immagini restano finché non cambi il numero di risposte.</div>' : ''}
      ${type === 'multiple' ? `
        <div class="muted small">Da 2 a 4 risposte: seleziona quella giusta.</div>
        <div class="opt-grid">${[0, 1, 2, 3].map((i) => `
          <label class="opt-edit" style="--oc:${OPTION_COLORS[i]}">
            <input type="radio" name="correct" value="${i}" ${i === correct ? 'checked' : ''}>
            <b>${OPTION_LETTERS[i]}</b>
            <input name="o${i}" value="${esc(options[i] ?? '')}" maxlength="${PACK_LIMITS.OPTION}" placeholder="${i < 2 ? 'Risposta' : 'Risposta (facoltativa)'}">
          </label>`).join('')}
        </div>` : ''}
      ${type === 'truefalse' ? `
        <div class="tf-edit">
          <label><input type="radio" name="tf" value="1" ${q?.type === 'truefalse' && q.answer ? 'checked' : ''} required> ✅ Vero</label>
          <label><input type="radio" name="tf" value="0" ${q?.type === 'truefalse' && !q.answer ? 'checked' : ''}> ❌ Falso</label>
        </div>` : ''}
      ${type === 'numeric' ? `
        <div class="num-edit">
          <label>Risposta esatta<input name="num" inputmode="decimal" value="${q?.type === 'numeric' ? q.answer : ''}" required placeholder="Es: 1969"></label>
          <label>Unità di misura<input name="unit" maxlength="${PACK_LIMITS.UNIT}" value="${q?.type === 'numeric' ? esc(q.unit) : ''}" placeholder="Es: km (facoltativa)"></label>
        </div>
        <div class="muted small">Usata nel gioco «La Stima»: vince chi si avvicina di più.</div>` : ''}
      <div class="muted small">💡 Scrivi <b>${PLACEHOLDER}</b> e in partita diventerà il nome di un giocatore a caso.</div>
      <div class="form-actions">
        <button class="btn" type="submit">${q ? 'Applica' : 'Aggiungi domanda'}</button>
        <button class="btn secondary" type="button" data-act="cancel-q">Annulla</button>
        ${q ? '<button class="btn secondary danger" type="button" data-act="delete-q">Elimina</button>' : ''}
      </div>
    </form>`;
}

// ------------------------------------------------------------ interazioni

main.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (!pack) return;
  if (t.dataset.field === 'name' || t.dataset.field === 'description') {
    pack[t.dataset.field] = t.value;
    markDirty();
  }
  if (t.id === 'search') {
    search = t.value;
    const pos = t.selectionStart;
    render();
    const s = document.getElementById('search') as HTMLInputElement;
    s.focus();
    s.setSelectionRange(pos, pos);
  }
});

main.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (!pack) return;
  const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
  const f = t.closest<HTMLElement>('[data-filter]')?.dataset.filter;
  const editQ = t.closest<HTMLElement>('[data-edit-q]')?.dataset.editQ;
  const editC = t.closest<HTMLElement>('[data-edit-cat]')?.dataset.editCat;
  const qtype = t.closest<HTMLElement>('[data-qtype]')?.dataset.qtype as QType | undefined;

  if (f) {
    filter = f;
    return render();
  }
  if (editQ) {
    editing = editQ;
    draftType = pack.questions.find((q) => q.id === editQ)!.type;
    return render();
  }
  if (editC) {
    editingCat = editC;
    return render();
  }
  if (qtype) {
    // Cambiare tipo di una domanda esistente: si riparte dai campi del nuovo tipo.
    draftType = qtype;
    if (editing && editing !== 'new') {
      const q = pack.questions.find((x) => x.id === editing)!;
      const text = (main.querySelector('textarea[name="text"]') as HTMLTextAreaElement).value;
      const idx = pack.questions.indexOf(q);
      pack.questions[idx] = qtype === 'multiple' ? { id: q.id, categoryId: q.categoryId, type: 'multiple', text, options: ['', ''], correctIndex: 0 }
        : qtype === 'truefalse' ? { id: q.id, categoryId: q.categoryId, type: 'truefalse', text, answer: true }
        : { id: q.id, categoryId: q.categoryId, type: 'numeric', text, answer: 0, unit: '' };
    }
    return render();
  }
  switch (act) {
    case 'save':
      return save();
    case 'export':
      return download(pack);
    case 'duplicate':
      return createPack(pack);
    case 'delete-pack':
      if (!confirm(`Eliminare definitivamente «${pack.name}» e tutte le sue domande?`)) return;
      try {
        await api('DELETE', `/api/packs/${encodeURIComponent(pack.id)}`);
        pack = null;
        dirty = false;
        toast('Pacchetto eliminato');
        await loadList();
      } catch (err) {
        toast(`⚠️ ${(err as Error).message}`, false);
      }
      return;
    case 'new-cat':
      editingCat = 'new';
      return render();
    case 'cancel-cat':
      editingCat = null;
      return render();
    case 'delete-cat': {
      const n = pack.questions.filter((q) => q.categoryId === editingCat).length;
      if (n && !confirm(`La categoria contiene ${n} domande: verranno eliminate anche loro. Continuare?`)) return;
      pack.categories = pack.categories.filter((c) => c.id !== editingCat);
      pack.questions = pack.questions.filter((q) => q.categoryId !== editingCat);
      if (filter === editingCat) filter = 'all';
      editingCat = null;
      markDirty();
      return render();
    }
    case 'new-q':
      editing = 'new';
      return render();
    case 'cancel-q':
      editing = null;
      return render();
    case 'delete-q':
      pack.questions = pack.questions.filter((q) => q.id !== editing);
      editing = null;
      markDirty();
      return render();
  }
});

main.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!pack) return;
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
  try {
    if (form.id === 'cat-form') {
      const cat: PackCategory = {
        id: editingCat === 'new' ? newId('c') : editingCat!,
        name: String(data.get('name') ?? '').trim(),
        icon: String(data.get('icon') ?? '').trim() || '❓',
        color: String(data.get('color') ?? CATEGORY_COLORS[0])
      };
      if (!cat.name) throw new Error('Dai un nome alla categoria');
      if (editingCat === 'new') pack.categories.push(cat);
      else pack.categories = pack.categories.map((c) => (c.id === cat.id ? cat : c));
      editingCat = null;
    }
    if (form.id === 'q-form') {
      const imageUrl = String(data.get('image') ?? '').trim();
      const audioUrl = String(data.get('audio') ?? '').trim();
      const difficulty = Number(data.get('difficulty') ?? 0) as Difficulty | 0;
      const base = {
        id: editing === 'new' ? newId('q') : editing!,
        categoryId: String(data.get('categoryId')),
        text: String(data.get('text') ?? '').trim(),
        ...(imageUrl ? { image: imageUrl } : {}),
        ...(audioUrl ? { audio: audioUrl } : {}),
        ...(difficulty ? { difficulty } : {})
      };
      const previous = pack.questions.find((x) => x.id === editing);
      const type = String(data.get('type')) as QType;
      let q: PackQuestion;
      if (type === 'multiple') {
        const raw = [0, 1, 2, 3].map((i) => String(data.get(`o${i}`) ?? '').trim());
        const correct = Number(data.get('correct') ?? 0);
        if (!raw[correct]) throw new Error('La risposta giusta selezionata è vuota');
        const options = raw.filter(Boolean);
        // Risposte illustrate (es. bandiere): si conservano se il numero di risposte non cambia.
        const imgs = previous?.type === 'multiple' && previous.optionImages?.length === options.length ? { optionImages: previous.optionImages } : {};
        q = { ...base, type, options, correctIndex: options.indexOf(raw[correct]), ...imgs };
      } else if (type === 'truefalse') {
        q = { ...base, type, answer: data.get('tf') === '1' };
      } else {
        q = { ...base, type, answer: Number(String(data.get('num') ?? '').replace(',', '.')), unit: String(data.get('unit') ?? '').trim() };
      }
      // Validazione della sola domanda, con lo stesso codice del server.
      validatePack({ ...pack, questions: [q] });
      if (editing === 'new') pack.questions.unshift(q);
      else pack.questions = pack.questions.map((x) => (x.id === q.id ? q : x));
      editing = null;
    }
    markDirty();
    render();
  } catch (err) {
    toast(`⚠️ ${(err as Error).message}`, false);
  }
});

// ------------------------------------------------------------ caricamento di immagini e brani

const ACCEPT = { image: '.png,.jpg,.jpeg,.gif,.webp,.svg', audio: '.mp3,.ogg,.wav,.m4a,.aac' } as const;

main.addEventListener('click', (e) => {
  const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-upload]')?.dataset.upload as keyof typeof ACCEPT | undefined;
  if (!kind) return;
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = ACCEPT[kind];
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      toast(`⏳ Caricamento di ${file.name}…`);
      const res = await send(`/api/media?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setMedia(kind, body.path);
      toast('✓ File caricato: ricordati di applicare e salvare');
    } catch (err) {
      toast(`⚠️ ${(err as Error).message}`, false);
    }
  });
  picker.click();
});

main.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === 'image' || t.name === 'audio') setMedia(t.name, t.value.trim());
});

function setMedia(kind: 'image' | 'audio', path: string) {
  const form = document.getElementById('q-form');
  if (!form) return;
  (form.querySelector(`input[name="${kind}"]`) as HTMLInputElement).value = path;
  const preview = form.querySelector<HTMLImageElement | HTMLAudioElement>(`[data-preview="${kind}"]`)!;
  preview.hidden = !path;
  if (path) preview.src = path;
  else preview.removeAttribute('src');
}

listEl.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-open]')?.dataset.open;
  if (id) void openPack(id);
});
document.querySelector('[data-act="new-pack"]')!.addEventListener('click', () => void createPack());

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (dirty) void save();
  }
});

void loadList().catch((err) => {
  main.innerHTML = `<div class="empty">⚠️ Impossibile contattare il server: ${esc((err as Error).message)}</div>`;
});
