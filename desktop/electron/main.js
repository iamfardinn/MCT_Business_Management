const {
  app, BrowserWindow, shell, ipcMain, dialog,
  protocol, net, utilityProcess,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// ─── Constants ────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = 'http://localhost:5173';
const CONFIG_PATH         = path.join(app.getPath('userData'), 'config.json');
const SERVER_CONFIG_PATH  = path.join(app.getPath('userData'), 'server-config.json');

// ─── Register app:// as a privileged scheme (MUST be before app.whenReady) ───
// This gives the renderer a real, secure origin so <script type="module">
// and ES imports work correctly (unlike the opaque file:// origin).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// ─── App config (API URL override, etc.) ─────────────────────────────────────
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) { console.error('[Config]', e); }
  return {};
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Server config (DB + JWT) ─────────────────────────────────────────────────
function loadServerConfig() {
  let cfg = {
    db: { host: 'localhost', port: 5432, name: 'mct_bms', user: 'postgres', password: '' },
    jwt: { secret: '', refreshSecret: '' },
  };
  try {
    if (fs.existsSync(SERVER_CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(SERVER_CONFIG_PATH, 'utf-8'));
      cfg = { ...cfg, ...saved, db: { ...cfg.db, ...saved.db }, jwt: { ...cfg.jwt, ...saved.jwt } };
    }
  } catch (e) { console.error('[ServerConfig]', e); }

  // Auto-generate JWT secrets on first run — they stay stable across restarts
  if (!cfg.jwt.secret)        cfg.jwt.secret        = crypto.randomBytes(64).toString('hex');
  if (!cfg.jwt.refreshSecret) cfg.jwt.refreshSecret = crypto.randomBytes(64).toString('hex');
  return cfg;
}
function saveServerConfig(cfg) {
  fs.writeFileSync(SERVER_CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Backend process management ───────────────────────────────────────────────
let backendProcess = null;

function startBackend(cfg) {
  if (isDev) {
    console.log('[Main] Dev mode — backend should be started separately');
    return;
  }

  const bundlePath = path.join(process.resourcesPath, 'backend', 'server.bundle.js');
  if (!fs.existsSync(bundlePath)) {
    console.error('[Main] Backend bundle not found:', bundlePath);
    dialog.showErrorBox(
      'Backend Missing',
      'The backend server bundle was not found in the app resources.\nPlease reinstall the application.'
    );
    return;
  }

  console.log('[Main] Starting backend server…');
  backendProcess = utilityProcess.fork(bundlePath, [], {
    env: {
      ...process.env,
      NODE_ENV:                 'production',
      PORT:                     '3001',
      DB_HOST:                  cfg.db.host,
      DB_PORT:                  String(cfg.db.port),
      DB_NAME:                  cfg.db.name,
      DB_USER:                  cfg.db.user,
      DB_PASSWORD:              cfg.db.password,
      JWT_SECRET:               cfg.jwt.secret,
      JWT_REFRESH_SECRET:       cfg.jwt.refreshSecret,
      JWT_EXPIRES_IN:           '15m',
      JWT_REFRESH_EXPIRES_IN:   '7d',
      // Allow requests from the app:// scheme the renderer uses
      ALLOWED_ORIGINS:          'app://,http://localhost:5173',
      RATE_LIMIT_WINDOW_MS:     '900000',
      RATE_LIMIT_MAX_AUTH:      '10',
    },
  });

  backendProcess.on('exit', (code) => {
    console.log(`[Main] Backend exited (code=${code})`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    console.log('[Main] Stopping backend…');
    backendProcess.kill();
    backendProcess = null;
  }
}

// ─── Main Window ──────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'MCT Business Manager',
    backgroundColor: '#0a0f1c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    autoHideMenuBar: true,
  });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
// Existing: config (API URL override)
ipcMain.handle('config:getApiUrl', () => readConfig().apiUrl || '');
ipcMain.handle('config:setApiUrl', (_e, url) => {
  const cfg = readConfig();
  cfg.apiUrl = url;
  writeConfig(cfg);
});

// File save dialog (PDF / Excel export)
ipcMain.handle('dialog:save', async (_e, options) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, options);
  return filePath;
});

// Server config — lets the frontend read/write DB credentials
ipcMain.handle('server-config:get', () => loadServerConfig());
ipcMain.handle('server-config:set', (_e, newCfg) => {
  const merged = { ...loadServerConfig(), ...newCfg };
  saveServerConfig(merged);
  // Restart backend with the new config
  stopBackend();
  setTimeout(() => startBackend(merged), 800);
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Serve frontend from resources/frontend/dist/ under app:// scheme
  if (!isDev) {
    const distRoot = path.join(process.resourcesPath, 'frontend', 'dist');
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(distRoot, safePath);
      return net.fetch(pathToFileURL(filePath).toString());
    });

    // Load & persist server config, then start the backend
    const serverCfg = loadServerConfig();
    saveServerConfig(serverCfg); // persist auto-generated JWT secrets
    startBackend(serverCfg);
  }

  // Give the backend ~1.5 s to bind its port before the UI tries to login
  setTimeout(createWindow, isDev ? 0 : 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

// Security: restrict navigation to our own scheme / dev server
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowed = [VITE_DEV_SERVER_URL, 'app://'];
    if (!allowed.some((o) => url.startsWith(o))) event.preventDefault();
  });
});
