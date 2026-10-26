"""Prova completa dell'app «Party Tascabile» in un browser vero, con un telefono simulato.

Gioca tutti gli 8 giochi dall'inizio alla fine, controlla la Coppa del Tavolo, poi stacca la rete
(modalità aereo) e verifica che l'app si riapra e si possa giocare. Il tempo è «finto» (clock di Playwright):
turni da 45 secondi e micce da 25 si provano in un attimo.

Uso:  npm run build:pass  &&  python scripts/browser-checks/pass_check.py [cartella-screenshot] [chromium,webkit]
Serve: pip install playwright && python -m playwright install chromium webkit
"""

import os
import re
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(ROOT, 'dist')
PORT = int(os.environ.get('PASS_PORT', '3098'))
URL = f'http://localhost:{PORT}/pass/'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'pass-shots')
BROWSERS = (sys.argv[2] if len(sys.argv) > 2 else 'chromium').split(',')
PLAYERS = ['Sandro', 'Samuele', 'Valerio', 'Paffo']


class Check:
    def __init__(self, page, name):
        self.p = page
        self.name = name
        self.errors = []
        self.done = []
        page.on('pageerror', lambda e: self.errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: self.errors.append(f'console: {m.text}') if m.type == 'error' else None)

    # ---------------------------------------------------------------- aiutanti
    def run(self, ms):
        self.p.clock.run_for(ms)

    def has(self, sel):
        return self.p.locator(sel).count() > 0

    def click(self, sel, nth=0):
        self.p.locator(sel).nth(nth).click()

    def shot(self, label):
        self.p.screenshot(path=os.path.join(OUT, f'{self.name}_{label}.png'), full_page=True)

    def hold_reveal(self):
        """Scudo anti-sbirciata: tieni premuto, leggi il segreto, rilascia, «ho visto»."""
        assert not self.p.locator('.pp-secret').is_visible(), 'il segreto deve essere coperto prima di premere'
        box = self.p.locator('[data-hold]').bounding_box()
        self.p.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        self.p.mouse.down()
        secret = self.p.locator('.pp-secret').inner_text()
        assert self.p.locator('.pp-secret').is_visible(), 'il segreto deve vedersi tenendo premuto'
        self.p.mouse.up()
        assert not self.p.locator('.pp-secret').is_visible(), 'rilasciando il segreto deve sparire'
        self.click('[data-done]')
        return secret

    def start(self, game, options=None):
        self.click(f'[data-act=open][data-id={game}]')
        for o, c in (options or {}).items():
            self.click(f'[data-act=opt][data-o={o}][data-c="{c}"]')
        self.shot(f'{game}_0_sottomenu')
        self.click('[data-act=start]')
        assert self.has('.pp-play'), f'{game}: la partita non parte'

    def finish(self, game, loop_guard):
        assert loop_guard > 0, f'{game}: la partita non finisce'
        assert self.has('.pp-summary h1'), f'{game}: manca il riepilogo finale'
        self.shot(f'{game}_9_fine')
        self.click('[data-act=home]')
        assert self.has('.pp-games'), f'{game}: non si torna al menù'
        self.done.append(game)

    # ---------------------------------------------------------------- gli 8 giochi
    def fronte(self):
        self.start('fronte', {'mode': 'tabu', 'time': '45', 'turns': '1'})
        for turn in range(len(PLAYERS)):
            self.click('[data-act=go]')
            self.run(3600)
            assert self.has('.pp-fronte'), 'fronte: schermo diviso assente'
            for z in ['ok', 'ok', 'skip', 'taboo', 'ok']:
                self.click(f'[data-zone={z}]')
                self.run(400)
            if turn == 0:
                self.shot('fronte_1_gioco')
            self.run(46_000)
            assert self.has('.pp-review'), 'fronte: manca il riepilogo del turno'
            if turn == 0:
                self.click('[data-act=fix]', 2)  # correzione di un tocco sbagliato
                self.shot('fronte_2_riepilogo')
            self.click('[data-act=next]')
        self.finish('fronte', 1)

    def bomba(self):
        self.start('bomba', {'lives': '2', 'fuse': 'corta'})
        guard, contested = 60, False
        while guard and not self.has('.pp-summary'):
            guard -= 1
            if self.has('.pp-bomb'):
                for _ in range(2):
                    self.click('[data-act=pass]')
                    self.run(450)
                if not contested:
                    self.shot('bomba_1_gioco')
                    self.click('[data-act=contest]')
                    assert self.has('[data-act=no]')
                    self.click('[data-act=no]')
                    contested = True
                self.run(26_000)
                if self.has('.pp-boom'):
                    self.shot('bomba_2_boom')
            elif self.has('[data-act=go]'):
                self.click('[data-act=go]')
            elif self.has('[data-act=next]'):
                self.click('[data-act=next]')
        self.finish('bomba', guard)

    def impostore(self):
        self.start('impostore', {'rounds': '1', 'talk': '90'})
        cards = {}
        for i in range(len(PLAYERS)):
            name = self.p.locator('.pp-shield-name').inner_text().strip()
            if i == 0:
                self.shot('impostore_1_scudo')
            cards[name] = self.hold_reveal()
        impostors = [n for n, t in cards.items() if 'IMPOSTORE' in t]
        assert len(impostors) == 1, f'impostore: attesi 1 impostore, trovati {impostors}'
        citizen_text = next(t for n, t in cards.items() if n not in impostors)
        secret = citizen_text.split('La parola segreta è')[-1].strip()
        self.click('[data-act=go]')
        self.run(91_000)  # la discussione finisce da sola e si passa al voto
        assert self.has('[data-act=accuse]'), 'impostore: dopo il timer manca il voto'
        self.p.locator('[data-act=accuse]', has_text=impostors[0]).click()
        assert self.has('[data-act=guess]'), 'impostore: manca l’ultima possibilità'
        wrong = [w for w in self.p.locator('[data-act=guess]').all_inner_texts() if w.strip() != secret]
        assert len(wrong) == 7, f'impostore: 8 parole con quella giusta ({secret})'
        self.p.locator('[data-act=guess]', has_text=re.compile(f'^{re.escape(wrong[0].strip())}$')).first.click()
        assert 'cittadini' in self.p.locator('.pp-outcome').inner_text(), 'impostore: dovevano vincere i cittadini'
        self.shot('impostore_2_esito')
        self.click('[data-act=next]')
        self.finish('impostore', 1)

    def panico(self):
        self.start('panico', {'turns': '1', 'seconds': '5'})
        guard, judged, runs = 40, 0, 0
        while guard and not self.has('.pp-summary'):
            guard -= 1
            if self.has('[data-act=ko]'):
                judged += 1
                self.click('[data-act=ko]' if judged % 3 == 1 else '[data-act=ok]')
            elif self.has('[data-act=go]'):
                self.click('[data-act=go]')
                runs += 1
                if runs == 1:
                    self.run(1200)
                    self.shot('panico_1_countdown')
                    self.run(4500)
                else:
                    self.click('[data-act=stop]')
            elif self.has('[data-act=next]'):
                self.click('[data-act=next]')
        self.finish('panico', guard)

    def onda(self):
        self.start('onda', {'rounds': '1', 'bet': 'on'})
        guard = 40
        while guard and not self.has('.pp-summary'):
            guard -= 1
            if self.has('[data-hold]'):
                self.hold_reveal()
            elif self.has('.pp-range'):
                self.p.locator('.pp-range').evaluate("el => { el.value = '63'; el.dispatchEvent(new Event('input', { bubbles: true })); }")
                assert self.p.locator('[data-val]').inner_text() == '63', 'onda: l’ago non si muove'
                self.click('[data-act=lock]')
            elif self.has('[data-act=left]'):
                self.click('[data-act=left]')
            elif self.has('[data-act=go]'):
                self.click('[data-act=go]')
                self.shot('onda_1_rivelazione')
            elif self.has('[data-act=next]'):
                self.click('[data-act=next]')
        self.finish('onda', guard)

    def tribunale(self):
        self.start('tribunale', {'questions': '6'})
        guard = 60
        while guard and not self.has('.pp-summary'):
            guard -= 1
            if self.has('[data-act=pick]'):
                self.click('[data-act=pick]', 1)
            elif self.has('[data-act=toggle]'):
                self.click('[data-act=toggle]', 1)
                self.click('[data-act=unan]')
                self.click('[data-act=ok]')
                self.shot('tribunale_1_verdetto')
            elif self.has('[data-act=go]'):
                self.click('[data-act=go]')
                self.run(3600)
            elif self.has('[data-act=next]'):
                self.click('[data-act=next]')
        self.finish('tribunale', guard)

    def catena(self):
        self.start('catena', {'draw': '20', 'start': 'random'})
        guard, drawings = 40, 0
        while guard and not self.has('.pp-summary'):
            guard -= 1
            if self.has('[data-act=other]'):
                self.click('[data-act=other]')
                self.click('[data-act=ok]')
            elif self.has('canvas.pp-canvas'):
                c = self.p.locator('canvas.pp-canvas').bounding_box()
                self.p.mouse.move(c['x'] + 30, c['y'] + 30)
                self.p.mouse.down()
                for k in range(1, 12):
                    self.p.mouse.move(c['x'] + 30 + k * 20, c['y'] + 30 + (k % 3) * 25)
                self.p.mouse.up()
                drawings += 1
                if drawings == 1:
                    self.shot('catena_1_disegno')
                    self.click('[data-act=done]')
                else:
                    self.run(21_000)  # tempo scaduto: il disegno viene salvato da solo
            elif self.has('input.pp-input'):
                self.p.locator('input.pp-input').fill('Un gatto che vola?')
                self.click('[data-act=ok]')
            elif self.has('[data-act=more]'):
                self.click('[data-act=more]')
            elif self.has('[data-act=awards]'):
                self.shot('catena_2_moviola')
                assert self.p.locator('.pp-reel img.pp-drawing').count() == 2, 'catena: nella moviola servono 2 disegni'
                self.click('[data-act=awards]')
            elif self.has('[data-act=pick]'):
                self.click('[data-act=pick]')
            elif self.has('[data-act=go]'):
                self.click('[data-act=go]')
        self.finish('catena', guard)

    def duello(self):
        self.start('duello', {'target': '3', 'speed': 'normal'})
        guard, wins, penalty_tested = 400, 0, False
        while guard and not self.has('.pp-summary'):
            guard -= 1
            if self.has('.pp-duel'):
                truth = self.p.locator('[data-card="0"]').get_attribute('data-truth')
                if truth == '1':
                    self.click('[data-side="0"]')
                elif not penalty_tested:
                    self.click('[data-side="1"]')  # falsa partenza: −1 (mai sotto zero)
                    penalty_tested = True
                    self.shot('duello_1_gioco')
                self.run(2600)
            elif self.has('[data-act=next]'):
                wins += 1
                self.click('[data-act=next]')
            elif self.has('[data-act=go]'):
                self.click('[data-act=go]')
                self.run(3600)
        assert wins == len(PLAYERS) - 1, f'duello: attesi {len(PLAYERS) - 1} duelli, giocati {wins}'
        self.finish('duello', guard)


