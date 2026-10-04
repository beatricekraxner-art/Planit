(function () {
    'use strict';

    const CLIENT_KEY = 'onedrive_clientid';
    const TENANT_KEY = 'onedrive_tenant';
    const PROVIDER_KEY = 'cloud_provider';
    const PENDING_KEY = 'od_pending_use';
    const FILE_PATH = 'Antigravity_Versuch/planit-daten.json';
    const SCOPES = ['Files.ReadWrite'];
    const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/root:/' + FILE_PATH + ':/content';
    const graphFor = function (name) {
        return 'https://graph.microsoft.com/v1.0/me/drive/root:/Antigravity_Versuch/' + name + ':/content';
    };

    let msal = null;
    let _loginPromise = null;
    // Letzter Fehler beim stillen Tokenabruf. Solange er gesetzt ist, sieht die
    // App verbunden aus, kann aber nichts laden und nichts speichern.
    let _tokenFehler = null;
    let _letzteMeldung = 0;

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

    // In der Datendatei stehen Client-ID und Tenant mit Anfuehrungszeichen
    // darin, also "common" statt common: exportAll legt den localStorage-Text
    // ab, importAll laesst eine Zeichenkette unveraendert, die gueltiges JSON
    // ist - und "common" ist gueltiges JSON. Jede Geraete-Runde legt eine
    // weitere Ebene an. Aus common wurde so die Anmeldeadresse
    //   https://login.microsoftonline.com/"common
    // und MSAL meldet genau das mit "could not resolve endpoints". Beide Werte
    // werden hier bereinigt und zurueckgeschrieben, damit sich der Fehler
    // nicht beim naechsten Speichern wieder fortpflanzt.
    function aufraeumen(key, standard) {
        let roh = '';
        try { roh = (localStorage.getItem(key) || '').trim(); } catch (e) { return standard; }
        let wert = roh;
        while (wert.length > 1 && wert.charAt(0) === '"' && wert.charAt(wert.length - 1) === '"') {
            wert = wert.slice(1, -1).trim();
        }
        if (!wert) return standard;
        if (wert !== roh) {
            try { localStorage.setItem(key, wert); } catch (e) { }
        }
        return wert;
    }

    function getClientId() { return aufraeumen(CLIENT_KEY, ''); }
    function getTenant() { return aufraeumen(TENANT_KEY, 'common'); }
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
            if (!account) { _tokenFehler = null; return null; }
            const res = await msal.acquireTokenSilent({ scopes: SCOPES, account: account });
            _tokenFehler = null;
            return res.accessToken;
        } catch (e) {
            console.error('getTokenSilent failed', e);
            _tokenFehler = (e && (e.errorCode || e.message)) || 'Token nicht abrufbar';
            return null;
        }
    }

    // Einmal sichtbar melden, nicht bei jedem 30-Sekunden-Speicherversuch.
    function meldeKeinSpeichern(grund) {
        const jetzt = Date.now();
        if (jetzt - _letzteMeldung < 120000) return;
        _letzteMeldung = jetzt;
        const text = 'OneDrive speichert gerade nicht (' + grund + '). Deine Änderungen bleiben nur ' +
            'in diesem Gerät und gehen sonst verloren. In den OneDrive-Einstellungen auf ' +
            '"Mit OneDrive verbinden" tippen.';
        console.error(text);
        if (window.SyncGuard && window.SyncGuard.notify) window.SyncGuard.notify('warn', text);
        window.dispatchEvent(new CustomEvent('od-save-error', { detail: 'OneDrive: ' + grund }));
        try { renderODStatus(); } catch (e) { }
    }

    // Konto vorhanden, aber kein Token zu bekommen. Genau dieser Zustand ist
    // lange unbemerkt geblieben: isConnected() sah ja nach "verbunden" aus.
    function verbindungsProblem() {
        if (getClientId() && OneDrivePersist.isConnected() && _tokenFehler) return _tokenFehler;
        if (!getClientId()) return 'keine Client-ID konfiguriert';
        return null;
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
                                if (window.SyncGuard && SyncGuard.adoptRemote(text)) {
                                    console.log('OneDrive bootstrap: aktuelle Daten vom Server übernommen (Versuch ' + attempt + ').');
                                }
                            }
                        } else {
                            meldeKeinSpeichern(_tokenFehler || 'kein Token');
                        }
                    } else {
                        meldeKeinSpeichern('nicht angemeldet');
                    }
                    await this._acquireLock();
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

        _graphText: async function (name, token) {
            try {
                const r = await fetch(graphFor(name), { headers: { 'Authorization': 'Bearer ' + token } });
                if (r.status === 404) return null;
                if (!r.ok) return null;
                return await r.text();
            } catch (e) { return null; }
        },

        _graphPut: async function (name, text, token) {
            const r = await fetch(graphFor(name), {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: text
            });
            if (!r.ok) throw new Error('Graph PUT failed: ' + r.status);
        },

        _graphDelete: async function (name, token) {
            try {
                await fetch(graphFor(name), {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
            } catch (e) { }
        },

        _acquireLock: async function () {
            if (!window.SyncGuard) return;
            try {
                const token = await getTokenSilent();
                if (!token) return;
                await SyncGuard.acquireLock(
                    () => this._graphText('planit-lock.json', token),
                    (txt) => this._graphPut('planit-lock.json', txt, token),
                    () => this._graphDelete('planit-lock.json', token)
                );
            } catch (e) { console.error('OD lock failed', e); }
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
            if (this._saving) return;
            this._saving = true;
            try {
                if (!this.isConnected()) {
                    console.error('OneDrive saveToFile: not connected');
                    meldeKeinSpeichern('nicht angemeldet');
                    return;
                }
                const token = await getTokenSilent();
                if (!token) {
                    console.error('OneDrive saveToFile: no token');
                    meldeKeinSpeichern(_tokenFehler || 'kein Token');
                    return;
                }
                const remoteText = await this._download(token);
                // Datei bereits identisch -> kein Upload noetig
                if (window.SafetyNet && remoteText &&
                    !SafetyNet.dataChanged(remoteText, DB.exportAll(SyncGuard._meta()))) {
                    let gleich = null; try { gleich = JSON.parse(remoteText); } catch (e) { }
                    SyncGuard.setRemoteSnapshot(gleich);
                    if (window.setSyncStatus) setSyncStatus('bereit');
                    return;
                }
                const plan = window.SyncGuard
                    ? SyncGuard.prepareSave(remoteText)
                    : { payload: DB.exportAll(), mode: 'plain', conflicts: [] };
                console.log('[OD] Uploading data, length=', plan.payload.length, 'mode=', plan.mode);
                if (window.SafetyNet && remoteText && SafetyNet.dataChanged(remoteText, plan.payload)) {
                    SafetyNet.keep(remoteText, 'OneDrive-Inhalt vor dem Ueberschreiben');
                }
                const resp = await fetch(GRAPH, {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: plan.payload
                });
                console.log('[OD] Upload status:', resp.status, resp.statusText);
                if (resp.ok) {
                    console.log('[OD] gespeichert.');
                    if (window.SyncGuard) SyncGuard.afterSave(plan, remoteText);
                    saveSession(msal.getAllAccounts()[0], token);
                }
                else {
                    console.error('OneDrive save failed', resp.status);
                    window.dispatchEvent(new CustomEvent('od-save-error', { detail: 'OneDrive: ' + resp.status }));
                }
            } catch (e) {
                console.error('[OD] saveToFile failed', e);
                window.dispatchEvent(new CustomEvent('od-save-error', { detail: (e && e.message ? e.message : e) }));
            } finally { this._saving = false; }
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
                        if (window.SyncGuard && SyncGuard.adoptRemote(text)) {
                            console.log('OneDrive: Daten geladen (Versuch ' + attempt + ').');
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
        // Niemals blind uebernehmen: adoptRemote prueft, ob die Datei wirklich
        // neuer ist, und sichert den lokalen Stand, falls nicht.
        if (window.SyncGuard && !SyncGuard.adoptRemote(text)) return;
        renderDashboard();
        renderClasses();
    }

    function renderODStatus() {
        const el = document.getElementById('od-status');
        if (!el) return;
        const connected = OneDrivePersist.isConnected();
        const problem = verbindungsProblem();
        el.className = 'sync-status ' + (connected && !problem ? 'od-connected' : 'od-disconnected');
        el.textContent = !connected ? 'OneDrive: nicht verbunden'
            : (problem ? 'OneDrive: Anmeldung erneuern (' + problem + ')'
                : 'OneDrive: verbunden');
        const btn = document.getElementById('od-connect-btn');
        if (btn) btn.textContent = (connected && !problem) ? 'OneDrive: verbunden' : 'Mit OneDrive verbinden';
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
        verbindungsProblem: verbindungsProblem,
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
            if (!getClientId()) { alertModal('Bitte zuerst Client-ID und Tenant konfigurieren.'); return; }
            localStorage.setItem(PENDING_KEY, '1');
            localStorage.setItem(PROVIDER_KEY, 'onedrive');
            Promise.resolve().then(function () { return OneDrivePersist.login(); }).catch(function (e) {
                localStorage.removeItem(PENDING_KEY);
                alertModal('Verbindung fehlgeschlagen: ' + (e && e.message ? e.message : e));
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
            out.push('Problem: ' + (verbindungsProblem() || 'keines'));
            out.push('PENDING_KEY: ' + localStorage.getItem(PENDING_KEY));
            out.push('========================');
            console.log(out.join('\n'));
            alertModal(out.join('\n'));
        }
    };

    window.OneDrivePersist = OneDrivePersist;

    // Wiederherstellungsdateien zuerst über OneDrive, sonst lokal daneben ablegen,
    // damit bei einem Konflikt in jedem Fall eine Sicherung entsteht.
    if (window.SyncGuard) {
        SyncGuard.setWriter(function (name, text) {
            return getTokenSilent().then(function (token) {
                if (!token) throw new Error('kein OneDrive-Token');
                return OneDrivePersist._graphPut(name, text, token);
            }).catch(function (e) {
                console.warn('OneDrive-Wiederherstellung fehlgeschlagen, nutze lokalen Pfad:', e);
                if (window.FilePersist && FilePersist.setWriter) return FilePersist.setWriter(name, text);
                throw e;
            });
        });
    }

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
    if (!window.LocalPersist) window.LocalPersist = FilePersist;
    window.FilePersist = window.LocalPersist || FilePersist;

    if (typeof window.ODConnect !== 'undefined') window.ODConnect = window.OD.connect;
    if (typeof window.ODDisconnect !== 'undefined') window.ODDisconnect = window.OD.disconnect;
})();
