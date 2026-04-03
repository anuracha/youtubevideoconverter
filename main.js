// ========================================
// ClipSync — Main App Logic
// ========================================

// ---- State ----
const state = {
  videoInfo: null,
  totalDuration: 0,
  startTime: 0,
  endTime: 0,
  format: 'mp3',
  audioQuality: '192',
  videoQuality: '720p',
  isDragging: null, // 'start' | 'end' | null
};

// ---- DOM Elements ----
const $ = (sel) => document.querySelector(sel);
const urlInput = $('#url-input');
const pasteBtn = $('#paste-btn');
const fetchBtn = $('#fetch-btn');
const loadingSection = $('#loading-section');
const editorSection = $('#editor-section');
const inputSection = $('#input-section');

const videoThumbnail = $('#video-thumbnail');
const videoTitle = $('#video-title');
const videoViews = $('#video-views');
const videoLikes = $('#video-likes');
const videoDurationText = $('#video-duration-text');
const durationBadge = $('#duration-badge');

const timelineBar = $('#timeline-bar');
const timelineFill = $('#timeline-fill');
const timelineIndicator = $('#timeline-indicator');
const startHandle = $('#start-handle');
const endHandle = $('#end-handle');
const timelineTicks = $('#timeline-ticks');

const startTimeInput = $('#start-time');
const endTimeInput = $('#end-time');
const clipDuration = $('#clip-duration');

const previewBtn = $('#preview-btn');
const previewIconPlay = $('#preview-icon-play');
const previewIconPause = $('#preview-icon-pause');
const previewText = $('#preview-text');
const ytPlayerContainer = $('#yt-player-container');

const formatMp3 = $('#format-mp3');
const formatMp4 = $('#format-mp4');
const qualitySelector = $('#quality-selector');
const videoQualitySelector = $('#video-quality-selector');
const qualityOptions = $('#quality-options');
const videoQualityOptions = $('#video-quality-options');

const downloadBtn = $('#download-btn');
const downloadBtnContent = $('#download-btn-content');
const downloadProgress = $('#download-progress');
const progressFill = $('#progress-fill');
const progressText = $('#progress-text');

const toast = $('#toast');
const toastIcon = $('#toast-icon');
const toastMessage = $('#toast-message');

// ---- YouTube Iframe API ----
let ytPlayer;
let isYtReady = false;
let isPreviewing = false;
let previewInterval = null;

window.onYouTubeIframeAPIReady = () => {
  isYtReady = true;
};

// Inject YT script
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
if (firstScriptTag && firstScriptTag.parentNode) {
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
} else {
  document.head.appendChild(tag);
}

// ---- Utilities ----
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTime(str) {
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function isValidYouTubeUrl(url) {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[\w-]+/,
    /(?:https?:\/\/)?youtu\.be\/[\w-]+/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/,
    /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?v=[\w-]+/,
  ];
  return patterns.some((p) => p.test(url));
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

function showToast(message, type = 'success') {
  toastMessage.textContent = message;
  toastIcon.className = `toast-icon ${type}`;
  toast.classList.remove('hidden');
  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}

// ---- Paste Button ----
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    urlInput.dispatchEvent(new Event('input'));
    showToast('Pasted from clipboard', 'success');
  } catch {
    showToast('Unable to access clipboard', 'error');
  }
});

// ---- Fetch Video ----
fetchBtn.addEventListener('click', fetchVideo);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideo();
});

async function fetchVideo() {
  const url = urlInput.value.trim();

  if (!url) {
    showToast('Please enter a YouTube URL', 'warning');
    urlInput.focus();
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    showToast('Invalid YouTube URL', 'error');
    return;
  }

  // Show loading
  fetchBtn.disabled = true;
  loadingSection.classList.remove('hidden');
  editorSection.classList.add('hidden');

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch video info');
    }

    const data = await res.json();
    state.videoInfo = data;
    state.totalDuration = data.duration;
    state.startTime = 0;
    state.endTime = data.duration;

    displayVideoInfo(data);
    setupTimeline();
    updateTimeInputs();
    updateClipDuration();
    
    // Enable preview button
    previewBtn.disabled = false;
    stopPreviewing();

    loadingSection.classList.add('hidden');
    editorSection.classList.remove('hidden');

    // Scroll to editor
    editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(err.message || 'Failed to fetch video info', 'error');
    loadingSection.classList.add('hidden');
  } finally {
    fetchBtn.disabled = false;
  }
}

function displayVideoInfo(data) {
  videoThumbnail.src = data.thumbnail;
  videoTitle.textContent = data.title;
  videoViews.textContent = formatNumber(data.views) + ' views';
  videoLikes.textContent = formatNumber(data.likes) + ' likes';
  videoDurationText.textContent = formatTime(data.duration);
  durationBadge.textContent = formatTime(data.duration);
}

