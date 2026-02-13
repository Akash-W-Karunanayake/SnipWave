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
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'src', 'icons', 'icon.png'),
    backgroundColor: '#0f0f0f',
    show: false,
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

// Split audio at cut points and create zip
ipcMain.handle('split-and-zip', async (event, { filePath, cutPoints, outputPath }) => {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const tempDir = path.join(app.getPath('temp'), `voices_${Date.now()}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Sort cut points
  const sorted = [...cutPoints].sort((a, b) => a - b);

  // Build segments: [0, c1], [c1, c2], ..., [cN, end]
  // We'll get duration first
  const duration = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });

  const boundaries = [0, ...sorted, duration];
  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start < 0.01) continue; // skip near-zero segments
    segments.push({ start, end, index: segments.length + 1 });
  }

  // Split each segment
  const splitPromises = segments.map((seg) => {
    const outputFile = path.join(tempDir, `${baseName}_part${String(seg.index).padStart(3, '0')}${ext}`);
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .setStartTime(seg.start)
        .setDuration(seg.end - seg.start)
        .audioCodec('copy')
        .output(outputFile)
        .on('end', () => resolve(outputFile))
        .on('error', (err) => reject(err))
        .run();
    });
  });

  const outputFiles = await Promise.all(splitPromises);

  // Create zip
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    for (const file of outputFiles) {
      archive.file(file, { name: path.basename(file) });
    }
    archive.finalize();
  });

  // Cleanup temp files
  for (const file of outputFiles) {
    try { fs.unlinkSync(file); } catch (e) { /* ignore */ }
  }
  try { fs.rmdirSync(tempDir); } catch (e) { /* ignore */ }

  return { segmentCount: outputFiles.length, outputPath };
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
