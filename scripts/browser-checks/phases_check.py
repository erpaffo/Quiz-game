"""Screenshot di tutte le fasi di gioco: TV (1920x1080) + un telefono + bot. Fa uno scatto di TV e telefono
ogni volta che la schermata cambia, così si guardano domande, risposte, classifiche e i giochi del Pack.
Uso: python phases_check.py <cartella-screenshot> [giochi] [secondi-per-gioco]
  giochi: elenco separato da virgole di id di shared/shows.ts (default: quiz), es. quiz,tempo,bluff
Serve il server acceso: npm run build, poi $env:PORT='3097'; npx tsx server/index.ts --prod"""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('URL', 'http://localhost:3097')
OUT = sys.argv[1]
GAMES = (sys.argv[2] if len(sys.argv) > 2 else 'quiz').split(',')
SECONDS = int(sys.argv[3]) if len(sys.argv) > 3 else 240
BOTS = 3
os.makedirs(OUT, exist_ok=True)
errors = []
current = ['menu']  # gioco in corso, per sapere dove nasce un errore della pagina

# Chiave della schermata TV: etichetta di fase + classi dei blocchi del pannello (cambia quando cambia il passo).
TV_KEY = """() => {
  const p = document.querySelector('#panel');
  const cls = p ? [...p.querySelectorAll(':scope > *, :scope > * > *')].slice(0, 12).map((e) => e.className).join(' ') : '';
  return (document.querySelector('#phase-label')?.textContent ?? '') + '|' + cls;
}"""

# Il telefono gioca da solo: risponde, salta le carte, preme i bottoni principali.
PHONE_PLAY = """() => {
  const app = document.querySelector('#app');
  const pick = (sel) => [...app.querySelectorAll(sel)].find((b) => !b.disabled && b.offsetParent !== null);
  const b = pick('.ans') || pick('[data-act=skip-intro]') || pick('[data-act=skip]') || pick('[data-act=again]')
    || pick('.opt-btn, .choice, .cat, .bet, .target, [data-i], [data-id], [data-option]') || pick('button.btn:not(.secondary)');
  if (b) b.click();
  const input = [...app.querySelectorAll('input[type=text], input:not([type]), textarea')].find((i) => !i.disabled && !i.value);
  if (input) {
    input.value = 'pozzo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.form?.requestSubmit?.();
  }
  return b ? (b.dataset.act || b.className || b.textContent).slice(0, 30) : '';
}"""


def safe_name(s):
    return ''.join(c if c.isalnum() else '_' for c in s)[:40]


with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    tv = browser.new_context(viewport={'width': 1920, 'height': 1080}).new_page()
    tv.on('pageerror', lambda e: errors.append(f'TV [{current[0]}] pageerror: {e}'))
    tv.on('console', lambda m: errors.append(f'TV console: {m.text}') if m.type == 'error' else None)
    tv.goto(f'{BASE}/host.html')
    tv.click('text=Apri una nuova stanza')
    tv.wait_for_selector('.pk-cover', timeout=15000)
    code = tv.inner_text('#code-chip').strip()

    ph = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    ph.on('pageerror', lambda e: errors.append(f'PH [{current[0]}] pageerror: {e}'))
    ph.goto(f'{BASE}/controller.html?room={code}')
    ph.fill('input[name=name]', 'Paffo')
    ph.click('button[type=submit]')
    ph.wait_for_selector('[data-act=ready]', timeout=15000)
    time.sleep(1)
    ph.click('[data-act=ready]')
    for _ in range(BOTS):
        tv.click('[data-act=bot]')
        time.sleep(0.3)
    tv.click('[data-pk-view=grid]')
    tv.wait_for_selector('.pk-grid', timeout=5000)
    time.sleep(1)
    n = 0

    def shot(tag):
        global n
        n += 1
        tv.screenshot(path=f'{OUT}/{n:03d}_{tag}_tv.png')
        ph.screenshot(path=f'{OUT}/{n:03d}_{tag}_tel.png')

    shot('menu')
    def back_to_menu():
        """Tempo scaduto o gioco bloccato: Esc apre la pausa, «Esci dalla partita» (con conferma) torna al menù."""
        if tv.locator('.pk-grid').count():
            return
        tv.keyboard.press('Escape')
        for _ in range(2):
            if tv.locator('[data-act=exit-game]').count():
                tv.click('[data-act=exit-game]')
                time.sleep(0.4)
        tv.wait_for_selector('.pk-grid, .pk-detail', timeout=10000)  # dal quiz si torna al suo sottomenù
        time.sleep(1)

    def play(game):
        ph.wait_for_selector('.pk-grid', timeout=20000)
        ph.click(f'[data-pk-open={game}]')
        time.sleep(0.5)
        ready = ph.locator('[data-act=ready]')
        if ready.count() and 'Sono pronto' in ready.inner_text():  # «Esci dalla partita» toglie il «pronto»
            ready.click()
        ph.wait_for_selector('[data-act=start]:not([disabled])', timeout=8000)
        for _ in range(6):  # round al minimo: si vedono tutte le fasi in meno tempo
            if ph.locator('[data-pk-rounds="-1"]:not([disabled])').count():
                ph.click('[data-pk-rounds="-1"]')
                time.sleep(0.2)
        ph.click('[data-act=start]')
        last, end = '', time.time() + SECONDS
        while time.time() < end:
            time.sleep(0.8)
            key = tv.evaluate(TV_KEY)
            if key != last:
                time.sleep(0.6)  # lascia finire le animazioni d'ingresso
                shot(f'{game}_{safe_name(key.split("|")[0])}')
                last = key
            ph.evaluate(PHONE_PLAY)
            if tv.locator('.pk-grid').count() and time.time() > end - SECONDS + 5:
                break  # il gioco è finito ed è tornato al menù
        print(game, 'scatti fino a', n, '· tornato al menù da solo:', bool(tv.locator('.pk-grid').count()))

    for game in GAMES:
        current[0] = game
        try:
            play(game)
        except Exception as e:  # un gioco che non parte non ferma la prova degli altri
            shot(f'{game}_ERRORE')
            print(game, 'ERRORE:', str(e).splitlines()[0])
        back_to_menu()
        if ph.locator('[data-pk-back]').count():
            ph.click('[data-pk-back]')
            time.sleep(0.5)

    print('ERRORI PAGINA:', errors[:20] if errors else 'nessuno')
    browser.close()
