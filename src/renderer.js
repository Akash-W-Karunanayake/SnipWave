// ===== State =====
let audioContext = null;
let audioBuffer = null;
let sourceNode = null;
let isPlaying = false;
let startTime = 0;
let pauseOffset = 0;
let currentFilePath = null;
let cutPoints = [];
let animFrameId = null;

// ===== DOM Elements =====
const uploadScreen = document.getElementById('upload-screen');
const editorScreen = document.getElementById('editor-screen');
const dropZone = document.getElementById('drop-zone');
const fileName = document.getElementById('file-name');
const canvas = document.getElementById('waveform-canvas');
const ctx = canvas.getContext('2d');
const cutMarkersOverlay = document.getElementById('cut-markers-overlay');
const playhead = document.getElementById('playhead');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnMarkCut = document.getElementById('btn-mark-cut');
const btnSplit = document.getElementById('btn-split');
const btnNewFile = document.getElementById('btn-new-file');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const cutPointsSection = document.getElementById('cut-points-section');
const cutPointsList = document.getElementById('cut-points-list');
const processingOverlay = document.getElementById('processing-overlay');
const processingText = document.getElementById('processing-text');

// ===== Upload =====
dropZone.addEventListener('click', openFilePicker);
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file.path);
});
btnNewFile.addEventListener('click', openFilePicker);

async function openFilePicker() {
  const filePath = await window.electronAPI.openFileDialog();
  if (filePath) loadFile(filePath);
}

async function loadFile(filePath) {
  currentFilePath = filePath;
  cutPoints = [];
  pauseOffset = 0;

  // Stop any playing audio
  stopAudio();

  // Read file buffer
  const buffer = await window.electronAPI.readAudioFile(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  // Decode audio
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Update UI
  const name = filePath.split(/[\\/]/).pop();
  fileName.textContent = name;
  totalTimeEl.textContent = formatTime(audioBuffer.duration);
  currentTimeEl.textContent = formatTime(0);

  drawWaveform();
  updateCutPointsUI();

  // Switch to editor
  uploadScreen.classList.remove('active');
  editorScreen.classList.add('active');
}

// ===== Waveform Drawing =====
function drawWaveform() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const data = audioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const mid = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#1a1a1a');
  bgGrad.addColorStop(1, '#141414');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  // Waveform bars
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#6c5ce7');
  gradient.addColorStop(0.5, '#a29bfe');
  gradient.addColorStop(1, '#6c5ce7');

  ctx.fillStyle = gradient;

  for (let i = 0; i < width; i++) {
    let min = 1.0, max = -1.0;
    const start = Math.floor(i * step);
    for (let j = 0; j < step && start + j < data.length; j++) {
      const val = data[start + j];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const barHeight = Math.max(1, (max - min) * mid * 0.9);
    const y = mid - barHeight / 2;
    ctx.fillRect(i, y, 1, barHeight);
  }
}

// Resize observer
const resizeObserver = new ResizeObserver(() => {
  if (audioBuffer) {
    drawWaveform();
    renderCutMarkers();
  }
});
resizeObserver.observe(canvas.parentElement);

// ===== Playback =====
function playAudio() {
  if (!audioBuffer) return;
  if (isPlaying) return;

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioContext.destination);
  sourceNode.start(0, pauseOffset);
  startTime = audioContext.currentTime - pauseOffset;
  isPlaying = true;

  sourceNode.onended = () => {
    if (isPlaying) {
      // Reached the end
      isPlaying = false;
      pauseOffset = 0;
      updatePlayButton();
      updateTimeDisplay();
    }
  };

  updatePlayButton();
  startAnimationLoop();
}

function pauseAudio() {
  if (!isPlaying) return;
  pauseOffset = audioContext.currentTime - startTime;
  if (pauseOffset > audioBuffer.duration) pauseOffset = audioBuffer.duration;
  sourceNode.onended = null;
  sourceNode.stop();
  isPlaying = false;
  updatePlayButton();
  cancelAnimationFrame(animFrameId);
}

function stopAudio() {
  if (sourceNode && isPlaying) {
    sourceNode.onended = null;
    sourceNode.stop();
  }
  isPlaying = false;
  pauseOffset = 0;
  updatePlayButton();
  updateTimeDisplay();
  updatePlayhead();
  cancelAnimationFrame(animFrameId);
}

function getCurrentTime() {
  if (!audioBuffer) return 0;
  if (isPlaying) {
    const t = audioContext.currentTime - startTime;
    return Math.min(t, audioBuffer.duration);
  }
  return pauseOffset;
}

