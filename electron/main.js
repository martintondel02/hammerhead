const { app, BrowserWindow, Menu, session, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = 'io.github.martintondel02.hammerhead';
let mainWindow = null;
let connectedHost = null;
let appIndexUrl = null;

// Dev layout:  Hammerhead/electron/main.js   -> ../src/index.html
// Flatpak:     resources/app/main.js         -> ./src/index.html
const ADJACENT_SRC = path.join(__dirname, 'src');
const PARENT_SRC = path.join(__dirname, '..', 'src');
const SRC_DIR = fs.existsSync(ADJACENT_SRC)
  ? ADJACENT_SRC
  : PARENT_SRC;
const ICON = (() => {
  const devIcon = path.join(__dirname, '..', 'src-tauri', 'icons', '128x128.png');
  try {
    if (fs.existsSync(devIcon)) return devIcon;
  } catch { /* ignore */ }
  return null;
})();

function serversPath() {
  return path.join(app.getPath('userData'), 'servers.json');
}

function readServers() {
  try {
    return JSON.parse(fs.readFileSync(serversPath(), 'utf8'));
  } catch {
    return [];
  }
}

function writeServers(servers) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(serversPath(), JSON.stringify(servers, null, 2));
}

function normalizeUrl(input) {
  const trimmed = String(input || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Enter a server address');
  let scheme;
  let hostPart;
  if (trimmed.startsWith('http://')) {
    scheme = 'http';
    hostPart = trimmed.slice('http://'.length);
  } else if (trimmed.startsWith('https://')) {
    scheme = 'https';
    hostPart = trimmed.slice('https://'.length);
  } else {
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(trimmed) ||
      trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1') ||
      trimmed.startsWith('[::1]') || trimmed.endsWith('.local');
    scheme = isLocal ? 'http' : 'https';
    hostPart = trimmed;
  }
  let url;
  try {
    url = new URL(`${scheme}://${hostPart}`);
  } catch {
    throw new Error('Invalid server address');
  }
  return url.origin;
}

function createWindow() {
  const previous = global.windowState || { width: 1280, height: 800 };
  mainWindow = new BrowserWindow({
    width: previous.width || 1280,
    height: previous.height || 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Hammerhead',
    ...(ICON ? { icon: ICON } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  appIndexUrl = mainWindow.webContents.getURL().length ? mainWindow.webContents.getURL() : null;
  mainWindow.loadFile(path.join(SRC_DIR, 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-navigate', (_event, url) => {
    const parsed = new URL(url);
    connectedHost = parsed.protocol === 'file:' ? null : parsed.host;
    if (parsed.protocol === 'file:') {
      mainWindow.setTitle('Hammerhead');
    } else {
      mainWindow.setTitle(`Hammerhead — ${parsed.host}`);
    }
  });

  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const [width, height] = mainWindow.getSize();
      fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'),
        JSON.stringify({ width, height }));
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function showPicker() {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(SRC_DIR, 'index.html'));
}

function dumpDiagnostics() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(
    'window.__hammerheadDiagnostics ? window.__hammerheadDiagnostics() : "diagnostics script not present"'
  ).then((content) => {
    const downloads = app.getPath('downloads') || app.getPath('home');
    const out = path.join(downloads, 'hammerhead-diagnostics.log');
    fs.writeFileSync(out, content);
    console.log(`--- hammerhead diagnostics (${content.length} bytes) -> ${out} ---`);
    mainWindow.webContents.executeJavaScript(
      `console.warn('Hammerhead: diagnostics (${content.length} bytes) written to ${out}')`
    );
  }).catch((err) => console.error('diagnostics failed:', err));
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Hammerhead',
      submenu: [
        { label: 'Server picker', accelerator: 'CmdOrCtrl+Shift+H', click: showPicker },
        { label: 'Reload page', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Save diagnostics log', accelerator: 'CmdOrCtrl+Shift+D', click: dumpDiagnostics },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer tools' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('servers:list', () => readServers());
ipcMain.handle('servers:add', (_e, name, url) => {
  const normalized = normalizeUrl(url);
  const servers = readServers();
  const id = servers.length ? Math.max(...servers.map((s) => s.id)) + 1 : 1;
  servers.push({ id, name: String(name).trim(), url: normalized });
  writeServers(servers);
  return servers;
});
ipcMain.handle('servers:remove', (_e, id) => {
  const servers = readServers().filter((s) => s.id !== id);
  writeServers(servers);
  return servers;
});
ipcMain.handle('servers:normalize', (_e, url) => normalizeUrl(url));
ipcMain.handle('server:connect', (_e, url) => {
  const normalized = normalizeUrl(url);
  if (!mainWindow) return;
  mainWindow.loadURL(normalized).catch((err) => {
    dialog.showErrorBox('Connection failed',
      `Could not load ${normalized}:\n\n${err.message}`);
  });
});
ipcMain.on('open-external', (_e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('diagnostics:get', () => {
  if (!mainWindow) return 'no window';
  return mainWindow.webContents.executeJavaScript(
    'window.__hammerheadDiagnostics ? window.__hammerheadDiagnostics() : "diagnostics script not present"'
  ).catch((err) => `diagnostics error: ${err}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Grant media permissions for all servers (voice channels need mic/cam)
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const isMedia = ['media', 'audio', 'video'].includes(permission);
      const isNotification = permission === 'notifications';
      callback(isMedia || isNotification);
    });

    try {
      global.windowState = JSON.parse(
        fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8')
      );
    } catch { global.windowState = null; }

    createWindow();
    buildMenu();
  });

  app.on('window-all-closed', () => app.quit());
}