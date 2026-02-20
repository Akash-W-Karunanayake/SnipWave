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

// Segment state
let segments = []; // { index, start, end, duration, fileName, filePath, excluded }
let tempDir = null;
let selectedSegmentIndex = -1;
let segmentSourceNode = null;
let playingSegmentIndex = -1;

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
const segmentsSection = document.getElementById('segments-section');
const segmentsList = document.getElementById('segments-list');
const btnResetSplit = document.getElementById('btn-reset-split');
const btnDownloadZip = document.getElementById('btn-download-zip');
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
  resetSegments();

  // Stop any playing audio
  stopAudio();
  stopSegmentPlayback();

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

  // Background
  ctx.fillStyle = '#14141c';
  ctx.fillRect(0, 0, width, height);

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  // Waveform
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
  if (segments.length > 0) return; // can't add cuts after split
  const time = Math.round(getCurrentTime() * 1000) / 1000;
  if (cutPoints.some((t) => Math.abs(t - time) < 0.05)) return;
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
  btnSplit.disabled = cutPoints.length === 0;
  cutPointsSection.style.display = cutPoints.length > 0 ? 'block' : 'none';

  cutPointsList.innerHTML = '';
  cutPoints.forEach((time, i) => {
    const chip = document.createElement('div');
    chip.className = 'cut-point-chip';
    chip.innerHTML = `
      <span>${formatTime(time)}</span>
      <button class="remove-cut" title="Remove cut point">&times;</button>
    `;
    chip.querySelector('.remove-cut').addEventListener('click', (e) => {
      e.stopPropagation();
      removeCutPoint(i);
    });
    chip.addEventListener('click', () => seekTo(time));
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

// ===== Split =====
btnSplit.addEventListener('click', splitAudio);

async function splitAudio() {
  if (cutPoints.length === 0 || !currentFilePath || !audioBuffer) return;

  processingOverlay.style.display = 'flex';
  processingText.textContent = `Splitting into ${cutPoints.length + 1} segments...`;

  try {
    const result = await window.electronAPI.splitAudio({
      filePath: currentFilePath,
      cutPoints: cutPoints,
      duration: audioBuffer.duration,
    });

    tempDir = result.tempDir;
    segments = result.segments.map((s) => ({ ...s, excluded: false }));
    selectedSegmentIndex = -1;

    // Hide cut points, show segments
    cutPointsSection.style.display = 'none';
    btnMarkCut.disabled = true;
    btnSplit.disabled = true;
    segmentsSection.style.display = 'block';
    renderSegments();

    processingText.textContent = `Done! ${segments.length} segments created.`;
    setTimeout(() => {
      processingOverlay.style.display = 'none';
    }, 1000);
  } catch (err) {
    processingText.textContent = `Error: ${err.message || err}`;
    setTimeout(() => {
      processingOverlay.style.display = 'none';
    }, 3000);
  }
}

// ===== Segments UI =====
function renderSegments() {
  segmentsList.innerHTML = '';

  segments.forEach((seg, i) => {
    const card = document.createElement('div');
    card.className = 'segment-card';
    if (i === selectedSegmentIndex) card.classList.add('selected');
    if (seg.excluded) card.classList.add('excluded');

    const isSegPlaying = playingSegmentIndex === i;

    card.innerHTML = `
      <div class="segment-number">${seg.index}</div>
      <div class="segment-info">
        <div class="segment-name">${seg.fileName}</div>
        <div class="segment-meta">${formatTime(seg.start)} - ${formatTime(seg.end)} (${formatTime(seg.duration)})</div>
      </div>
      ${seg.excluded ? '<span class="excluded-badge">EXCLUDED</span>' : ''}
      <div class="segment-controls">
        ${seg.excluded ? `
          <button class="segment-btn restore-btn" data-action="restore" title="Restore segment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
        ` : `
          <button class="segment-btn play-btn ${isSegPlaying ? 'playing' : ''}" data-action="play" title="${isSegPlaying ? 'Stop' : 'Play'} segment">
            ${isSegPlaying ? `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            ` : `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            `}
          </button>
          <button class="segment-btn delete-btn" data-action="delete" title="Exclude from zip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        `}
      </div>
    `;

    // Click to select
    card.addEventListener('click', (e) => {
      if (e.target.closest('.segment-btn')) return;
      selectedSegmentIndex = selectedSegmentIndex === i ? -1 : i;
      renderSegments();
    });

    // Button actions
    card.querySelectorAll('.segment-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'play') toggleSegmentPlay(i);
        else if (action === 'delete') excludeSegment(i);
        else if (action === 'restore') restoreSegment(i);
      });
    });

    segmentsList.appendChild(card);
  });
}

function excludeSegment(index) {
  stopSegmentPlayback();
  segments[index].excluded = true;
  if (selectedSegmentIndex === index) selectedSegmentIndex = -1;
  renderSegments();
}

function restoreSegment(index) {
  segments[index].excluded = false;
  renderSegments();
}

// ===== Segment Playback =====
function toggleSegmentPlay(index) {
  if (playingSegmentIndex === index) {
    stopSegmentPlayback();
    renderSegments();
    return;
  }

  stopSegmentPlayback();
  stopAudio(); // stop main playback

  const seg = segments[index];
  if (!audioBuffer || !audioContext) return;

  segmentSourceNode = audioContext.createBufferSource();
  segmentSourceNode.buffer = audioBuffer;
  segmentSourceNode.connect(audioContext.destination);
  segmentSourceNode.start(0, seg.start, seg.duration);
  playingSegmentIndex = index;

  segmentSourceNode.onended = () => {
    playingSegmentIndex = -1;
    segmentSourceNode = null;
    renderSegments();
  };

  renderSegments();
}

function stopSegmentPlayback() {
  if (segmentSourceNode) {
    segmentSourceNode.onended = null;
    try { segmentSourceNode.stop(); } catch (e) { /* ignore */ }
    segmentSourceNode = null;
  }
  playingSegmentIndex = -1;
}

// ===== Reset Split =====
btnResetSplit.addEventListener('click', () => {
  stopSegmentPlayback();
  resetSegments();
  btnMarkCut.disabled = false;
  updateCutPointsUI();
});

function resetSegments() {
  if (tempDir) {
    window.electronAPI.cleanupTemp(tempDir);
    tempDir = null;
  }
  segments = [];
  selectedSegmentIndex = -1;
  playingSegmentIndex = -1;
  segmentsSection.style.display = 'none';
}

// ===== Download Zip =====
btnDownloadZip.addEventListener('click', async () => {
  const includedSegments = segments.filter((s) => !s.excluded);
  if (includedSegments.length === 0) return;

  const baseName = currentFilePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  const outputPath = await window.electronAPI.saveZipDialog(`${baseName}_split.zip`);
  if (!outputPath) return;

  processingOverlay.style.display = 'flex';
  processingText.textContent = `Zipping ${includedSegments.length} segments...`;

  try {
    const result = await window.electronAPI.zipSegments({
      segmentPaths: includedSegments.map((s) => s.filePath),
      outputPath: outputPath,
    });

    processingText.textContent = `Done! ${result.count} segments saved to zip.`;
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