// ---- Timeline Slider ----
function setupTimeline() {
  updateTimelineVisual();
  generateTicks();
}

function generateTicks() {
  timelineTicks.innerHTML = '';
  const dur = state.totalDuration;
  const tickCount = dur <= 60 ? 5 : dur <= 300 ? 6 : dur <= 600 ? 8 : 6;
  for (let i = 0; i <= tickCount; i++) {
    const span = document.createElement('span');
    span.textContent = formatTime((dur / tickCount) * i);
    timelineTicks.appendChild(span);
  }
}

function updateTimelineVisual() {
  const dur = state.totalDuration || 1;
  const startPct = (state.startTime / dur) * 100;
  const endPct = (state.endTime / dur) * 100;

  timelineFill.style.left = startPct + '%';
  timelineFill.style.width = (endPct - startPct) + '%';
  startHandle.style.left = startPct + '%';
  endHandle.style.left = endPct + '%';
}

function updateTimeInputs() {
  startTimeInput.value = formatTime(state.startTime);
  endTimeInput.value = formatTime(state.endTime);
}

function updateClipDuration() {
  const dur = Math.max(0, state.endTime - state.startTime);
  clipDuration.textContent = formatTime(dur);
}

// Timeline drag logic
function getPositionFromEvent(e) {
  const rect = timelineBar.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function onDragStart(handle, e) {
  e.preventDefault();
  state.isDragging = handle;
  document.body.style.cursor = 'grabbing';

  const onMove = (e) => {
    if (!state.isDragging) return;
    const pct = getPositionFromEvent(e);
    const time = Math.round(pct * state.totalDuration);

    if (state.isDragging === 'start') {
      state.startTime = Math.min(time, state.endTime - 1);
      state.startTime = Math.max(0, state.startTime);
    } else {
      state.endTime = Math.max(time, state.startTime + 1);
      state.endTime = Math.min(state.totalDuration, state.endTime);
    }

    updateTimelineVisual();
    updateTimeInputs();
    updateClipDuration();
  };

  const onEnd = () => {
    state.isDragging = null;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };

  document.addEventListener('mousemove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

startHandle.addEventListener('mousedown', (e) => onDragStart('start', e));
startHandle.addEventListener('touchstart', (e) => onDragStart('start', e), { passive: false });
endHandle.addEventListener('mousedown', (e) => onDragStart('end', e));
endHandle.addEventListener('touchstart', (e) => onDragStart('end', e), { passive: false });

// Click on timeline bar to set nearest handle
timelineBar.addEventListener('click', (e) => {
  if (state.isDragging) return;
  const pct = getPositionFromEvent(e);
  const time = Math.round(pct * state.totalDuration);
  const startDist = Math.abs(time - state.startTime);
  const endDist = Math.abs(time - state.endTime);

  if (startDist <= endDist) {
    state.startTime = Math.min(time, state.endTime - 1);
    state.startTime = Math.max(0, state.startTime);
  } else {
    state.endTime = Math.max(time, state.startTime + 1);
    state.endTime = Math.min(state.totalDuration, state.endTime);
  }

  updateTimelineVisual();
  updateTimeInputs();
  updateClipDuration();
  if (isPreviewing) checkPreviewSeek();
});

// Time input changes
startTimeInput.addEventListener('change', () => {
  const t = parseTime(startTimeInput.value);
  state.startTime = Math.max(0, Math.min(t, state.endTime - 1));
  updateTimelineVisual();
  updateTimeInputs();
  updateClipDuration();
  if (isPreviewing) checkPreviewSeek();
});

endTimeInput.addEventListener('change', () => {
  const t = parseTime(endTimeInput.value);
  state.endTime = Math.min(state.totalDuration, Math.max(t, state.startTime + 1));
  updateTimelineVisual();
  updateTimeInputs();
  updateClipDuration();
  if (isPreviewing) checkPreviewSeek();
});

// ---- Preview Clip ----
previewBtn.addEventListener('click', togglePreview);

function togglePreview() {
  if (!state.videoInfo) return;
  if (!isYtReady) {
    showToast('YouTube Player loading, please wait...', 'warning');
    return;
  }

  if (isPreviewing) {
    stopPreviewing();
  } else {
    startPreviewing();
  }
}

function startPreviewing() {
  isPreviewing = true;
  previewBtn.classList.add('playing');
  previewIconPlay.classList.add('hidden');
  previewIconPause.classList.remove('hidden');
  previewText.textContent = 'Pause';
  ytPlayerContainer.classList.remove('hidden');
  timelineIndicator.classList.remove('hidden');

  if (!ytPlayer) {
    ytPlayer = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: state.videoInfo.videoId,
      playerVars: {
        playsinline: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        start: state.startTime,
        autoplay: 1
      },
      events: {
        'onReady': (e) => {
          e.target.playVideo();
          startPreviewPolling();
        },
        'onStateChange': (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            stopPreviewing();
          }
        }
      }
    });
  } else {
    // If the video ID changed, load new video
    const currentVideoId = ytPlayer.getVideoData?.().video_id;
    if (currentVideoId !== state.videoInfo.videoId) {
      ytPlayer.loadVideoById({
        videoId: state.videoInfo.videoId,
        startSeconds: state.startTime
      });
    } else {
      ytPlayer.seekTo(state.startTime, true);
      ytPlayer.playVideo();
    }
    startPreviewPolling();
  }
}