def main():
    os.makedirs(OUT, exist_ok=True)
    assert os.path.exists(os.path.join(DIST, 'pass', 'sw.js')), 'Manca dist/pass: esegui prima «npm run build:pass»'
    def serve():
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', DIST],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.2)
        return srv

    failures = []
    server = None
    try:
        with sync_playwright() as pw:
            for bname in BROWSERS:
                server = serve()
                browser = getattr(pw, bname).launch()
                device = dict(pw.devices['iPhone 13'])
                device.pop('default_browser_type', None)
                if bname != 'webkit':
                    device['is_mobile'] = True
                ctx = browser.new_context(**device, service_workers='allow')
                page = ctx.new_page()
                ck = Check(page, bname)
                try:
                    page.goto(URL)
                    page.wait_for_selector('.pp-header')
                    page.wait_for_selector('.pp-badge.ok', timeout=20_000)  # service worker pronto = offline ok
                    assert 'Condividi' in page.locator('.pp-tip').inner_text(), 'manca la guida «Aggiungi alla schermata Home» per iPhone'
                    assert page.locator('link[rel=apple-touch-icon]').count() == 1
                    ck.shot('00_home_vuota')
                    for n in PLAYERS:
                        page.fill('[data-form=add] input', n)
                        page.press('[data-form=add] input', 'Enter')
                    page.fill('[data-form=add] input', 'sandro')
                    page.press('[data-form=add] input', 'Enter')
                    assert 'già al tavolo' in page.locator('.pp-error').inner_text()
                    assert page.locator('.pp-chip').count() == len(PLAYERS)
                    ck.shot('01_home_tavolo')
                    page.clock.install()
                    for game in ['fronte', 'bomba', 'impostore', 'panico', 'onda', 'tribunale', 'catena', 'duello']:
                        getattr(ck, game)()
                        print(f'  [{bname}] ✓ {game}')
                    ck.click('[data-act=cup]')
                    points = [int(x) for x in page.locator('.pp-standings b').all_inner_texts()]
                    assert sum(points) > 0, 'la Coppa del Tavolo è vuota'
                    ck.shot('02_coppa')
                    ck.click('[data-act=home]')

                    # ---------------- senza rete: il server si spegne DAVVERO (come un telefono lontano da ogni rete)
                    server.terminate()
                    server.wait()
                    if bname == 'chromium':
                        ctx.set_offline(True)  # in più, rete del browser staccata (in WebKit la simulazione di Playwright non regge i service worker)
                    page.reload()
                    page.wait_for_selector('.pp-header', timeout=10_000)
                    assert page.locator('.pp-chip').count() == len(PLAYERS), 'offline: i giocatori salvati devono restare'
                    page.goto(URL + '?offline-test=1')
                    page.wait_for_selector('.pp-games', timeout=10_000)
                    ck.click('[data-act=open][data-id=panico]')
                    ck.click('[data-act=start]')
                    assert ck.has('.pp-play'), 'offline: la partita non parte'
                    ck.shot('03_offline_partita')
                    if bname == 'chromium':
                        ctx.set_offline(False)
                    print(f'  [{bname}] ✓ offline (server spento: app riaperta dalla memoria del telefono)')
                except Exception as e:  # noqa: BLE001
                    ck.shot('ZZ_errore')
                    failures.append(f'{bname}: {e}')
                real_errors = [e for e in ck.errors if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to load resource' not in e and 'Could not connect' not in e]
                if real_errors:
                    failures.append(f'{bname}: errori nella pagina: {real_errors[:5]}')
                print(f'[{bname}] giochi completati: {len(ck.done)}/8 · errori pagina: {len(real_errors)}')
                browser.close()
                server.terminate()
    finally:
        if server:
            server.terminate()
    print('RISULTATO:', 'TUTTO OK' if not failures else 'PROBLEMI')
    for f in failures:
        print(' -', f)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
