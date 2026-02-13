const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const archiver = require('archiver');

ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'src', 'icons', 'icon.png'),
    backgroundColor: '#0a0a0f',
    show: false,
    title: 'SnipWave',
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Read file as buffer for Web Audio API
ipcMain.handle('read-audio-file', async (event, filePath) => {
  const buffer = fs.readFileSync(filePath);
  return buffer;
});

// Split audio into segments (returns temp file paths and segment info)
ipcMain.handle('split-audio', async (event, { filePath, cutPoints, duration }) => {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const tempDir = path.join(app.getPath('temp'), `snipwave_${Date.now()}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Sort cut points
  const sorted = [...cutPoints].sort((a, b) => a - b);

  // Build segments: [0, c1], [c1, c2], ..., [cN, end]
  const boundaries = [0, ...sorted, duration];
  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start < 0.01) continue;
    segments.push({ start, end, index: segments.length + 1 });
  }

  // Split each segment sequentially to avoid ffmpeg conflicts
  const results = [];
  for (const seg of segments) {
    const outputFile = path.join(tempDir, `${baseName}_part${String(seg.index).padStart(3, '0')}${ext}`);
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .setStartTime(seg.start)
        .setDuration(seg.end - seg.start)
        .audioCodec('copy')
        .output(outputFile)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
    results.push({
      index: seg.index,
      start: seg.start,
      end: seg.end,
      duration: seg.end - seg.start,
      fileName: path.basename(outputFile),
      filePath: outputFile,
    });
  }

  return { tempDir, segments: results };
});

// Create zip from selected segment files
ipcMain.handle('zip-segments', async (event, { segmentPaths, outputPath }) => {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    for (const filePath of segmentPaths) {
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
    }
    archive.finalize();
  });

  return { count: segmentPaths.length, outputPath };
});

// Cleanup temp directory
ipcMain.handle('cleanup-temp', async (event, tempDir) => {
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
    fs.rmdirSync(tempDir);
  } catch (e) { /* ignore */ }
});

// Save dialog for zip
ipcMain.handle('save-zip-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});
