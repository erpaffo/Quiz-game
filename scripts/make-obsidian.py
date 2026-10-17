# Genera il vault Obsidian in docs/obsidian a partire da docs/PROGETTO.md.
import os, re, sys, shutil

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'PROGETTO.md')
OUT = os.path.join(ROOT, 'docs', 'obsidian')
INDEX = 'Sapere è Potere'

text = open(SRC, encoding='utf8').read()
parts = re.split(r'(?m)^## (\d+)\. (.+)$', text)
# parts: [preamble, num, title, body, num, title, body...]
sections = []
for i in range(1, len(parts), 3):
    sections.append((int(parts[i]), parts[i + 1].strip(), parts[i + 2]))

TAGS = {
    1: ['panoramica'], 2: ['gameplay'], 3: ['gameplay', 'giochi'], 4: ['gameplay', 'carte'],
    5: ['gameplay', 'regole'], 6: ['gameplay', 'regole'], 7: ['contenuti', 'domande'],
    8: ['architettura'], 9: ['architettura', 'server'], 10: ['architettura', 'client'],
    11: ['architettura', 'client'], 12: ['rete'], 13: ['distribuzione'], 14: ['sviluppo'],
    15: ['architettura', 'decisioni'], 16: ['sviluppo'], 17: ['roadmap'],
}


def fname(n, title):
    clean = re.sub(r'[\\/:*?"<>|#^\[\]]', '', title)
    return f'{n:02d} {clean}'


names = {n: fname(n, t) for n, t, _ in sections}


def fix_links(body):
    # "§9.3" / "§4" -> collegamento alla nota della sezione
    def ref(m):
        n = int(m.group(1))
        label = '§' + m.group(1) + (m.group(2) or '')
        return f'[[{names[n]}|{label}]]' if n in names else label
    body = re.sub(r'§(\d+)(\.\d+)?', ref, body)
    body = body.replace('(../README.md)', '(../../README.md)')
    return body


# Si cancellano solo le note generate: quelle scritte a mano (es. la cartella Progetto/) restano.
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if re.match(r'^\d\d .+\.md$', f) or f == INDEX + '.md':
        os.remove(os.path.join(OUT, f))
shutil.rmtree(os.path.join(OUT, 'Giochi'), ignore_errors=True)
os.makedirs(os.path.join(OUT, 'Giochi'))

# ----------------------------------------------------------------- note per sezione
for idx, (n, title, body) in enumerate(sections):
    body = fix_links(body).strip()
    body = re.sub(r'\n---\s*$', '', body).strip()
    prev = f'[[{names[sections[idx - 1][0]]}|← {sections[idx - 1][1]}]]' if idx > 0 else ''
    nxt = f'[[{names[sections[idx + 1][0]]}|{sections[idx + 1][1]} →]]' if idx < len(sections) - 1 else ''
    nav = ' · '.join(x for x in [prev, f'[[{INDEX}|Indice]]', nxt] if x)
    extra = ''
    if n == 3:
        # una nota per ogni gioco, ricavata dalla tabella
        rows = re.findall(r'(?m)^\| (\S+) \*\*(.+?)\*\*[^|]* \| (.+?) \| (.+?) \| (.+?) \|$', body)
        links = []
        for icon, name, mech, pts, steps in rows:
            clean = re.sub(r'\*\*', '', name)
            gname = f'{icon} {clean}'.replace(':', '')
            gfile = re.sub(r'\s*\(finale\)', '', gname)
            note = f"""---
tags: [gioco]
aliases: ["{clean}"]
---
# {icon} {clean}

**Meccanica:** {mech}

**Punti:** {pts}

**Passi del server:** {steps}

## Collegamenti
- Elenco completo: [[{names[3]}]]
- Carte e bilanciamento: [[{names[4]}#Bilanciamento per gioco|Bilanciamento per gioco]]
- Come è fatto un gioco nel codice: [[{names[9]}|Il server]] (sezione «Giochi come moduli»)
"""
            open(os.path.join(OUT, 'Giochi', gfile.replace('(finale)', '').strip() + '.md'), 'w', encoding='utf8', newline='\n').write(note)
            links.append(f'- [[Giochi/{gfile.replace("(finale)", "").strip()}|{gname}]]')
        extra = '\n\n## Schede dei giochi\n' + '\n'.join(links)
    front = f"""---
tags: [{', '.join(TAGS.get(n, []))}]
sezione: {n}
---
"""
    content = f'{front}# {n}. {title}\n\n{nav}\n\n{body}{extra}\n\n---\n{nav}\n'
    open(os.path.join(OUT, names[n] + '.md'), 'w', encoding='utf8', newline='\n').write(content)

# ----------------------------------------------------------------- indice (Map of Content)
groups = [
    ('Il gioco', [1, 2, 3, 4, 5, 6]),
    ('Contenuti', [7]),
    ('Come è fatto', [8, 9, 10, 11, 12]),
    ('Distribuzione e sviluppo', [13, 14]),
    ('Decisioni e futuro', [15, 16, 17]),
]
title_of = {n: t for n, t, _ in sections}
lines = [
    '---', 'tags: [indice]', '---',
    '# Sapere è Potere',
    '',
    'Documentazione del progetto: party quiz multiplayer locale con schermo 3D e smartphone come controller.',
    'Documento originale in un unico file: `docs/PROGETTO.md`. Per installare e giocare: `README.md` nella radice del progetto.',
    '',
    '> «Sapere è Potere» è un nome provvisorio (marchio Sony). Si cambia in un solo punto: `shared/brand.json`.',
    '',
]
for g, nums in groups:
    lines.append(f'## {g}')
    for n in nums:
        lines.append(f'- [[{names[n]}|{n}. {title_of[n]}]]')
    lines.append('')
manual = os.path.join(OUT, 'Progetto')
if os.path.isdir(manual):
    lines.append('## Lavori in corso')
    lines += [f'- [[Progetto/{f[:-3]}]]' for f in sorted(os.listdir(manual)) if f.endswith('.md')]
    lines.append('')
lines += [
    '## Giochi',
    *[f'- [[Giochi/{f[:-3]}]]' for f in sorted(os.listdir(os.path.join(OUT, 'Giochi')))],
    '',
    '## Come usare questa cartella',
    'Apri in Obsidian la cartella `docs/obsidian` come vault (*Apri cartella come vault*). I diagrammi Mermaid si vedono nella lettura. Il grafo mostra come sono collegate le sezioni e le schede dei giochi.',
    '',
    '> Le note numerate, le schede dei giochi e questo indice sono generati da `docs/PROGETTO.md` con `python scripts/make-obsidian.py`: modifica il file originale e rigenera. Le note nella cartella `Progetto/` sono scritte a mano e non vengono toccate.',
]
open(os.path.join(OUT, INDEX + '.md'), 'w', encoding='utf8', newline='\n').write('\n'.join(lines) + '\n')

# impostazioni minime del vault: collegamenti wiki con percorsi più brevi
os.makedirs(os.path.join(OUT, '.obsidian'), exist_ok=True)
if not os.path.exists(os.path.join(OUT, '.obsidian', 'app.json')): open(os.path.join(OUT, '.obsidian', 'app.json'), 'w', encoding='utf8', newline='\n').write(
    '{\n  "newLinkFormat": "shortest",\n  "useMarkdownLinks": false,\n  "showFrontmatter": false\n}\n')
print(len(sections), 'sezioni,', len(os.listdir(os.path.join(OUT, 'Giochi'))), 'giochi')
