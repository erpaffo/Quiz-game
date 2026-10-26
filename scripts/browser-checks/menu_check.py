"""Prova nel browser del menù del Pack: copertina -> griglia (14 cartucce, 6 categorie) -> sottomenù -> round e regole
da TV e telefono -> avvio dal telefono -> partita. Uso: python menu_check.py <cartella-screenshot>
Serve il server acceso (npm run build && PORT=3099 npx tsx server/index.ts --prod) e `pip install playwright`."""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('URL', 'http://localhost:3099')
OUT = sys.argv[1]
problems = []


def shot(page, name):
    page.screenshot(path=f'{OUT}/{name}.png')


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    tv_ctx = browser.new_context(viewport={'width': 1920, 'height': 1080})
    tv = tv_ctx.new_page()
    errors = []
    tv.on('pageerror', lambda e: errors.append(f'TV pageerror: {e}'))
    tv.on('console', lambda m: errors.append(f'TV console: {m.text}') if m.type == 'error' else None)
    tv.goto(f'{BASE}/host.html')
    tv.click('text=Apri una nuova stanza')
    tv.wait_for_selector('.pk-cover', timeout=15000)
    time.sleep(1.5)
    code = tv.inner_text('#code-chip').strip()
    print('stanza', code)
    shot(tv, '1_tv_copertina')

    # telefono del capo stanza
    ph_ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ph = ph_ctx.new_page()
    ph.on('pageerror', lambda e: errors.append(f'PH pageerror: {e}'))
    ph.on('console', lambda m: errors.append(f'PH console: {m.text}') if m.type == 'error' else None)
    ph.goto(f'{BASE}/controller.html?room={code}')
    ph.fill('input[name=name]', 'Paffo')
    ph.click('button[type=submit]')
    ph.wait_for_selector('[data-act=ready]', timeout=15000)
    time.sleep(1)
    ph.click('[data-act=ready]')
    time.sleep(1)
    for _ in range(2):
        tv.click('[data-act=bot]')
        time.sleep(0.4)

    # TV: copertina -> griglia
    tv.click('[data-pk-view=grid]')
    tv.wait_for_selector('.pk-grid', timeout=5000)
    time.sleep(0.8)
    shot(tv, '2_tv_griglia')
    n_cards = tv.locator('.pk-card').count()
    n_cats = tv.locator('.pk-cat').count()
    print('cartucce', n_cards, 'categorie', n_cats)
    if n_cards != 14:
        problems.append(f'cartucce {n_cards} != 14')

    # TV: apre Macchina del Tempo
    tv.click('[data-pk-open=tempo]')
    tv.wait_for_selector('.pk-detail', timeout=5000)
    time.sleep(0.6)
    shot(tv, '3_tv_dettaglio_tempo')
    before = tv.inner_text('.pk-stepper b')
    tv.click('[data-pk-rounds="1"]')
    time.sleep(0.6)
    after = tv.inner_text('.pk-stepper b')
    print('round', before, '->', after)
    if int(after) != int(before) + 1:
        problems.append('stepper TV non cambia')
    tv.click('[data-pk-opt=pace][data-pk-choice=fast]')
    time.sleep(0.6)
    if 'on' not in (tv.get_attribute('[data-pk-opt=pace][data-pk-choice=fast]', 'class') or ''):
        problems.append('opzione ritmo TV non selezionata')
    shot(tv, '4_tv_dettaglio_tempo_modificato')

    # il telefono segue la TV (stesso sottomenu)
    ph.wait_for_selector('.pk-detail', timeout=5000)
    time.sleep(0.6)
    ph.screenshot(path=f'{OUT}/5_telefono_dettaglio.png', full_page=True)
    phone_rounds = ph.inner_text('.pk-stepper b')
    if phone_rounds != after:
        problems.append(f'telefono {phone_rounds} != TV {after}')
    # dal telefono: round -1 e torna alla griglia
    ph.click('[data-pk-rounds="-1"]')
    time.sleep(0.7)
    if tv.inner_text('.pk-stepper b') != before:
        problems.append('il telefono non cambia i round sulla TV')
    ph.click('[data-pk-back]')
    ph.wait_for_selector('.pk-grid', timeout=5000)
    tv.wait_for_selector('.pk-grid', timeout=5000)
    ph.screenshot(path=f'{OUT}/6_telefono_griglia.png', full_page=True)

    # quiz: sottomenu con impostazioni in piu
    tv.click('[data-pk-open=quiz]')
    tv.wait_for_selector('.pk-detail', timeout=5000)
    time.sleep(0.6)
    shot(tv, '7_tv_dettaglio_quiz')

    # parte Macchina del Tempo dal telefono
    ph.wait_for_selector('.pk-detail', timeout=5000)
    ph.click('[data-pk-back]')
    ph.wait_for_selector('.pk-grid', timeout=5000)
    ph.click('[data-pk-open=tempo]')
    ph.wait_for_selector('[data-act=start]:not([disabled])', timeout=5000)
    ph.click('[data-act=start]')
    tv.wait_for_selector('.tempo-stage', timeout=10000)
    time.sleep(1.2)
    shot(tv, '8_tv_gioco_tempo')
    print('fase TV:', tv.inner_text('#phase-label'))
    if 'Macchina' not in tv.inner_text('#phase-label'):
        problems.append('etichetta fase non mostra il gioco')

    print('ERRORI PAGINA:', errors if errors else 'nessuno')
    print('PROBLEMI:', problems if problems else 'nessuno')
    browser.close()
