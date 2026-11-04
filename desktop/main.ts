// App desktop (Electron): contiene il server del gioco e lo schermo principale.
// Doppio clic → il server parte in-process e si apre la finestra a schermo intero; i telefoni
// si collegano come sempre (QR → controller.html). Nessun comando da terminale, nessun Node.js da installare.
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, type MenuItemConstructorOptions } from 'electron';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, type RunningServer } from '../server/app';
import { BRAND } from '../shared/brand';

const PREFERRED_PORT = 3000;
const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='));
const smokeFile = smokeArg?.slice('--smoke-test='.length);

// La cartella dei dati dipende dal nome breve (non da quello mostrato): cambiare il nome del gioco non fa "perdere" i pacchetti.
app.setName(BRAND.name);
app.setPath('userData', join(app.getPath('appData'), BRAND.shortName));
// Il gioco si chiamava «Sapere è Potere»: i pacchetti e le impostazioni di allora si spostano nella nuova cartella (una volta sola).
const oldData = join(app.getPath('appData'), 'SapereEPotere');
if (existsSync(oldData) && !existsSync(app.getPath('userData'))) {
  try { renameSync(oldData, app.getPath('userData')); } catch { /* cartella in uso: si riparte da zero, i vecchi dati restano dove sono */ }
}
// I suoni partono senza bisogno di un clic.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Linux: dentro un AppImage la sandbox di Chromium spesso non può partire (namespace utente limitati,
// es. Ubuntu 24.04) e il gioco non si aprirebbe. L'app carica solo pagine locali, quindi si disattiva.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');

let server: RunningServer | null = null;
let mainWindow: BrowserWindow | null = null;
let hotspotOn = false;
let quitting = false;

const appPath = app.getAppPath();
const userDir = () => join(app.getPath('userData'), 'user-packs');
const boscoScript = () => (app.isPackaged ? join(process.resourcesPath, 'bosco.ps1') : join(appPath, 'bosco.ps1'));
const boscoConfig = () => join(app.getPath('userData'), 'bosco.json');
const origin = () => `http://localhost:${server!.port}`;

/** Prova da sorgente (`npm run desktop`): se non ci sono ancora pacchetti personali, porta quelli del progetto. */
function migrateDevPacks() {
  if (app.isPackaged) return;
  const legacy = join(appPath, '..', 'user-packs');
  const target = userDir();
  mkdirSync(target, { recursive: true });
  if (existsSync(legacy) && readdirSync(target).length === 0) {
    for (const file of readdirSync(legacy).filter((f) => f.endsWith('.json'))) copyFileSync(join(legacy, file), join(target, file));
  }
}

// ------------------------------------------------------------ finestre

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    fullscreen: true,
    backgroundColor: '#12062e',
    title: BRAND.name,
    autoHideMenuBar: true,
    // preload: il menù di pausa del gioco può gestire finestra, monitor e uscita (vedi desktop/preload.ts)
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, preload: join(__dirname, 'preload.cjs') }
  });
  mainWindow = win;
  void win.loadURL(`${origin()}/host.html`);
  win.on('closed', () => {
    mainWindow = null;
  });
  // Esc NON esce dallo schermo intero: arriva al gioco, che apre il menù di pausa (F11 alterna lo schermo intero).
  return win;
}

// ------------------------------------------------------------ comandi dal menù di pausa del gioco

/** Accetta i comandi solo dalla finestra principale del gioco. */
function fromMain(e: Electron.IpcMainInvokeEvent) {
  return !!mainWindow && e.sender === mainWindow.webContents;
}

function desktopInfo() {
  const win = mainWindow!;
  const current = screen.getDisplayMatching(win.getBounds());
  return {
    fullscreen: win.isFullScreen(),
    size: win.getContentSize(),
    displays: screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Schermo ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (principale)' : ''} · ${d.size.width}×${d.size.height}`,
      current: d.id === current.id
    }))
  };
}

