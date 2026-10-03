const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 9014;
const appDir = path.join(__dirname);
const dataDir = appDir;

// Migrate existing data file from old locations if needed
const oldLocations = [
    path.join(process.env.APPDATA || '', 'plan-it', 'planit-daten.json'),
    path.join(appDir, 'planit-daten.json')
];
const newFile = path.join(dataDir, 'planit-daten.json');
if (!fs.existsSync(newFile)) {
    for (const oldFile of oldLocations) {
        if (oldFile && fs.existsSync(oldFile)) {
            try {
                fs.copyFileSync(oldFile, newFile);
                console.log('Migrated planit-daten.json from', oldFile, 'to', newFile);
                break;
            } catch (e) { console.error('Migration failed:', e); }
        }
    }
}

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsed.pathname).replace(/^\//, '');
    if (!pathname) pathname = 'index.html';

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Length': '0',
            'Connection': 'close'
        });
        res.end();
        return;
    }

    if (req.method === 'GET') {
        let filePath = path.join(appDir, pathname);
        if (pathname === 'planit-daten.json') {
            const dataFile = path.join(dataDir, 'planit-daten.json');
            if (fs.existsSync(dataFile)) filePath = dataFile;
        }
        if (!fs.existsSync(filePath)) {
            if (!pathname.includes('.')) {
                filePath = path.join(appDir, 'index.html');
            }
        }
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            let content = fs.readFileSync(filePath);
            // Versionsparameter im HTML an den Aenderungszeitpunkt des Stylesheets
            // binden. Ein festes "?v=62" liefert auf Geraeten mit aelterer
            // server.js aus dem Browser-Cache genau die alte CSS-Datei aus -
            // JavaScript kam trotzdem an, weil es ohne Parameter geladen wird.
            // So kann die Version nicht mehr veralten.
            if (ext === '.html') {
                try {
                    const cssPath = path.join(appDir, 'style.css');
                    const stamp = fs.existsSync(cssPath) ? Math.floor(fs.statSync(cssPath).mtimeMs) : 0;
                    content = Buffer.from(content.toString('utf8')
                        .replace(/(style\.css\?v=)\d+/g, '$1' + stamp), 'utf8');
                } catch (e) { }
            }
            res.writeHead(200, {
                'Content-Type': mime[ext] || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Content-Length': content.length,
                'Connection': 'close'
            });
            res.end(content);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Not Found');
        }
        return;
    }

    if (req.method === 'PUT' && pathname === 'planit-daten.json') {
        const savePath = path.join(dataDir, 'planit-daten.json');
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                fs.writeFileSync(savePath, Buffer.concat(chunks), 'utf8');
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Length': 0,
                    'Connection': 'close'
                });
                res.end();
            } catch (e) {
                res.writeHead(500, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0 });
                res.end();
            }
        });
        return;
    }

    // --- Sicherungskopien: automatischer Stand vor jeder Aenderung ---
    // Landen in %APPDATA%\Plan-it\backups und werden rotiert, damit dort
    // niemals Daten verloren gehen koennen.
    const isSnapFile = /^planit-snap-[0-9A-Za-z\-]+\.json$/.test(pathname);
    if (isSnapFile) {
        const snapDir = path.join(process.env.APPDATA || require('os').homedir(), 'Plan-it', 'backups');
        const snapPath = path.join(snapDir, path.basename(pathname));
        if (req.method === 'GET') {
            if (!fs.existsSync(snapPath)) {
                res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
                res.end();
                return;
            }
            const c = fs.readFileSync(snapPath);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Content-Length': c.length, 'Connection': 'close' });
            res.end(c);
            return;
        }
        if (req.method === 'DELETE') {
            try { if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath); } catch (e) { }
            res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
            res.end();
            return;
        }
        if (req.method === 'PUT') {
            const parts = [];
            req.on('data', c => parts.push(c));
            req.on('end', () => {
                try {
                    if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
                    fs.writeFileSync(snapPath, Buffer.concat(parts), 'utf8');
                    pruneSnapshots(snapDir);
                    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
                    res.end();
                } catch (e) {
                    res.writeHead(500, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
                    res.end();
                }
            });
            return;
        }
    }

    // --- Sync-Hilfsdateien (Lock + Wiederherstellung) ---
    const isStateFile = pathname === 'planit-lock.json' ||
        (pathname.indexOf('planit-recovery-') === 0 && pathname.slice(-5) === '.json');
    const safeStatePath = path.join(dataDir, path.basename(pathname));

    if (isStateFile && req.method === 'GET') {
        if (!fs.existsSync(safeStatePath)) {
            res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
            res.end();
            return;
        }
        const content = fs.readFileSync(safeStatePath);
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Content-Length': content.length,
            'Connection': 'close'
        });
        res.end(content);
        return;
    }

    if (isStateFile && (req.method === 'PUT' || req.method === 'DELETE')) {
        if (req.method === 'DELETE') {
            try {
                if (fs.existsSync(safeStatePath)) fs.unlinkSync(safeStatePath);
                res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
                res.end();
            } catch (e) {
                res.writeHead(500, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0 });
                res.end();
            }
            return;
        }
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                fs.writeFileSync(safeStatePath, Buffer.concat(chunks), 'utf8');
                if (pathname.indexOf('planit-recovery-') === 0) pruneRecoveryFiles();
                res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0, 'Connection': 'close' });
                res.end();
            } catch (e) {
                res.writeHead(500, { 'Access-Control-Allow-Origin': '*', 'Content-Length': 0 });
                res.end();
            }
        });
        return;
    }

    res.writeHead(405, { 'Access-Control-Allow-Origin': '*' });
    res.end('Method Not Allowed');
});

// Nur die neuesten automatischen Staende behalten (Zeitstempel im Namen)
const MAX_SNAPSHOTS = 25;
function pruneSnapshots(dir) {
    try {
        const files = fs.readdirSync(dir)
            .filter(f => f.indexOf('planit-snap-') === 0 && f.slice(-5) === '.json')
            .sort();
        while (files.length > MAX_SNAPSHOTS) {
            const old = files.shift();
            try { fs.unlinkSync(path.join(dir, path.basename(old))); } catch (e) { }
        }
    } catch (e) { }
}

// Nur die neuesten Wiederherstellungsdateien behalten (Zeitstempel im Namen)
const MAX_RECOVERY_FILES = 5;
function pruneRecoveryFiles() {
    try {
        const files = fs.readdirSync(dataDir)
            .filter(f => f.indexOf('planit-recovery-') === 0 && f.slice(-5) === '.json')
            .sort();
        while (files.length > MAX_RECOVERY_FILES) {
            const old = files.shift();
            try { fs.unlinkSync(path.join(dataDir, path.basename(old))); } catch (e) { }
        }
    } catch (e) { }
}

function start() {
    return new Promise((resolve, reject) => {
        server.listen(PORT, '127.0.0.1', () => {
            console.log('Server: http://localhost:' + PORT);
            console.log('App dir: ' + appDir);
            console.log('Data dir: ' + dataDir);
            resolve();
        });
        server.on('error', (e) => {
            console.error('Server error:', e.message);
            if (e.code === 'EADDRINUSE') {
                console.error('Port ' + PORT + ' already in use');
                resolve();
            } else {
                reject(e);
            }
        });
    });
}

if (require.main === module) {
    start().catch((e) => {
        console.error('Server failed to start:', e);
        process.exit(1);
    });
} else {
    module.exports = { start, server };
}
