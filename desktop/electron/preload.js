const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a minimal, safe API to the renderer process.
 * Never expose ipcRenderer directly — always whitelist specific channels.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  platform: process.platform,

  // File save dialog (for PDF/Excel export)
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),

  // Config (API URL override)
  getApiUrl: () => ipcRenderer.invoke('config:getApiUrl'),
  setApiUrl: (url) => ipcRenderer.invoke('config:setApiUrl', url),

  // Server config — database credentials & connection settings
  getServerConfig: () => ipcRenderer.invoke('server-config:get'),
  setServerConfig: (cfg) => ipcRenderer.invoke('server-config:set', cfg),
});
