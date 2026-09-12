const bridge = window.hammerhead
  ? window.hammerhead
  : {
      listServers: () => window.__TAURI__.core.invoke('list_servers'),
      addServer: (name, url) => window.__TAURI__.core.invoke('add_server', { name, url }),
      removeServer: (id) => window.__TAURI__.core.invoke('remove_server', { id }),
      connectServer: (url) => window.__TAURI__.core.invoke('connect_server', { url }),
      openExternal: (url) => window.__TAURI__.opener.openUrl(url),
    };
const listEl = document.getElementById('server-list');
const emptyEl = document.getElementById('empty-state');
const form = document.getElementById('add-form');
const nameInput = document.getElementById('server-name');
const urlInput = document.getElementById('server-url');
const addBtn = document.getElementById('add-btn');
const errorEl = document.getElementById('form-error');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function renderRow(server) {
  const li = document.createElement('li');
  li.className = 'server-row';

  const avatar = document.createElement('div');
  avatar.className = 'server-avatar';
  avatar.textContent = initials(server.name || server.url) || 'S';

  const info = document.createElement('div');
  info.className = 'server-info';

  const name = document.createElement('div');
  name.className = 'server-name';
  name.textContent = server.name || server.url;

  const url = document.createElement('div');
  url.className = 'server-url';
  url.textContent = server.url;

  info.append(name, url);

  const remove = document.createElement('button');
  remove.className = 'danger';
  remove.textContent = 'Remove';
  remove.addEventListener('click', async () => {
    await bridge.removeServer(server.id);
    await refresh();
  });

  const connect = document.createElement('button');
  connect.className = 'connect-btn';
  connect.textContent = 'Connect';
  connect.addEventListener('click', async () => {
    await bridge.connectServer(server.url);
  });

  li.append(avatar, info, remove, connect);
  return li;
}

async function refresh() {
  const servers = await bridge.listServers();
  listEl.replaceChildren(...servers.map(renderRow));
  emptyEl.hidden = servers.length > 0;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  addBtn.disabled = true;
  try {
    await bridge.addServer(nameInput.value.trim() || urlInput.value.trim(), urlInput.value.trim());
    nameInput.value = '';
    urlInput.value = '';
    await refresh();
  } catch (err) {
    showError(String(err));
  } finally {
    addBtn.disabled = false;
  }
});

document.addEventListener('click', (event) => {
  const external = event.target.closest('[data-external]');
  if (external) {
    event.preventDefault();
    bridge.openExternal(external.dataset.external);
  }
});

refresh();