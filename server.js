const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 9014;
const appDir = path.join(__dirname);
const dataDir = path.join(process.env.ONEDRIVE || appDir, 'Plan-it');

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
            'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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
            const content = fs.readFileSync(filePath);
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

    res.writeHead(405, { 'Access-Control-Allow-Origin': '*' });
    res.end('Method Not Allowed');
});

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
