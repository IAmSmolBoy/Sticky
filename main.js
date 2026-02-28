const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const dotenv = require('dotenv');
dotenv.config();

// ── Paths ──────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(process.env.STICKY_DATA_DIR || app.getPath('userData'), 'notes.json');

// ── Auto-launch setup ──────────────────────────────────────────────────────
const autoLauncher = new AutoLaunch({ name: 'StickyNotes', isHidden: true });
autoLauncher.isEnabled().then(enabled => { if (!enabled) autoLauncher.enable(); });

// ── Data helpers ───────────────────────────────────────────────────────────
function loadNotes() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
  return [];
}

function saveNotes(notes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2));
}

// ── Window registry ────────────────────────────────────────────────────────
const noteWindows = new Map(); // id → BrowserWindow
let tray = null;

function createNoteWindow(note) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    x: note.x ?? Math.floor(Math.random() * (sw - 320)),
    y: note.y ?? Math.floor(Math.random() * (sh - 340)),
    width: note.width ?? 320,
    height: note.height ?? 340,
    minWidth: 220,
    minHeight: 200,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, 'note.html'));

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('load-note', note);
  });

  // Save position/size on move/resize
  const persistBounds = () => {
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    updateNote(note.id, { x, y, width, height });
  };
  win.on('moved', persistBounds);
  win.on('resized', persistBounds);

  noteWindows.set(note.id, win);
  win.on('closed', () => noteWindows.delete(note.id));
  return win;
}

function updateNote(id, changes) {
  const notes = loadNotes();
  const idx = notes.findIndex(n => n.id === id);
  if (idx !== -1) {
    notes[idx] = { ...notes[idx], ...changes };
    saveNotes(notes);
  }
}

function deleteNote(id) {
  let notes = loadNotes();
  notes = notes.filter(n => n.id !== id);
  saveNotes(notes);
  const win = noteWindows.get(id);
  if (win && !win.isDestroyed()) win.close();
  noteWindows.delete(id);
}

function createNewNote() {
  const note = {
    id: Date.now().toString(),
    content: '',
    color: ['#FFF176','#A5D6A7','#90CAF9','#F48FB1','#FFCC80'][Math.floor(Math.random()*5)],
    x: null, y: null, width: 320, height: 340,
    createdAt: new Date().toISOString()
  };
  const notes = loadNotes();
  notes.push(note);
  saveNotes(notes);
  createNoteWindow(note);
}

// ── Tray ───────────────────────────────────────────────────────────────────
function createTray() {
  // Simple 16x16 yellow square icon as fallback
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAACXBIWXMAAAsTAAALEwEAmpwYAAABWWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS40LjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyI+CiAgICAgICAgIDx0aWZmOk9yaWVudGF0aW9uPjE8L3RpZmY6T3JpZW50YXRpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgpMwidZAAAAs0lEQVQ4Ee2SMQqAMAxFk97Bwd3ZxVvoOfQKXsGrOHgCr+DiJjjYwU0ICkL/JyUQbKFDwYU+aJu8vCQkhJBaa621BqAB0IjIAcDMHgB27z0DQMxMRGRmXgA454wxJoQQcs45R0RORGTvPQghJOecI+YPzjlnrTUAaK01xpicc44YY4wxAIhBRERE27YJAFhrJSJSSqn+nHMGgJxzAIiIiCilvBdiZg8A2HsHgIi894+IAAAA//8DALnuDlEuaxb6AAAAAElFTkSuQmCC'
  );
  tray = new Tray(icon);
  tray.setToolTip('Sticky Notes');
  tray.on('click', () => createNewNote());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '📝  New Note', click: createNewNote },
    { label: '👁  Show All', click: () => noteWindows.forEach(w => w.show()) },
    { label: '🙈  Hide All', click: () => noteWindows.forEach(w => w.hide()) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

// ── IPC handlers ───────────────────────────────────────────────────────────
ipcMain.on('note-update', (_, { id, content, color }) => updateNote(id, { content, color }));
ipcMain.on('note-delete', (_, id) => deleteNote(id));
ipcMain.on('new-note', () => createNewNote());
ipcMain.on('close-note', (_, id) => {
  const win = noteWindows.get(id);
  if (win && !win.isDestroyed()) win.close();
});

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createTray();

  // If no notes exist, create a welcome note
  let notes = loadNotes();
  if (notes.length === 0) {
    const welcome = {
      id: Date.now().toString(),
      content: '👋 Welcome to Sticky Notes!\n\n• Click the tray icon to create a new note\n• Drag the header to move\n• Resize from any edge\n• Pick a color from the palette\n• Double-click the header to access more controls',
      color: '#FFF176',
      x: 60, y: 60, width: 320, height: 340,
      createdAt: new Date().toISOString()
    };
    notes.push(welcome);
    saveNotes(notes);
  }

  notes.forEach(note => createNoteWindow(note));
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep app alive in tray