function stopPreviewing() {
  isPreviewing = false;
  previewBtn.classList.remove('playing');
  previewIconPause.classList.add('hidden');
  previewIconPlay.classList.remove('hidden');
  previewText.textContent = 'Preview';
  timelineIndicator.classList.add('hidden');
  
  if (ytPlayer && ytPlayer.pauseVideo) {
    ytPlayer.pauseVideo();
  }
  
  if (previewInterval) {
    clearInterval(previewInterval);
    previewInterval = null;
  }
}

function startPreviewPolling() {
  if (previewInterval) clearInterval(previewInterval);
  previewInterval = setInterval(() => {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    const currentTime = ytPlayer.getCurrentTime();
    
    // Update indicator visual
    const pct = (currentTime / (state.totalDuration || 1)) * 100;
    timelineIndicator.style.left = `${Math.max(0, Math.min(100, pct))}%`;

    if (currentTime >= state.endTime) {
      stopPreviewing();
    }
  }, 50); // Polling faster (50ms) for smoother indicator movement
}

function checkPreviewSeek() {
  // Seek the player live if they are dragging the handle
  if (ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(state.startTime, true);
  }
}

// ---- Format Toggle ----
formatMp3.addEventListener('click', () => {
  state.format = 'mp3';
  formatMp3.classList.add('active');
  formatMp4.classList.remove('active');
  qualitySelector.classList.remove('hidden');
  videoQualitySelector.classList.add('hidden');
});

formatMp4.addEventListener('click', () => {
  state.format = 'mp4';
  formatMp4.classList.add('active');
  formatMp3.classList.remove('active');
  qualitySelector.classList.add('hidden');
  videoQualitySelector.classList.remove('hidden');
});

// Quality buttons
qualityOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.quality-btn');
  if (!btn) return;
  qualityOptions.querySelectorAll('.quality-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.audioQuality = btn.dataset.quality;
});

videoQualityOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.quality-btn');
  if (!btn) return;
  videoQualityOptions.querySelectorAll('.quality-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.videoQuality = btn.dataset.quality;
});

// ---- Download ----
downloadBtn.addEventListener('click', startDownload);

async function startDownload() {
  if (!state.videoInfo) return;

  const clipDur = state.endTime - state.startTime;
  if (clipDur <= 0) {
    showToast('Invalid clip range', 'error');
    return;
  }

  downloadBtn.disabled = true;
  downloadBtnContent.classList.add('hidden');
  downloadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Processing...';

  try {
    // Simulate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 85) {
        progress += Math.random() * 8;
        progressFill.style.width = Math.min(progress, 85) + '%';
      }
    }, 500);

    const quality = state.format === 'mp3' ? state.audioQuality : state.videoQuality;

    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: state.videoInfo.url,
        format: state.format,
        quality: quality,
        startTime: state.startTime,
        endTime: state.endTime,
      }),
    });

    clearInterval(progressInterval);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Download failed');
    }

    progressFill.style.width = '90%';
    progressText.textContent = 'Downloading...';

    // Get the file blob
    const blob = await res.blob();
    const ext = state.format;
    const filename = sanitizeFilename(state.videoInfo.title) + '.' + ext;

    // Trigger browser download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';
    showToast('Download started!', 'success');

    setTimeout(resetDownloadBtn, 2000);
  } catch (err) {
    showToast(err.message || 'Download failed', 'error');
    resetDownloadBtn();
  }
}

function resetDownloadBtn() {
  downloadBtn.disabled = false;
  downloadBtnContent.classList.remove('hidden');
  downloadProgress.classList.add('hidden');
  progressFill.style.width = '0%';
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

// ---- URL Input glow effect ----
urlInput.addEventListener('input', () => {
  if (urlInput.value && isValidYouTubeUrl(urlInput.value)) {
    urlInput.style.borderColor = 'var(--success)';
  } else if (urlInput.value) {
    urlInput.style.borderColor = '';
  } else {
    urlInput.style.borderColor = '';
  }
});

// ---- Init ----
console.log('🎬 ClipSync initialized');
