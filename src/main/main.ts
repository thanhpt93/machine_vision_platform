import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Pipeline',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu:action', 'new');
          },
        },
        {
          label: 'Open Pipeline...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu:action', 'open');
          },
        },
        { type: 'separator' },
        {
          label: 'Save Pipeline',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('menu:action', 'save');
          },
        },
        {
          label: 'Save Pipeline As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow?.webContents.send('menu:action', 'save-as');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Machine Vision Platform Documentation',
          click: () => {
            shell.openExternal('https://github.com');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
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

// Controlled File Dialog Handlers (no direct unrestricted fs access in Renderer)
ipcMain.handle(
  'pipeline:save-file',
  async (
    _event,
    {
      defaultName,
      content,
      targetPath,
    }: { defaultName?: string; content: string; targetPath?: string }
  ) => {
    if (!mainWindow) return { success: false, error: 'No main window' };

    try {
      let finalPath = targetPath;

      // If no targetPath provided, open the Save dialog
      if (!finalPath) {
        let proposedName = defaultName || 'vision_pipeline.mvp';
        if (!path.extname(proposedName)) {
          proposedName = `${proposedName}.mvp`;
        }

        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Pipeline (.mvp)',
          defaultPath: proposedName,
          filters: [
            { name: 'Machine Vision Pipeline (*.mvp)', extensions: ['mvp'] },
            { name: 'Legacy Pipeline JSON (*.json)', extensions: ['json'] },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ],
        });

        if (canceled || !filePath) {
          return { success: false, canceled: true };
        }

        finalPath = filePath;
      }

      // Automatically append .mvp extension if user typed a name without extension
      if (!path.extname(finalPath)) {
        finalPath = `${finalPath}.mvp`;
      }

      await fs.writeFile(finalPath, content, 'utf-8');
      return { success: true, filePath: finalPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
);

ipcMain.handle('pipeline:open-file', async () => {
  if (!mainWindow) return { success: false, error: 'No main window' };

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Pipeline (.mvp / .json)',
      filters: [
        { name: 'Machine Vision Pipeline (*.mvp; *.json)', extensions: ['mvp', 'json'] },
        { name: 'Machine Vision Pipeline (*.mvp)', extensions: ['mvp'] },
        { name: 'Legacy Pipeline JSON (*.json)', extensions: ['json'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const filePath = filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, filePath, content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
});

ipcMain.handle('dialog:select-image', async () => {
  if (!mainWindow) return { success: false, error: 'No main window' };

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Vision Inspection Image',
      filters: [
        { name: 'Supported Images (*.png; *.jpg; *.jpeg; *.bmp)', extensions: ['png', 'jpg', 'jpeg', 'bmp'] },
        { name: 'PNG Images (*.png)', extensions: ['png'] },
        { name: 'JPEG Images (*.jpg; *.jpeg)', extensions: ['jpg', 'jpeg'] },
        { name: 'BMP Images (*.bmp)', extensions: ['bmp'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: filePaths[0] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
});

app.whenReady().then(() => {
  setupApplicationMenu();
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
