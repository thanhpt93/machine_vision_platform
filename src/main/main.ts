import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { getEditionMetadata, isProductionEdition } from '../shared/editionConfig';
import { RuntimeProcessManager } from './runtimeManager';

let mainWindow: BrowserWindow | null = null;

const editionMeta = getEditionMetadata();
const isProdEdition = isProductionEdition();
const isDevServer = process.env.NODE_ENV === 'development' && !isProdEdition;

// Set distinct Windows Application User Model ID & Product Name so Developer and Production
// Editions do not collide in taskbar, shortcuts, or %APPDATA% userData directories.
app.setName(editionMeta.productName);
if (process.platform === 'win32') {
  app.setAppUserModelId(editionMeta.appId);
}

// Enforce single instance per Edition (Developer and Production can run independently,
// but launching a second instance of Production Edition focuses the existing Production window).
const gotSingleInstanceLock = app.requestSingleInstanceLock({
  edition: editionMeta.deploymentMode,
});

if (!gotSingleInstanceLock && process.env.TEST_EXIT !== 'true') {
  app.quit();
}

const runtimeManager = new RuntimeProcessManager(editionMeta.deploymentMode);

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  // Production Edition menu: No Pipeline Editor actions (New/Open/Save Pipeline) and no DevTools
  if (isProdEdition) {
    const prodTemplate: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Select Input Image...',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              mainWindow?.webContents.send('menu:action', 'select-image');
            },
          },
          {
            label: 'Import License File...',
            click: () => {
              mainWindow?.webContents.send('menu:action', 'import-license');
            },
          },
          { type: 'separator' },
          isMac ? { role: 'close' } : { role: 'quit' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
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
            label: 'Open Logs Directory',
            click: () => {
              shell.openPath(runtimeManager.getLogsDir());
            },
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(prodTemplate));
    return;
  }

  // Developer Edition menu
  const devTemplate: Electron.MenuItemConstructorOptions[] = [
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
        {
          label: 'Import License File...',
          click: () => {
            mainWindow?.webContents.send('menu:action', 'import-license');
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
          label: 'Open Logs Directory',
          click: () => {
            shell.openPath(runtimeManager.getLogsDir());
          },
        },
        {
          label: 'Machine Vision Platform Documentation',
          click: () => {
            shell.openExternal('https://github.com');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(devTemplate);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#020617', // slate-950
    title: editionMeta.editionName,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !isProdEdition,
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
    const msg = `Page failed to load: ${errorCode} (${errorDescription}) at ${validatedURL}`;
    console.warn(`[Electron] ${msg}`);
    runtimeManager.logMainEvent(`WARN: ${msg}`);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const prodFilePath = path.join(__dirname, '../renderer/index.html');

  if (isDevServer) {
    mainWindow.loadURL(devUrl).catch((err) => {
      console.warn(
        `[Electron] Could not connect to dev server (${devUrl}), loading local built file...`,
        err
      );
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(prodFilePath).catch(() => {});
      }
    });
  } else {
    mainWindow.loadFile(prodFilePath).catch((err) => {
      console.warn('[Electron] Could not load local production file:', err);
      runtimeManager.logMainEvent(`ERROR loading renderer index.html: ${String(err)}`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.TEST_EXIT === 'true') {
    console.log(
      `Electron smoke test: ${editionMeta.editionName} (${editionMeta.deploymentMode}) initialized successfully`
    );
    setTimeout(() => {
      app.quit();
    }, 1500);
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

ipcMain.handle('app:get-info', () => {
  return {
    appName: editionMeta.editionName,
    version: app.getVersion(),
    deploymentMode: editionMeta.deploymentMode,
    editionName: editionMeta.editionName,
    appId: editionMeta.appId,
    isPackaged: app.isPackaged,
    userDataDir: app.getPath('userData'),
    runtimeDataDir: runtimeManager.getWritableDataDir(),
    logsDir: runtimeManager.getLogsDir(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  };
});

ipcMain.handle('runtime:get-state', () => {
  return runtimeManager.getState();
});

ipcMain.handle('runtime:restart', async () => {
  return runtimeManager.restartRuntime();
});

// Developer-Only IPC Handlers: NEVER registered in Production Edition
if (!isProdEdition) {
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
}

// Production & Developer Shared Image Selection Dialog Handler
ipcMain.handle('dialog:select-image', async () => {
  if (!mainWindow) return { success: false, error: 'No main window' };

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Vision Inspection Image',
      filters: [
        {
          name: 'Supported Images (*.png; *.jpg; *.jpeg; *.bmp)',
          extensions: ['png', 'jpg', 'jpeg', 'bmp'],
        },
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

// Production & Developer Shared License Selection Dialog Handler
ipcMain.handle('dialog:select-license', async () => {
  if (!mainWindow) return { success: false, error: 'No main window' };

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import NOVA License Artifact',
      filters: [
        {
          name: 'NOVA License Artifacts (*.novalic.json; *.lic; *.json)',
          extensions: ['json', 'lic'],
        },
        { name: 'NOVA Signed License (*.novalic.json)', extensions: ['json'] },
        { name: 'Standard License (*.lic)', extensions: ['lic'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const filePath = filePaths[0];
    const stat = await fs.stat(filePath);
    if (stat.size > 1024 * 1024) {
      return {
        success: false,
        error: 'License file exceeds maximum allowed size of 1 MB.',
      };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, filePath, content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
});

// ============================================================================
// App Lifecycle & Managed Runtime Startup / Shutdown
// ============================================================================

app.whenReady().then(async () => {
  runtimeManager.logMainEvent(
    `Application starting: ${editionMeta.editionName} v${app.getVersion()} (packaged=${app.isPackaged})`
  );

  setupApplicationMenu();
  createWindow();

  // Start or attach to the Python FastAPI Runtime asynchronously so the window opens immediately
  // while the UI displays live runtime connection status.
  runtimeManager.ensureStarted().catch((err) => {
    runtimeManager.logMainEvent(`Unhandled error in ensureStarted: ${String(err)}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  runtimeManager.stopOwnedRuntime().catch(() => {});
});

app.on('window-all-closed', async () => {
  await runtimeManager.stopOwnedRuntime().catch(() => {});
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
