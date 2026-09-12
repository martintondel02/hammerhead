const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('hammerhead', {
  listServers: () => ipcRenderer.invoke('servers:list'),
  addServer: (name, url) => ipcRenderer.invoke('servers:add', name, url),
  removeServer: (id) => ipcRenderer.invoke('servers:remove', id),
  normalizeUrl: (url) => ipcRenderer.invoke('servers:normalize', url),
  connectServer: (url) => ipcRenderer.invoke('server:connect', url),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  diagnostics: () => ipcRenderer.invoke('diagnostics:get'),
});

// Inject the same diagnostics hook the Tauri shell uses, so
// Ctrl+Shift+D works on server pages too. Runs before page scripts.
try {
  const diag = fs.readFileSync(path.join(__dirname, '..', 'src', 'diagnostics.js'), 'utf8');
  eval(diag);
} catch (err) {
  console.warn('Hammerhead: could not load diagnostics hook:', err);
}