const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let localServer = null;
let backupTimer = null;
const PORT = 9014;
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const PDF_BACKUP_INTERVAL = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
let pdfBackupTimer = null;

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

function createBackup() {
    if (!mainWindow) return;
    mainWindow.webContents.executeJavaScript('DB.exportAll()').then(json => {
        try {
            ensureBackupDir();
            const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const fileName = `planit-auto-backup-${stamp}.json`;
            const filePath = path.join(BACKUP_DIR, fileName);
            fs.writeFileSync(filePath, json, 'utf8');
            console.log('Auto backup created:', filePath);
            // Keep only last 10 backups
            const files = fs.readdirSync(BACKUP_DIR)
                .filter(f => f.startsWith('planit-auto-backup-') && f.endsWith('.json'))
                .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time);
            if (files.length > 10) {
                files.slice(10).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f.name)));
            }
        } catch (e) {
            console.error('Auto backup failed:', e);
        }
    }).catch(e => console.error('Auto backup export failed:', e));
}

function scheduleWeeklyBackup() {
    if (backupTimer) clearTimeout(backupTimer);
    // Check on startup if backup is needed
    try {
        ensureBackupDir();
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('planit-auto-backup-') && f.endsWith('.json'));
        let needsBackup = files.length === 0;
        if (!needsBackup) {
            const latest = files
                .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time)[0];
            needsBackup = (Date.now() - latest.time) > BACKUP_INTERVAL;
        }
        if (needsBackup) {
            setTimeout(createBackup, 5000); // Wait 5s after startup
        }
    } catch (e) {
        console.error('Backup check failed:', e);
    }
    // Schedule next check
    backupTimer = setInterval(() => {
        createBackup();
    }, BACKUP_INTERVAL);
}

function createPdfBackup() {
    if (!mainWindow) return;
    mainWindow.webContents.executeJavaScript('generateFullPdfHtml ? generateFullPdfHtml() : (window.DB && DB.exportAll ? DB.exportAll() : "{}")').then(result => {
        try {
            ensureBackupDir();
            const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const fileName = `planit-auto-backup-${stamp}.pdf`;
            const filePath = path.join(BACKUP_DIR, fileName);
            
            // If result is JSON string (fallback), create HTML from it
            let html = result;
            if (typeof result === 'string' && result.startsWith('{')) {
                try {
                    const data = JSON.parse(result);
                    html = generatePdfHtmlFromData(data);
                } catch (e) {
                    html = '<html><body><pre>' + result + '</pre></body></html>';
                }
            }
            
            generateAndSavePdf(html, filePath).then(() => {
                console.log('Auto PDF backup created:', filePath);
                // Keep only last 5 PDF backups
                const files = fs.readdirSync(BACKUP_DIR)
                    .filter(f => f.startsWith('planit-auto-backup-') && f.endsWith('.pdf'))
                    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
                    .sort((a, b) => b.time - a.time);
                if (files.length > 5) {
                    files.slice(5).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f.name)));
                }
            }).catch(e => console.error('Auto PDF backup failed:', e));
        } catch (e) {
            console.error('Auto PDF backup prepare failed:', e);
        }
    }).catch(e => console.error('Auto PDF backup export failed:', e));
}

