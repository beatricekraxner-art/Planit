const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    getVersion: () => ipcRenderer.invoke('app-version'),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    selectFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    showNotification: (options) => ipcRenderer.invoke('show-notification', options)
});
