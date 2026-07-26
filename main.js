const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let localServer = null;
const PORT = 9014;

async function ensureServer() {
    if (localServer) return;
    const serverModule = require(path.join(__dirname, 'server.js'));
    localServer = serverModule.server;
    await serverModule.start();
}
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        if (fs.existsSync(WINDOW_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf8'));
        }
    } catch (e) { console.error('Failed to load window state:', e); }
    return { width: 1280, height: 900, x: undefined, y: undefined, maximized: false };
}

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getBounds();
        const state = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            maximized: mainWindow.isMaximized()
        };
        fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state), 'utf8');
    } catch (e) { console.error('Failed to save window state:', e); }
}

function createWindow() {
    const state = loadWindowState();
    mainWindow = new BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        minWidth: 800,
        minHeight: 600,
        title: 'Plan-it',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true
        },
        show: true
    });

    mainWindow.loadURL('http://localhost:' + PORT + '/');

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('App loaded successfully');
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', errorCode, errorDescription, validatedURL);
    });

    mainWindow.once('ready-to-show', () => {
        if (state.maximized) {
            mainWindow.maximize();
        }
        mainWindow.show();
        console.log('Window ready-to-show');
    });

    mainWindow.on('close', () => {
        saveWindowState();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function buildMenu() {
    const template = [
        {
            label: 'Datei',
            submenu: [
                {
                    label: 'Speichern',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.executeJavaScript('window.manualSave && window.manualSave()');
                    }
                },
                {
                    label: 'Synchronisieren',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.executeJavaScript('window.OD && window.OD.sync && window.OD.sync()');
                    }
                },
                { type: 'separator' },
                { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
            ]
        },
        {
            label: 'Bearbeiten',
            submenu: [
                { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
                { type: 'separator' },
                { label: 'Ausschneiden', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Kopieren', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Einfügen', accelerator: 'CmdOrCtrl+V', role: 'paste' }
            ]
        },
        {
            label: 'Ansicht',
            submenu: [
                { label: 'Neu laden', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { label: 'Developer Tools', accelerator: 'F12', role: 'toggleDevTools' }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Öffnen', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
        { label: 'Beenden', click: () => { app.quit(); } }
    ]);
    tray.setToolTip('Plan-it');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
}

app.whenReady().then(async () => {
    await ensureServer();
    createWindow();
    buildMenu();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (localServer) {
            try { localServer.close(); } catch (e) {}
        }
        app.quit();
    }
});

app.on('before-quit', () => {
    if (localServer) {
        try { localServer.close(); } catch (e) {}
    }
    if (tray) { tray.destroy(); tray = null; }
});

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('app-platform', () => process.platform);
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));
ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});
ipcMain.handle('dialog:openFile', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
});
ipcMain.handle('show-notification', async (event, options) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
        const notification = new Notification(options);
        notification.show();
        return true;
    }
    return false;
});
