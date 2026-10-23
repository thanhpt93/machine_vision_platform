import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#020617', // slate-950
    title: 'Machine Vision Platform',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Open external links in default browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Electron] Page failed to load: ${errorCode} (${errorDescription}) at ${validatedURL}`);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const prodFilePath = path.join(__dirname, '../renderer/index.html');

  if (isDev) {
    mainWindow.loadURL(devUrl).catch((err) => {
      console.warn(`[Electron] Could not connect to dev server (${devUrl}), loading local built file...`, err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(prodFilePath).catch(() => {});
      }
    });
  } else {
    mainWindow.loadFile(prodFilePath).catch((err) => {
      console.warn('[Electron] Could not load local production file, attempting dev server:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(devUrl).catch(() => {});
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.TEST_EXIT === 'true') {
    console.log('Electron smoke test: Application initialized successfully');
    setTimeout(() => {
      app.quit();
    }, 1500);
  }
}

// IPC Handlers
ipcMain.handle('app:get-info', () => {
  return {
    appName: 'Machine Vision Platform',
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