function generatePdfHtmlFromData(data) {
    const now = new Date().toLocaleString('de-DE');
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Plan-it Backup ${now}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; color: #111; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        h3 { color: #2c3e50; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f8f9fa; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        .section { page-break-inside: avoid; margin-bottom: 30px; }
        .meta { color: #7f8c8d; font-size: 12px; margin-bottom: 20px; }
    </style></head><body>`;
    html += `<h1>Plan-it Vollständiges Backup</h1>`;
    html += `<div class="meta">Erstellt: ${now} | App-Version: ${app.getVersion()}</div>`;
    
    // Classes
    if (data.classes && data.classes.length) {
        html += `<div class="section"><h2>Klassen (${data.classes.length})</h2><table><thead><tr><th>ID</th><th>Name</th><th>Fach</th><th>Typ</th><th>PlanMode</th><th>Farbe</th></tr></thead><tbody>`;
        data.classes.forEach(c => {
            html += `<tr><td>${c.id}</td><td>${escapeHtml(c.name || '')}</td><td>${escapeHtml(c.subject || '')}</td><td>${escapeHtml(c.type || '')}</td><td>${escapeHtml(c.planMode || '')}</td><td>${escapeHtml(c.color || '')}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // Timetable
    if (data.timetable && data.timetable.length) {
        html += `<div class="section"><h2>Stundenplan (${data.timetable.length} Einträge)</h2><table><thead><tr><th>ID</th><th>Klasse</th><th>Fach</th><th>Tag</th><th>Start</th><th>Ende</th><th>Raum</th></tr></thead><tbody>`;
        data.timetable.forEach(t => {
            html += `<tr><td>${t.id}</td><td>${escapeHtml(t.classId || '')}</td><td>${escapeHtml(t.subject || '')}</td><td>${escapeHtml(t.day || '')}</td><td>${escapeHtml(t.start || '')}</td><td>${escapeHtml(t.end || '')}</td><td>${escapeHtml(t.room || '')}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // Grades overview - iterate through each class's grades
    if (data.grades) {
        html += `<div class="section"><h2>Noten</h2>`;
        Object.keys(data.grades).forEach(classId => {
            const grades = data.grades[classId];
            if (grades && grades.length) {
                html += `<h3>Klasse ${escapeHtml(classId)} (${grades.length} Einträge)</h3><table><thead><tr><th>Schüler</th><th>Typ</th><th>Note</th><th>Datum</th><th>Gewichtung</th><th>Thema</th></tr></thead><tbody>`;
                grades.forEach(g => {
                    html += `<tr><td>${escapeHtml(g.studentName || g.studentId || '')}</td><td>${escapeHtml(g.type || '')}</td><td>${escapeHtml(g.grade || '')}</td><td>${escapeHtml(g.date || '')}</td><td>${escapeHtml(g.weight || '')}</td><td>${escapeHtml(g.topic || '')}</td></tr>`;
                });
                html += `</tbody></table>`;
            }
        });
        html += `</div>`;
    }
    
    // Homework
    if (data.homework) {
        html += `<div class="section"><h2>Hausübungen</h2>`;
        Object.keys(data.homework).forEach(classId => {
            const hw = data.homework[classId];
            if (hw && hw.length) {
                html += `<h3>Klasse ${escapeHtml(classId)} (${hw.length} Einträge)</h3><table><thead><tr><th>Nr</th><th>Datum</th><th>Titel</th><th>Inhalt</th></tr></thead><tbody>`;
                hw.forEach(h => {
                    html += `<tr><td>${escapeHtml(h.nr || '')}</td><td>${escapeHtml(h.date || '')}</td><td>${escapeHtml(h.title || '')}</td><td>${escapeHtml(h.content || '')}</td></tr>`;
                });
                html += `</tbody></table>`;
            }
        });
        html += `</div>`;
    }
    
    // Todos
    if (data.todos && data.todos.length) {
        html += `<div class="section"><h2>To-Dos (${data.todos.length})</h2><table><thead><tr><th>ID</th><th>Titel</th><th>Erledigt</th><th>Priorität</th><th>Fällig</th></tr></thead><tbody>`;
        data.todos.forEach(t => {
            html += `<tr><td>${t.id}</td><td>${escapeHtml(t.title || '')}</td><td>${t.done ? 'Ja' : 'Nein'}</td><td>${escapeHtml(t.priority || '')}</td><td>${escapeHtml(t.due || '')}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // Events
    if (data.events && data.events.length) {
        html += `<div class="section"><h2>Termine (${data.events.length})</h2><table><thead><tr><th>ID</th><th>Titel</th><th>Von</th><th>Bis</th><th>Klasse</th></tr></thead><tbody>`;
        data.events.forEach(e => {
            html += `<tr><td>${e.id}</td><td>${escapeHtml(e.title || '')}</td><td>${escapeHtml(e.from || '')}</td><td>${escapeHtml(e.to || '')}</td><td>${escapeHtml(e.classId || '')}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // Sprechstunden
    if (data.sprechstunden && data.sprechstunden.length) {
        html += `<div class="section"><h2>Sprechstunden (${data.sprechstunden.length})</h2><table><thead><tr><th>ID</th><th>Tag</th><th>Zeit</th><th>Raum</th><th>Lehrer</th></tr></thead><tbody>`;
        data.sprechstunden.forEach(s => {
            html += `<tr><td>${s.id}</td><td>${escapeHtml(s.day || '')}</td><td>${escapeHtml(s.time || '')}</td><td>${escapeHtml(s.room || '')}</td><td>${escapeHtml(s.teacher || '')}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    // Holidays
    if (data.holidays && data.holidays.length) {
        html += `<div class="section"><h2>Ferien (${data.holidays.length})</h2><table><thead><tr><th>Datum</th><th>Name</th></tr></thead><tbody>`;
        data.holidays.forEach(h => {
            html += `<tr><td>${escapeHtml(h.date || '')}</td><td>${escapeHtml(h.name || '')}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    
    html += `</body></html>`;
    return html;
    
function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '&apos;');
    }
}

function schedulePdfBackup() {
    if (pdfBackupTimer) clearTimeout(pdfBackupTimer);
    // Check on startup if PDF backup is needed
    try {
        ensureBackupDir();
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('planit-auto-backup-') && f.endsWith('.pdf'));
        let needsBackup = files.length === 0;
        if (!needsBackup) {
            const latest = files
                .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time)[0];
            needsBackup = (Date.now() - latest.time) > PDF_BACKUP_INTERVAL;
        }
        if (needsBackup) {
            setTimeout(createPdfBackup, 10000); // Wait 10s after startup
        }
    } catch (e) {
        console.error('PDF backup check failed:', e);
    }
    // Schedule next check
    pdfBackupTimer = setInterval(() => {
        createPdfBackup();
    }, PDF_BACKUP_INTERVAL);
}

async function ensureServer() {
    if (localServer) return;
    const serverModule = require(path.join(__dirname, 'server.js'));
    localServer = serverModule.server;
    await serverModule.start();
}
const WINDOW_STATE_FILE = null;

function loadWindowState() {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    try {
        if (fs.existsSync(stateFile)) {
            return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        }
    } catch (e) { console.error('Failed to load window state:', e); }
    return { width: 1280, height: 900, x: undefined, y: undefined, maximized: false };
}

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const stateFile = path.join(app.getPath('userData'), 'window-state.json');
        const bounds = mainWindow.getBounds();
        const state = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            maximized: mainWindow.isMaximized()
        };
        fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
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
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.executeJavaScript(
                "if (window.switchView) window.switchView('dashboard');"
            );
        }
    });
}

app.whenReady().then(async () => {
    await ensureServer();
    createWindow();
    buildMenu();
    createTray();
    scheduleWeeklyBackup();
    schedulePdfBackup();

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

app.on('before-quit', async () => {
    if (mainWindow) {
        try {
            await mainWindow.webContents.executeJavaScript('window.FilePersist && window.FilePersist.saveToFile ? FilePersist.saveToFile() : Promise.resolve()');
        } catch (e) {}
    }
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
ipcMain.handle('dialog:selectDirectory', async (event, options) => {
    console.log('selectDirectory called, options:', options);
    if (mainWindow) mainWindow.focus();
    const result = await dialog.showOpenDialog(mainWindow, { ...options, properties: ['openDirectory'] });
    console.log('selectDirectory result:', result);
    return result;
});
ipcMain.handle('save-pdf-single', async (event, { html, defaultFilename }) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0];
    if (win) win.focus();
    try {
        const result = dialog.showSaveDialogSync(win || undefined, {
            defaultPath: defaultFilename,
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
            title: 'PDF speichern'
        });
        console.log('save-pdf-single: sync result:', result);
        if (!result) return { canceled: true };
        return await generateAndSavePdf(html, result.filePath || result);
    } catch (e) {
        console.log('save-pdf-single: sync error:', e.message);
        return { canceled: true };
    }
});
ipcMain.handle('save-pdf-direct', async (event, { html, directory, filename }) => {
    const path = require('path');
    const filePath = path.join(directory, filename);
    console.log('save-pdf-direct: saving to', filePath);
    return await generateAndSavePdf(html, filePath);
});
ipcMain.handle('save-pdf-batch', async (event, { items, directory }) => {
    console.log('save-pdf-batch: directory:', directory, 'items:', items.length);
    const win = BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0];
    if (win) win.focus();
    const path = require('path');
    let saved = 0;
    let failed = 0;
    for (const item of items) {
        try {
            const filePath = path.join(directory, item.filename);
            await generateAndSavePdf(item.html, filePath);
            saved++;
        } catch (e) {
            console.error('save-pdf-batch item error:', e);
            failed++;
        }
    }
    return { saved, failed };
});
ipcMain.handle('export-pdf', async (event, { html, classId, name }) => {
    const path = require('path');
    const { app } = require('electron');
    const fileName = name ? name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Stundenplan';
    const downloads = app.getPath('downloads');
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${fileName}_Stundenplanung_${timestamp}.pdf`;
    const filePath = path.join(downloads, filename);
    await generateAndSavePdf(html, filePath);
    return { filePath, directory: downloads, filename };
});
async function generateAndSavePdf(html, filePath) {
    const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    try {
        await new Promise((resolve, reject) => {
            win.webContents.on('did-finish-load', resolve);
            win.webContents.on('did-fail-load', reject);
            win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        });
        const pdfData = await win.webContents.printToPDF({
            margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
            pageSize: 'A4',
            printBackground: true
        });
        require('fs').writeFileSync(filePath, pdfData);
        return { canceled: false, filePath };
    } finally {
        win.close();
    }
}
ipcMain.handle('show-notification', async (event, options) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
        const notification = new Notification(options);
        notification.show();
        return true;
    }
    return false;
});