function registerDesktopIpc() {
  ipcMain.handle('desktop:info', (e) => (fromMain(e) ? desktopInfo() : null));
  ipcMain.handle('desktop:fullscreen', (e, on: unknown) => {
    if (!fromMain(e) || typeof on !== 'boolean') return null;
    mainWindow!.setFullScreen(on);
    return desktopInfo();
  });
  ipcMain.handle('desktop:display', (e, id: unknown) => {
    if (!fromMain(e) || typeof id !== 'number') return null;
    const target = screen.getAllDisplays().find((d) => d.id === id);
    if (!target) return null;
    const win = mainWindow!;
    const wasFull = win.isFullScreen();
    // In schermo intero la finestra non si sposta: si esce, si sposta, si rientra.
    if (wasFull) win.setFullScreen(false);
    const { x, y, width, height } = target.workArea;
    const [w, h] = win.getSize();
    win.setBounds({ x: x + Math.max(0, Math.round((width - w) / 2)), y: y + Math.max(0, Math.round((height - h) / 2)), width: Math.min(w, width), height: Math.min(h, height) });
    if (wasFull) setTimeout(() => win.setFullScreen(true), 150);
    return desktopInfo();
  });
  ipcMain.handle('desktop:size', (e, width: unknown, height: unknown) => {
    if (!fromMain(e) || !Number.isInteger(width) || !Number.isInteger(height)) return null;
    const win = mainWindow!;
    if (win.isFullScreen()) win.setFullScreen(false);
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setContentSize(Math.min(width as number, area.width), Math.min(height as number, area.height));
    win.center();
    return desktopInfo();
  });
  ipcMain.handle('desktop:quit', (e) => {
    if (fromMain(e)) app.quit();
  });
}

function openEditor() {
  const url = `${origin()}/editor.html`;
  const existing = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(url));
  if (existing) return existing.focus();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#12062e',
    title: `Laboratorio Domande · ${BRAND.name}`,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  void win.loadURL(url);
}

/** Le pagine del gioco restano nel gioco; i link esterni si aprono nel browser. */
function guardNavigation(contents: Electron.WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin())) {
      return { action: 'allow', overrideBrowserWindowOptions: { fullscreen: false, width: 1280, height: 860, autoHideMenuBar: true, backgroundColor: '#12062e' } };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin())) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
}

// ------------------------------------------------------------ modalità bosco (solo Windows)

function runBosco(action: 'start' | 'stop'): Promise<{ ssid: string; password: string } | null> {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', boscoScript(), '-HotspotOnly', '-Action', action, '-ConfigFile', boscoConfig()];
    const child = spawn('powershell.exe', args, { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => {
      const line = out.split(/\r?\n/).find((l) => l.startsWith('RESULT:') || l.startsWith('ERROR:'));
      if (!line) return reject(new Error("Lo script dell'hotspot non ha risposto."));
      if (line.startsWith('ERROR:')) return reject(new Error(line.slice(6)));
      const data = JSON.parse(line.slice(7));
      resolve(data.ssid ? data : null);
    });
  });
}

async function toggleHotspot() {
  try {
    const next = await runBosco(hotspotOn ? 'stop' : 'start');
    hotspotOn = !!next;
    server?.setHotspot(next);
    // La pagina rilegge le informazioni di rete e riprende la stessa stanza (sessionStorage).
    mainWindow?.webContents.reload();
    buildMenu();
    if (next) {
      void dialog.showMessageBox({
        type: 'info',
        message: 'Hotspot acceso 🌲',
        detail: `Rete «${next.ssid}», password «${next.password}».\nSullo schermo compaiono i QR per collegare i telefoni.`
      });
    }
  } catch (err) {
    dialog.showErrorBox("Hotspot non disponibile", `${(err as Error).message}\n\nSe il PC non ha il Wi-Fi, usa l'hotspot di un telefono: nella lobby c'è il pulsante per mostrare il QR della rete.`);
  }
}

// ------------------------------------------------------------ menu

