"""Fotografa l'anteprima 3D dei personaggi dal telefono. Uso: python characters_check.py <cartella> [Nome1,Nome2,...] [numero-skin]
Esempio: python characters_check.py shots Sandro,Samuele,Valerio,Paffo,Pacio,J 3. Serve il server acceso."""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('URL', 'http://localhost:3099')
OUT = sys.argv[1]
WANT = sys.argv[2].split(',') if len(sys.argv) > 2 else ['Sandro', 'Samuele', 'Valerio', 'Paffo', 'Pacio', 'J']
SKINS = int(sys.argv[3]) if len(sys.argv) > 3 else 1

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    tv = browser.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    tv.goto(f'{BASE}/host.html')
    tv.click('text=Apri una nuova stanza')
    tv.wait_for_selector('#code-chip', timeout=15000)
    time.sleep(1)
    code = tv.inner_text('#code-chip').strip()
    ph = browser.new_context(viewport={'width': 420, 'height': 900}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    errors = []
    ph.on('pageerror', lambda e: errors.append(str(e)))
    ph.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    ph.goto(f'{BASE}/controller.html?room={code}')
    ph.fill('input[name=name]', 'Test')
    ph.click('button[type=submit]')
    ph.wait_for_selector('.char-name', timeout=15000)
    time.sleep(1.0)
    seen = []
    for _ in range(20):
        name = ph.inner_text('.char-name').strip()
        if name in seen:
            break
        seen.append(name)
        if name in WANT:
            for sk in range(SKINS):
                if sk:
                    ph.locator('.skin').nth(sk).click()
                    time.sleep(0.5)
                time.sleep(1.0)
                ph.locator('#preview').screenshot(path=f'{OUT}/char_{name}_{sk}.png')
        ph.click('[data-act=next]')
        time.sleep(0.6)
    print('personaggi visti:', seen)
    print('errori:', errors if errors else 'nessuno')
    browser.close()
