// Configurazione di electron-builder: un eseguibile per sistema, senza installer e senza firme a pagamento.
// Il nome del gioco arriva da shared/brand.json (unico punto da cambiare).
const brand = require('./shared/brand.json');

const artifact = `${brand.shortName}-\${version}-\${os}-\${arch}.\${ext}`;

module.exports = {
  appId: brand.appId,
  productName: brand.name,
  executableName: brand.shortName,
  copyright: `Copyright © ${new Date().getFullYear()}`,
  // L'app si impacchetta da app-build/ (vedi scripts/desktop-stage.mjs): niente node_modules dentro.
  directories: { app: 'app-build', output: 'release', buildResources: 'build' },
  asar: true,
  compression: 'normal',
  artifactName: artifact,
  // Lo script dell'hotspot deve stare fuori dall'archivio asar per poter essere eseguito da PowerShell.
  extraResources: [{ from: 'app-build/bosco.ps1', to: 'bosco.ps1' }],

  // Windows: un solo .exe "portable", si avvia con doppio clic senza installare nulla.
  win: { target: [{ target: 'portable', arch: ['x64'] }], icon: 'build/icon.png' },
  portable: { artifactName: artifact },

  // macOS: .dmg per Intel e Apple Silicon. Firma «ad-hoc» (identity: '-'): gratuita, senza certificato Apple.
  // Sui Mac con chip Apple un'app modificata e senza nessuna firma non parte (o risulta «danneggiata»);
  // con la firma ad-hoc basta aprirla la prima volta con tasto destro → Apri.
  // Niente hardened runtime: senza certificato bloccherebbe il caricamento delle librerie di Electron.
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    icon: 'build/icon.png',
    category: 'public.app-category.trivia-games',
    identity: '-',
    hardenedRuntime: false
  },
  dmg: { artifactName: artifact, title: '${productName}' },

  // Linux: AppImage, un solo file eseguibile.
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    icon: 'build/icon.png',
    category: 'Game',
    maintainer: 'erpaffo',
    // Su molte distribuzioni l'AppImage non può usare la sandbox SUID di Chromium: si avvia senza.
    executableArgs: ['--no-sandbox']
  },
  appImage: { artifactName: artifact }
};
