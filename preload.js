const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  splitAndZip: (data) => ipcRenderer.invoke('split-and-zip', data),
  saveZipDialog: (defaultName) => ipcRenderer.invoke('save-zip-dialog', defaultName),
});
