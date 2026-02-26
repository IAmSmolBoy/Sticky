const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noteAPI', {
  onLoadNote: (cb) => ipcRenderer.on('load-note', (_, note) => cb(note)),
  updateNote: (data) => ipcRenderer.send('note-update', data),
  deleteNote: (id) => ipcRenderer.send('note-delete', id),
  newNote: () => ipcRenderer.send('new-note'),
  closeNote: (id) => ipcRenderer.send('close-note', id),
});
