const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readAudioFile: (filePath) => ipcRenderer.invoke('read-audio-file', filePath),
  splitAudio: (data) => ipcRenderer.invoke('split-audio', data),
  zipSegments: (data) => ipcRenderer.invoke('zip-segments', data),
  cleanupTemp: (tempDir) => ipcRenderer.invoke('cleanup-temp', tempDir),
  saveZipDialog: (defaultName) => ipcRenderer.invoke('save-zip-dialog', defaultName),
});
