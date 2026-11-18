/* eslint-env node */
// Electron main process for the desktop (cross-platform) build.
// Boots the same Express API on a random local port, then loads the built UI.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let apiServer = null;

function waitForPort(server, port) {
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health' }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => setTimeout(probe, 200));
      req.setTimeout(500);
    };
    server.once('listening', probe);
    server.once('error', reject);
    setTimeout(() => reject(new Error('API did not start in time')), 10000);
  });
}

async function startApi() {
  // dynamic import of ESM module from CJS
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.js')).href);
  const { app: expressApp } = mod.createApp();
  const server = expressApp.listen(0, '127.0.0.1');
  await waitForPort(server, server.address().port);
  apiServer = server;
  return server.address().port;
}

function pathToFileURL(p) {
  return require('url').pathToFileURL(p);
}

async function createWindow() {
  const port = await startApi();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PG Viewer',
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev you can point VITE_DEV_SERVER_URL to the vite dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(`${devUrl}/?apiBase=http://127.0.0.1:${port}`);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: { apiBase: `http://127.0.0.1:${port}` },
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  try {
    if (apiServer) apiServer.close();
  } catch {
    /* ignore */
  }
});