function seekTo(time) {
  if (!audioBuffer) return;
  time = Math.max(0, Math.min(time, audioBuffer.duration));
  const wasPlaying = isPlaying;
  if (wasPlaying) {
    sourceNode.onended = null;
    sourceNode.stop();
    isPlaying = false;
  }
  pauseOffset = time;
  updateTimeDisplay();
  updatePlayhead();
  if (wasPlaying) playAudio();
}

function startAnimationLoop() {
  function tick() {
    if (!isPlaying) return;
    updateTimeDisplay();
    updatePlayhead();
    animFrameId = requestAnimationFrame(tick);
  }
  tick();
}

function updatePlayButton() {
  iconPlay.style.display = isPlaying ? 'none' : 'block';
  iconPause.style.display = isPlaying ? 'block' : 'none';
}

function updateTimeDisplay() {
  currentTimeEl.textContent = formatTime(getCurrentTime());
}

function updatePlayhead() {
  if (!audioBuffer) return;
  const pct = getCurrentTime() / audioBuffer.duration;
  playhead.style.left = `${pct * 100}%`;
}

// Controls
btnPlay.addEventListener('click', () => {
  if (isPlaying) pauseAudio();
  else playAudio();
});

btnStop.addEventListener('click', stopAudio);

btnBack.addEventListener('click', () => {
  seekTo(getCurrentTime() - 0.1);
});

btnForward.addEventListener('click', () => {
  seekTo(getCurrentTime() + 0.1);
});

// Click on waveform to seek
canvas.parentElement.addEventListener('click', (e) => {
  if (!audioBuffer) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = x / rect.width;
  seekTo(pct * audioBuffer.duration);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!audioBuffer) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (isPlaying) pauseAudio();
    else playAudio();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    seekTo(getCurrentTime() - 0.1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    seekTo(getCurrentTime() + 0.1);
  } else if (e.code === 'KeyM') {
    e.preventDefault();
    addCutPoint();
  }
});

// ===== Cut Points =====
btnMarkCut.addEventListener('click', addCutPoint);

function addCutPoint() {
  if (!audioBuffer) return;
  const time = Math.round(getCurrentTime() * 1000) / 1000; // 3 decimal places
  // Don't add duplicates or near-duplicates
  if (cutPoints.some((t) => Math.abs(t - time) < 0.05)) return;
  // Don't add at very start or end
  if (time < 0.05 || time > audioBuffer.duration - 0.05) return;

  cutPoints.push(time);
  cutPoints.sort((a, b) => a - b);
  updateCutPointsUI();
}

function removeCutPoint(index) {
  cutPoints.splice(index, 1);
  updateCutPointsUI();
}

function updateCutPointsUI() {
  // Enable/disable split button
  btnSplit.disabled = cutPoints.length === 0;

  // Show/hide section
  cutPointsSection.style.display = cutPoints.length > 0 ? 'block' : 'none';

  // Render chips
  cutPointsList.innerHTML = '';
  cutPoints.forEach((time, i) => {
    const chip = document.createElement('div');
    chip.className = 'cut-point-chip';
    chip.innerHTML = `
      <span>${formatTime(time)}</span>
      <button class="remove-cut" title="Remove cut point">&times;</button>
    `;
    chip.querySelector('.remove-cut').addEventListener('click', () => removeCutPoint(i));
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-cut')) return;
      seekTo(time);
    });
    cutPointsList.appendChild(chip);
  });

  renderCutMarkers();
}

function renderCutMarkers() {
  cutMarkersOverlay.innerHTML = '';
  if (!audioBuffer) return;
  cutPoints.forEach((time) => {
    const pct = (time / audioBuffer.duration) * 100;
    const line = document.createElement('div');
    line.className = 'cut-marker-line';
    line.style.left = `${pct}%`;
    line.setAttribute('data-time', formatTime(time));
    cutMarkersOverlay.appendChild(line);
  });
}

// ===== Split & Zip =====
btnSplit.addEventListener('click', async () => {
  if (cutPoints.length === 0 || !currentFilePath) return;

  const baseName = currentFilePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  const outputPath = await window.electronAPI.saveZipDialog(`${baseName}_split.zip`);
  if (!outputPath) return;

  processingOverlay.style.display = 'flex';
  processingText.textContent = `Splitting into ${cutPoints.length + 1} segments...`;

  try {
    const result = await window.electronAPI.splitAndZip({
      filePath: currentFilePath,
      cutPoints: cutPoints,
      outputPath: outputPath,
    });

    processingText.textContent = `Done! ${result.segmentCount} segments saved.`;
    setTimeout(() => {
      processingOverlay.style.display = 'none';
    }, 1500);
  } catch (err) {
    processingText.textContent = `Error: ${err.message || err}`;
    setTimeout(() => {
      processingOverlay.style.display = 'none';
    }, 3000);
  }
});

// ===== Helpers =====
function formatTime(seconds) {
  return seconds.toFixed(1) + 's';
}