function buildMenu() {
  const game: MenuItemConstructorOptions[] = [
    { label: 'Schermo intero', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
    { label: 'Laboratorio domande', accelerator: 'CmdOrCtrl+L', click: openEditor },
    { label: 'Apri la cartella dei pacchetti di domande', click: () => void shell.openPath(userDir()) },
    { label: 'Apri la cartella degli audio personalizzati', click: () => void shell.openPath(audioDir()) }
  ];
  if (process.platform === 'win32') {
    game.push({ type: 'separator' }, { label: hotspotOn ? '🌲 Spegni l\'hotspot (modalità bosco)' : '🌲 Accendi l\'hotspot (modalità bosco)', click: () => void toggleHotspot() });
  }
  game.push({ type: 'separator' }, { role: 'quit', label: 'Esci' });
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { label: 'Gioco', submenu: game },
    { label: 'Visualizza', submenu: [{ role: 'reload', label: 'Ricarica' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as MenuItemConstructorOptions])] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------ prova automatica (senza finestre)

/** `--smoke-test=file.json`: avvia il server, controlla pagine/pacchetti/bandiere, scrive l'esito ed esce. */
async function smokeTest(port: number) {
  const result: Record<string, unknown> = { port };
  let ok = true;
  const check = async (name: string, path: string, test: (res: Response) => Promise<boolean> | boolean) => {
    try {
      const res = await fetch(`http://localhost:${port}${path}`);
      const passed = res.ok && (await test(res));
      result[name] = passed ? 'ok' : `FALLITO (${res.status})`;
      ok &&= passed;
    } catch (err) {
      result[name] = `ERRORE ${(err as Error).message}`;
      ok = false;
    }
  };
  await check('host.html', '/host.html', async (r) => (await r.text()).includes('<title>'));
  await check('controller.html', '/controller.html', async (r) => (await r.text()).includes('controller'));
  await check('editor.html', '/editor.html', async (r) => (await r.text()).includes('editor'));
  await check('bandiera', '/flags/it.svg', async (r) => (await r.text()).includes('<svg'));
  await check('pacchetti', '/api/packs', async (r) => {
    const packs = (await r.json()) as { id: string; questions?: number; multiple: number; truefalse: number; numeric: number }[];
    result.pacchettiCaricati = packs.map((p) => `${p.id}:${p.multiple + p.truefalse + p.numeric}`).join(' ');
    return packs.length >= 4;
  });
  // Canale in tempo reale dei telefoni: protocollo Socket.IO "a mano" (nel bundle non c'è il client).
  // 0{...} = apertura · 40 = connessione al namespace · 420[...] = evento con conferma · 430[...] = risposta
  await new Promise<void>((done) => {
    const ws = new WebSocket(`ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`);
    const timer = setTimeout(() => {
      result.websocket = 'TIMEOUT';
      ok = false;
      ws.close();
      done();
    }, 8000);
    const finish = (value: string, passed: boolean) => {
      clearTimeout(timer);
      result.websocket = value;
      ok &&= passed;
      ws.close();
      done();
    };
    ws.onmessage = (ev) => {
      const msg = String(ev.data);
      if (msg.startsWith('0')) ws.send('40');
      else if (msg.startsWith('40')) ws.send('420["CREATE_ROOM",{}]');
      else if (msg.startsWith('430')) finish(msg.includes('"ok":true') ? 'ok' : `FALLITO ${msg}`, msg.includes('"ok":true'));
    };
    ws.onerror = () => finish('ERRORE di connessione', false);
  });
  // La finestra vera, ma nascosta: carica lo schermo principale e controlla titolo, schermata iniziale ed errori in console.
  try {
    const win = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const errors: string[] = [];
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error') errors.push(e.message.slice(0, 160));
    });
    await Promise.race([
      win.loadURL(`http://localhost:${port}/host.html`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout nel caricamento')), 20_000))
    ]);
    await new Promise((r) => setTimeout(r, 1500)); // lascia girare gli script della pagina
    const page = (await win.webContents.executeJavaScript(
      `({ title: document.title, splash: !!document.getElementById('splash-btn'), canvas: !!document.querySelector('#stage canvas') })`
    )) as { title: string; splash: boolean; canvas: boolean };
    win.destroy();
    result.finestra = page.title && page.splash ? 'ok' : `FALLITO ${JSON.stringify(page)}`;
    result.titolo = page.title;
    result.grafica3d = page.canvas ? 'ok' : 'assente (WebGL non disponibile su questo computer?)'; // solo informativo
    if (errors.length) result.erroriConsole = errors;
    ok &&= !!page.title && page.splash;
  } catch (err) {
    result.finestra = `ERRORE ${(err as Error).message}`;
    ok = false;
  }
  // Salvataggio di un pacchetto personale nella cartella dei dati dell'utente.
  try {
    // POST crea il pacchetto e assegna l'id (PUT su un id inesistente risponde 404).
    const res = await fetch(`http://localhost:${port}/api/packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Prova', categories: [{ id: 'c1', name: 'Prova' }], questions: [{ id: 'q1', categoryId: 'c1', type: 'truefalse', text: 'Funziona?', answer: true }] })
    });
    const packId = res.ok ? ((await res.json()) as { id: string }).id : '';
    const saved = !!packId && existsSync(join(userDir(), `${packId}.json`));
    if (packId) await fetch(`http://localhost:${port}/api/packs/${packId}`, { method: 'DELETE' });
    result.salvataggioPacchetti = res.ok && saved ? 'ok' : `FALLITO (HTTP ${res.status}${saved ? '' : ', file non scritto'}: ${res.ok ? '' : (await res.text()).slice(0, 200)})`;
    ok &&= res.ok && saved;
  } catch (err) {
    result.salvataggioPacchetti = `ERRORE ${(err as Error).message}`;
    ok = false;
  }
  result.userDir = userDir();
  result.packaged = app.isPackaged;
  result.esito = ok ? 'OK' : 'FALLITO';
  if (smokeFile) writeFileSync(smokeFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result));
  app.exit(ok ? 0 : 1);
}

// ------------------------------------------------------------ avvio

/** Audio personalizzati (voce, musiche, effetti): stessi percorsi di client/public/audio. */
function audioDir() {
  const dir = join(app.getPath('userData'), 'audio');
  const readme = join(dir, 'LEGGIMI.txt');
  if (!existsSync(readme)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      readme,
      [
        'AUDIO PERSONALIZZATI',
        '',
        'Metti qui i tuoi file audio con lo stesso nome e la stessa cartella di quelli di serie:',
        '  voice/welcome-1.mp3   -> la voce del presentatore che dà il benvenuto',
        '  music/lobby.mp3       -> la musica della sala d\'attesa',
        '  sfx/correct-1.mp3     -> il suono della risposta giusta',
        '',
        'Per cambiare l\'elenco dei file (aggiungere varianti, togliere suoni, cambiare i volumi)',
        'copia qui anche audio.json e modificalo: ha la precedenza su quello di serie.',
        'Formati consigliati: mp3 o ogg. Dopo aver cambiato i file, ricarica la pagina (Ctrl+R).',
        ''
      ].join('\r\n')
    );
  }
  return dir;
}

