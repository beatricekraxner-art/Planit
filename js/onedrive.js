(function () {
    'use strict';

    const CLIENT_KEY = 'onedrive_clientid';
    const TENANT_KEY = 'onedrive_tenant';
    const PROVIDER_KEY = 'cloud_provider';
    const PENDING_KEY = 'od_pending_use';
    const FILE_PATH = 'Antigravity_Versuch/planit-daten.json';
    const SCOPES = ['Files.ReadWrite'];
    const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/root:/' + FILE_PATH + ':/content';

    let msal = null;
    let _loginPromise = null;

    function saveSession(account, accessToken) {
        try {
            if (account) localStorage.setItem(OD_SESSION_KEY, JSON.stringify({
                username: account.username,
                name: account.name,
                tenantId: account.tenantId
            }));
            if (accessToken) localStorage.setItem(OD_TOKEN_KEY, accessToken);
        } catch (e) { console.error('saveSession failed', e); }
    }

    function clearSession() {
        try {
            localStorage.removeItem(OD_SESSION_KEY);
            localStorage.removeItem(OD_TOKEN_KEY);
        } catch (e) { console.error('clearSession failed', e); }
    }

    async function tryRestoreSession() {
        try {
            ensureMsal();
            const accounts = msal.getAllAccounts();
            if (accounts.length > 0) {
                const token = await getTokenSilent();
                if (token) {
                    saveSession(accounts[0], token);
                    return true;
                }
                clearSession();
            }
        } catch (e) {
            console.error('tryRestoreSession failed', e);
        }
        return false;
    }

    const OD_SESSION_KEY = 'onedrive_session_account';
    const OD_TOKEN_KEY = 'onedrive_session_token';

    function getClientId() { return (localStorage.getItem(CLIENT_KEY) || '').trim(); }
    function getTenant() { return (localStorage.getItem(TENANT_KEY) || 'common').trim(); }
    function getRedirectUri() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:9014/';
        }
        return window.location.origin + window.location.pathname;
    }

    function ensureMsal() {
        if (msal) return msal;
        const MsalLib = (typeof window.Msal !== 'undefined') ? window.Msal : (typeof window.msal !== 'undefined' ? window.msal : null);
        if (!MsalLib) throw new Error('MSAL-Bibliothek nicht geladen.');
        const cid = getClientId();
        if (!cid) throw new Error('Keine Client-ID konfiguriert.');
        msal = new MsalLib.PublicClientApplication({
            auth: {
                clientId: cid,
                authority: 'https://login.microsoftonline.com/' + getTenant(),
                redirectUri: getRedirectUri()
            },
            cache: {
                cacheLocation: 'localStorage',
                storeAuthStateInCookie: true
            }
        });
        return msal;
    }

    async function getTokenSilent() {
        try {
            ensureMsal();
            const account = msal.getAllAccounts()[0];
            if (!account) return null;
            const res = await msal.acquireTokenSilent({ scopes: SCOPES, account: account });
            return res.accessToken;
        } catch (e) {
            console.error('getTokenSilent failed', e);
            return null;
        }
    }

    async function ensureValidToken() {
        const token = await getTokenSilent();
        if (token) return token;
        const isTablet = navigator.maxTouchPoints > 1;
        if (isTablet && OneDrivePersist.isConnected()) {
            return null;
        }
        return null;
    }

    const OneDrivePersist = {
        available: true,
        providerName: 'onedrive',
        _pending: false,
        _interval: null,

        isConnected() {
            try {
                ensureMsal();
                const account = msal.getAllAccounts()[0];
                return !!account;
            } catch (e) { return false; }
        },

        async login() {
            ensureMsal();
            if (typeof msal.loginPopup !== 'function') throw new Error('MSAL-Bibliothek nicht geladen (Internet/CDN prüfen).');
            try {
                await msal.loginPopup({ scopes: SCOPES, extraQueryParameters: { prompt: 'select_account' } });
            } catch (e) {
                console.error('OD loginPopup failed', e);
                throw e;
            }
        },

        logout() {
            try {
                ensureMsal();
                const acc = msal.getAllAccounts()[0];
                if (acc) msal.logoutRedirect();
            } catch (e) { console.error('OD logout', e); }
            clearSession();
        },

        async bootstrap() {
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await ensureMsal();
                    await msal.handleRedirectPromise();
                    if (this.isConnected()) {
                        const token = await getTokenSilent();
                        if (token) {
                            const text = await this._download(token);
                            if (text && text.trim() && text.trim() !== '{}') {
                                let serverData = null;
                                try { serverData = JSON.parse(text); } catch (e) {}
                                if (serverData && serverData._lastModified) {
                                    const localModified = localStorage.getItem('_lastModified');
                                    if (!localModified || localModified !== serverData._lastModified) {
                                        console.log('OneDrive bootstrap: lade aktuelle Daten vom Server (Versuch ' + attempt + ')...');
                                        try {
                                            DB.importAll(text);
                                            localStorage.setItem('_lastModified', serverData._lastModified);
                                        } catch (e) {
                                            console.error('OneDrive bootstrap: Import fehlgeschlagen', e);
                                            throw e;
                                        }
                                    } else {
                                        console.log('OneDrive bootstrap: lokale Daten sind aktuell.');
                                    }
                                }
                            }
                        }
                    }
                    this.startAutoSave();
                    return;
                } catch (e) {
                    lastError = e;
                    console.error('OneDrive bootstrap fehlgeschlagen (Versuch ' + attempt + '):', e);
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
            console.error('OneDrive bootstrap endgültig fehlgeschlagen:', lastError);
            this.startAutoSave();
        },

        scheduleSave() {
            if (this._pending) return;
            this._pending = true;
            setTimeout(() => { this._pending = false; this.saveToFile(); }, 1000);
        },

        startAutoSave() {
            if (this._interval) return;
            this._interval = setInterval(() => { this.saveToFile(); }, 30000);
        },

        stopAutoSave() {
            if (this._interval) { clearInterval(this._interval); this._interval = null; }
        },

        async saveToFile() {
            try {
                console.log('[OD] saveToFile called, connected=', this.isConnected());
                if (!this.isConnected()) {
                    console.error('OneDrive saveToFile: not connected');
                    return;
                }
                const token = await getTokenSilent();
                if (!token) {
                    console.error('OneDrive saveToFile: no token');
                    return;
                }
                const data = DB.exportAll();
                console.log('[OD] Uploading data, length=', data.length);
                const resp = await fetch(GRAPH, {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: data
                });
                console.log('[OD] Upload status:', resp.status, resp.statusText);
                if (resp.ok) {
                    console.log('[OD] gespeichert.');
                    const localData = JSON.parse(data);
                    if (localData._lastModified) localStorage.setItem('_lastModified', localData._lastModified);
                    saveSession(msal.getAllAccounts()[0], token);
                }
                else {
                    console.error('OneDrive save failed', resp.status);
                    window.dispatchEvent(new CustomEvent('od-save-error', { detail: 'OneDrive: ' + resp.status }));
                }
            } catch (e) {
                console.error('[OD] saveToFile failed', e);
                window.dispatchEvent(new CustomEvent('od-save-error', { detail: (e && e.message ? e.message : e) }));
            }
        },

        async loadFromFile() {
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    if (!this.isConnected()) {
                        console.error('OneDrive loadFromFile: not connected');
                        return;
                    }
                    const token = await getTokenSilent();
                    if (!token) {
                        console.error('OneDrive loadFromFile: no token');
                        return;
                    }
                    const text = await this._download(token);
                    if (text) {
                        console.log('OneDrive: Daten geladen (Versuch ' + attempt + ').');
                        let serverData = null;
                        try { serverData = JSON.parse(text); } catch (e) {}
                        if (serverData && serverData._lastModified) {
                            const localModified = localStorage.getItem('_lastModified');
                            if (!localModified || localModified !== serverData._lastModified) {
                                console.log('OneDrive: neuere Daten gefunden, importiere...');
                                try {
                                    DB.importAll(text);
                                    localStorage.setItem('_lastModified', serverData._lastModified);
                                } catch (e) {
                                    console.error('OneDrive loadFromFile: Import fehlgeschlagen', e);
                                    throw e;
                                }
                            } else {
                                console.log('OneDrive: lokale Daten sind aktuell.');
                            }
                        }
                    }
                    return;
                } catch (e) {
                    lastError = e;
                    console.error('OneDrive loadFromFile fehlgeschlagen (Versuch ' + attempt + '):', e);
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
            console.error('OneDrive loadFromFile endgültig fehlgeschlagen:', lastError);
        },

        async _download(token) {
            if (!token) return null;
            try {
                const resp = await fetch(GRAPH, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (resp.status === 404) return null;
                if (!resp.ok) throw new Error('Download failed: ' + resp.status);
                return await resp.text();
            } catch (e) {
                console.error('OneDrive download failed', e);
                return null;
            }
        }
    };

    function disconnect() {
        try {
            OneDrivePersist.logout();
        } catch (e) { console.error('OD disconnect', e); }
        if (window.LocalPersist) window.LocalPersist.startAutoSave();
        if (window.OD) {
            window.OD.setProvider('local');
            renderODStatus();
        }
    }

    async function applyCloud() {
        if (!OneDrivePersist.isConnected()) return;
        const token = await getTokenSilent();
        if (!token) return;
        const text = await OneDrivePersist._download(token);
        if (!text) return;
        let serverData = null;
        try { serverData = JSON.parse(text); } catch (e) {}
        if (!serverData || !serverData._lastModified) return;
        const localModified = localStorage.getItem('_lastModified');
        if (localModified && localModified === serverData._lastModified) return;
        DB.importAll(text);
        localStorage.setItem('_lastModified', serverData._lastModified);
        renderDashboard();
        renderClasses();
    }

    function renderODStatus() {
        const el = document.getElementById('od-status');
        if (!el) return;
        const connected = OneDrivePersist.isConnected();
        el.className = 'sync-status ' + (connected ? 'od-connected' : 'od-disconnected');
        el.textContent = connected ? 'OneDrive: verbunden' : 'OneDrive: nicht verbunden';
        const btn = document.getElementById('od-connect-btn');
        if (btn) btn.textContent = connected ? 'OneDrive: verbunden' : 'Mit OneDrive verbinden';
    }

    function renderODConfig() {
        const cid = document.getElementById('od-clientid');
        const ten = document.getElementById('od-tenant');
        if (cid) cid.value = getClientId();
        if (ten) ten.value = getTenant();
    }

    window.OD = {
        getProvider() { return localStorage.getItem(PROVIDER_KEY) || 'local'; },
        setProvider(p) { localStorage.setItem(PROVIDER_KEY, p); },
        isConnected() { return OneDrivePersist.isConnected(); },
        setConfig(clientId, tenant) {
            if (clientId) localStorage.setItem(CLIENT_KEY, clientId.trim());
            if (tenant) localStorage.setItem(TENANT_KEY, tenant.trim());
        },
        getClientId: getClientId,
        getTenant: getTenant,
        renderStatus: renderODStatus,
        async init() {
            try {
                await ensureMsal();
                await msal.handleRedirectPromise();
                if (OneDrivePersist.isConnected()) {
                    await tryRestoreSession();
                    if (localStorage.getItem(PENDING_KEY) === '1') {
                        localStorage.removeItem(PENDING_KEY);
                        localStorage.setItem(PROVIDER_KEY, 'onedrive');
                        await applyCloud();
                    }
                }
            } catch (e) { console.error('OD init', e); }
            renderODStatus();
        },
        connect() {
            if (!getClientId()) { alert('Bitte zuerst Client-ID und Tenant konfigurieren.'); return; }
            localStorage.setItem(PENDING_KEY, '1');
            localStorage.setItem(PROVIDER_KEY, 'onedrive');
            Promise.resolve().then(function () { return OneDrivePersist.login(); }).catch(function (e) {
                localStorage.removeItem(PENDING_KEY);
                alert('Verbindung fehlgeschlagen: ' + (e && e.message ? e.message : e));
            });
        },
        useCloud() { localStorage.setItem(PROVIDER_KEY, 'onedrive'); applyCloud(); },
        disconnect() { disconnect(); },
        async pull() { await OneDrivePersist.loadFromFile(); },
        async sync() { await OneDrivePersist.saveToFile(); },
        diagnose: async function() {
            const out = [];
            out.push('=== OneDrive Diagnose ===');
            out.push('MSAL geladen: ' + (typeof Msal !== 'undefined' || typeof msal !== 'undefined'));
            out.push('Client-ID: ' + (getClientId() ? 'konfiguriert' : 'FEHLT'));
            out.push('Tenant: ' + getTenant());
            out.push('Redirect URI: ' + getRedirectUri());
            out.push('Provider: ' + (window.OD ? window.OD.getProvider() : 'unbekannt'));
            try {
                ensureMsal();
                const accounts = msal.getAllAccounts();
                out.push('Konten: ' + accounts.length);
                if (accounts.length > 0) {
                    const token = await getTokenSilent();
                    out.push('Token: ' + (token ? 'gültig' : 'ungültig/abgelaufen'));
                }
            } catch (e) {
                out.push('MSAL Fehler: ' + e.message);
            }
            out.push('OneDrive verbunden: ' + OneDrivePersist.isConnected());
            out.push('PENDING_KEY: ' + localStorage.getItem(PENDING_KEY));
            out.push('========================');
            console.log(out.join('\n'));
            alert(out.join('\n'));
        }
    };

    window.OneDrivePersist = OneDrivePersist;

    const FilePersist = {
        available: true,
        providerName: 'local',
        scheduleSave() { if (this.saveToFile) this.saveToFile(); },
        startAutoSave() {},
        stopAutoSave() {},
        chooseFile: async function() { return false; },
        async bootstrap() {},
        async saveToFile() {},
        async loadFromFile() {},
        async pull() {},
        async sync() {}
    };
    window.FilePersist = FilePersist;
    window.LocalPersist = FilePersist;

    if (typeof window.ODConnect !== 'undefined') window.ODConnect = window.OD.connect;
    if (typeof window.ODDisconnect !== 'undefined') window.ODDisconnect = window.OD.disconnect;
})();
