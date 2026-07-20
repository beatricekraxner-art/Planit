const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;
let tray = null;
const PORT = 9014;
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

function isPortInUse(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.once('error', () => resolve(true));
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

async function killProcessOnPort(port) {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
        exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
            if (error || !stdout) { resolve(false); return; }
            const lines = stdout.trim().split('\n');
            const pids = new Set();
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && !isNaN(pid)) pids.add(pid);
            });
            if (pids.size === 0) { resolve(false); return; }
            pids.forEach(pid => {
                try { process.kill(parseInt(pid), 'SIGTERM'); } catch (e) {}
            });
            setTimeout(resolve, 500);
        });
    });
}

async function startServer() {
    if (serverProcess) {
        try { serverProcess.kill('SIGTERM'); } catch (e) {}
        serverProcess = null;
    }

    const inUse = await isPortInUse(PORT);
    if (inUse) {
        console.log(`Port ${PORT} in use, killing existing processes...`);
        await killProcessOnPort(PORT);
        await new Promise(r => setTimeout(r, 1000));
    }

    const serverScript = path.join(__dirname, 'start.ps1');
    const dataDir = app.getPath('userData');
    serverProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', serverScript,
        '-DataDir', dataDir
    ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
        console.log('Server stdout:', data.toString().trim());
    });

    serverProcess.stderr.on('data', (data) => {
        console.error('Server stderr:', data.toString().trim());
    });

    serverProcess.on('exit', (code) => {
        console.log('Server exited with code', code);
        serverProcess = null;
    });

    serverProcess.on('error', (err) => {
        console.error('Server spawn error:', err);
    });
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
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('App loaded successfully');
    });

    mainWindow.once('ready-to-show', () => {
        if (state.maximized) {
            mainWindow.maximize();
        }
        mainWindow.show();
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
                        if (mainWindow) mainWindow.webContents.executeJavaScript('window.syncNow && window.syncNow()');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Drucken',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.executeJavaScript('window.print()');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Beenden',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
                    click: () => {
                        if (serverProcess) {
                            try { serverProcess.kill('SIGTERM'); } catch (e) {}
                        }
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Bearbeiten',
            submenu: [
                { role: 'undo', label: 'Rückgängig' },
                { role: 'redo', label: 'Wiederholen' },
                { type: 'separator' },
                { role: 'cut', label: 'Ausschneiden' },
                { role: 'copy', label: 'Kopieren' },
                { role: 'paste', label: 'Einfügen' },
                { role: 'selectall', label: 'Alles auswählen' }
            ]
        },
        {
            label: 'Ansicht',
            submenu: [
                {
                    label: 'Neu laden',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => { if (mainWindow) mainWindow.webContents.reload(); }
                },
                {
                    label: 'Entwicklertools',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
                    click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); }
                },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Vollbild' },
                { role: 'resetZoom', label: 'Zoom zurücksetzen' },
                { role: 'zoomIn', label: 'Vergrößern' },
                { role: 'zoomOut', label: 'Verkleinern' }
            ]
        },
        {
            label: 'Hilfe',
            submenu: [
                {
                    label: 'Plan-it Dokumentation',
                    click: async () => {
                        await shell.openExternal('https://github.com/beatr/Antigravity_Versuch');
                    }
                }
            ]
        }
    ];

    if (process.platform === 'darwin') {
        template.unshift({
            label: app.name,
            submenu: [
                { role: 'about', label: 'Über Plan-it' },
                { type: 'separator' },
                { role: 'services', label: 'Dienste' },
                { type: 'separator' },
                { role: 'hide', label: 'Plan-it ausblenden' },
                { role: 'hideothers', label: 'Andere ausblenden' },
                { role: 'unhide', label: 'Alle einblenden' },
                { type: 'separator' },
                { role: 'quit', label: 'Beenden' }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    if (!fs.existsSync(iconPath)) return;

    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Plan-it anzeigen',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Beenden',
            click: () => {
                if (serverProcess) {
                    try { serverProcess.kill('SIGTERM'); } catch (e) {}
                }
                if (tray) { tray.destroy(); tray = null; }
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Plan-it');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        await startServer();
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
            if (serverProcess) {
                try { serverProcess.kill('SIGTERM'); } catch (e) {}
            }
            app.quit();
        }
    });

    app.on('before-quit', () => {
        if (serverProcess) {
            try { serverProcess.kill('SIGTERM'); } catch (e) {}
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
}