if (!smokeFile && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    try {
      migrateDevPacks();
      server = await startServer({
        // La prova automatica usa una porta sua, per non parlare con una partita già aperta sulla 3000.
        port: smokeFile !== undefined ? PREFERRED_PORT + 900 : PREFERRED_PORT,
        portTries: 10,
        staticDir: join(appPath, 'client'),
        builtinPacksDir: join(appPath, 'packs'),
        userPacksDir: userDir(),
        mediaDir: join(app.getPath('userData'), 'media'),
        audioOverrideDir: audioDir(),
        log: () => undefined
      });
    } catch (err) {
      dialog.showErrorBox(`${BRAND.name}: impossibile avviare il gioco`, `${(err as Error).message}\n\nControlla che nessun altro programma stia usando le porte da ${PREFERRED_PORT} a ${PREFERRED_PORT + 10}.`);
      return app.exit(1);
    }
    if (smokeFile !== undefined) return smokeTest(server.port);

    app.on('web-contents-created', (_e, contents) => guardNavigation(contents));
    buildMenu();
    registerDesktopIpc();
    createMainWindow();
  });

  // Durante la prova automatica la finestra nascosta si chiude da sola: l'app deve restare viva fino all'esito.
  app.on('window-all-closed', () => {
    if (smokeFile === undefined) app.quit();
  });

  // All'uscita l'hotspot acceso dall'app viene spento.
  app.on('before-quit', (e) => {
    if (quitting || !hotspotOn) return;
    e.preventDefault();
    quitting = true;
    void runBosco('stop').catch(() => null).finally(() => app.exit(0));
  });
}
