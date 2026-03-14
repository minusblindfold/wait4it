// ── State ──
let player = null;
let playerState = -1;
let currentVideoId = null;
let comments = [];
let pendingTimestamp = null;
let viewerComments = [];
let pollInterval = null;
let shownSet = new Set();
let lastTime = 0;
const STORAGE_KEY = 'wait4it-draft';
const SOUND_MUTE_KEY = 'wait4it-muted';

// ── Audio (bloop sound) ──
let audioCtx = null;
let soundMuted = false;

const BUBBLE_COLORS = [
  { bg: '#FFF2CC', border: '#D4A800' },
  { bg: '#D6EEFF', border: '#7AB8E0' },
  { bg: '#FFE0E6', border: '#E8A0B0' },
  { bg: '#E0FFE6', border: '#80C090' },
];
let bubbleColorIndex = 0;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playBloop() {
  if (soundMuted || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.07);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch (e) {}
}

function getDisplayDuration(text) {
  const charCount = text.length;
  return Math.max(4, Math.min(8, 2 + charCount / 30)) * 1000;
}

// ── DOM refs ──
const $landing = document.getElementById('landing');
const $creator = document.getElementById('creator');
const $viewer = document.getElementById('viewer');
const $errorState = document.getElementById('error-state');
const $draftBanner = document.getElementById('draft-banner');
const $urlInput = document.getElementById('url-input');
const $urlError = document.getElementById('url-error');
const $watchBtn = document.getElementById('watch-btn');
const $popBtn = document.getElementById('pop-btn');
const $commentTimestamp = document.getElementById('comment-timestamp');
const $commentInputWrap = document.getElementById('comment-input-wrap');
const $commentForm = document.getElementById('comment-form');
const $commentText = document.getElementById('comment-text');
const $commentList = document.getElementById('comment-list');
const $generateBtn = document.getElementById('generate-btn');
const $sizeIndicator = document.getElementById('size-indicator');
const $copyToast = document.getElementById('copy-toast');
const $generatedUrl = document.getElementById('generated-url');
const $generatedUrlInput = document.getElementById('generated-url-input');
const $resumeBtn = document.getElementById('resume-btn');
const $draftInfo = document.getElementById('draft-info');
const $draftResumeBtn = document.getElementById('draft-resume-btn');
const $draftDiscardBtn = document.getElementById('draft-discard-btn');
const $errorMessage = document.getElementById('error-message');
const $bubbleStack = document.getElementById('bubble-stack');

// ── YouTube URL parsing ──
function parseVideoId(input) {
  if (!input) return null;
  input = input.trim();
  // Bare video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    // youtu.be/VIDEO_ID
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    // youtube.com or youtube-nocookie.com
    if (url.hostname.includes('youtube')) {
      // /embed/VIDEO_ID
      const embedMatch = url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
      // /watch?v=VIDEO_ID
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    }
  } catch (e) {
    // Not a valid URL
  }
  return null;
}

// ── Time formatting ──
function formatTime(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// ── Player ──
let ytReady = false;
let pendingVideoLoad = null;

window.onYouTubeIframeAPIReady = function() {
  ytReady = true;
  if (pendingVideoLoad) {
    pendingVideoLoad();
    pendingVideoLoad = null;
  }
};

function loadPlayer(videoId, containerId, onReady) {
  const create = () => {
    player = new YT.Player(containerId, {
      videoId: videoId,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        enablejsapi: 1,
        autoplay: 0,
        controls: 1
      },
      events: {
        onReady: function(event) {
          if (onReady) onReady(event);
        },
        onStateChange: function(event) {
          playerState = event.data;
          onPlayerStateChange(event);
        },
        onError: function(event) {
          console.error('YouTube player error:', event.data);
        }
      }
    });
  };

  if (ytReady) {
    create();
  } else {
    pendingVideoLoad = create;
  }
}

function onPlayerStateChange(event) {
  // Enable Pop! when playing or paused
  if (currentMode === 'creator') {
    $popBtn.disabled = !(playerState === 1 || playerState === 2);
    if (playerState === 1) $resumeBtn.style.display = 'none';
  }
  // Bubble engine control
  if (currentMode === 'viewer') {
    if (playerState === 1) {
      initAudio();
      startBubbleEngine();
    } else {
      stopBubbleEngine();
    }
  }
}

// ── Mode management ──
let currentMode = 'landing'; // 'landing', 'creator', 'viewer', 'error'

function showMode(mode) {
  currentMode = mode;
  $landing.style.display = mode === 'landing' ? 'block' : 'none';
  $creator.style.display = mode === 'creator' ? 'flex' : 'none';
  $viewer.style.display = mode === 'viewer' ? 'block' : 'none';
  $errorState.style.display = mode === 'error' ? 'block' : 'none';
  // Re-center main
  document.querySelector('main').style.alignItems = (mode === 'creator' || mode === 'viewer') ? 'flex-start' : 'center';
}

function enterCreatorMode(videoId) {
  currentVideoId = videoId;
  showMode('creator');
  loadPlayer(videoId, 'player-container', function() {
    $popBtn.disabled = true; // wait for play
  });
  updateGenerateBtn();
}

function enterViewerMode(data) {
  viewerComments = data.c.slice().sort((a, b) => a.t - b.t);
  showMode('viewer');
  loadPlayer(data.v, 'viewer-player-container');
}

// ── Creator: comments ──
function addComment(time, text) {
  comments.push({ t: time, s: text });
  comments.sort((a, b) => a.t - b.t);
  renderCommentList();
  saveDraft();
  updateGenerateBtn();
}

function editComment(index, newText) {
  if (index >= 0 && index < comments.length) {
    comments[index].s = newText;
    renderCommentList();
    saveDraft();
  }
}

function deleteComment(index) {
  if (index >= 0 && index < comments.length) {
    comments.splice(index, 1);
    renderCommentList();
    saveDraft();
    updateGenerateBtn();
  }
}

function renderCommentList() {
  $commentList.innerHTML = '';
  comments.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="time">${formatTime(c.t)}</span>
      <span class="text">${escapeHtml(c.s)}</span>
      <span class="actions">
        <button data-action="edit" data-index="${i}" title="Edit">&#9998;</button>
        <button data-action="delete" data-index="${i}" title="Delete">&times;</button>
      </span>
    `;
    $commentList.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Comment list click delegation
$commentList.addEventListener('click', function(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const index = parseInt(btn.dataset.index, 10);
  if (btn.dataset.action === 'delete') {
    deleteComment(index);
  } else if (btn.dataset.action === 'edit') {
    const li = btn.closest('li');
    const textSpan = li.querySelector('.text');
    const current = comments[index].s;
    textSpan.innerHTML = `<input type="text" class="edit-input" value="${escapeHtml(current)}" style="width:100%;padding:4px 8px;border:2px solid #E5DDD3;background:#fff;color:#2A2A2A;border-radius:6px;font-size:0.9rem;outline:none;">`;
    const input = textSpan.querySelector('input');
    input.focus();
    input.select();
    const save = () => {
      const val = input.value.trim();
      if (val && val !== current) {
        editComment(index, val);
      } else {
        renderCommentList();
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') renderCommentList(); });
    input.addEventListener('blur', save);
  }
});

// Pop! button
$popBtn.addEventListener('click', function() {
  if (!player) return;
  try { player.pauseVideo(); } catch(e) {}
  const time = Math.round(player.getCurrentTime() * 10) / 10;
  pendingTimestamp = time;
  $commentTimestamp.textContent = formatTime(time);
  $commentInputWrap.style.display = 'block';
  $commentText.value = '';
  $commentText.focus();
});

// Comment form submit
$commentForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const text = $commentText.value.trim();
  if (!text || pendingTimestamp === null) return;
  addComment(pendingTimestamp, text);
  pendingTimestamp = null;
  $commentInputWrap.style.display = 'none';
  $commentTimestamp.textContent = '';
  $resumeBtn.style.display = 'block';
});

// Resume button
$resumeBtn.addEventListener('click', function() {
  if (player) {
    try { player.playVideo(); } catch(e) {}
  }
  $resumeBtn.style.display = 'none';
});

// ── localStorage draft ──
function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: currentVideoId, c: comments }));
  } catch(e) {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.v && Array.isArray(data.c)) return data;
  } catch(e) {}
  return null;
}

function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
}

$draftResumeBtn.addEventListener('click', function() {
  const draft = loadDraft();
  if (draft) {
    comments = draft.c;
    enterCreatorMode(draft.v);
    renderCommentList();
    updateGenerateBtn();
  }
});

$draftDiscardBtn.addEventListener('click', function() {
  clearDraft();
  $draftBanner.style.display = 'none';
});

// ── URL hash encoding/decoding ──
function generateLink() {
  const data = { v: currentVideoId, c: comments };
  const json = JSON.stringify(data);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return window.location.origin + window.location.pathname + '#' + compressed;
}

function getDataSize() {
  if (!currentVideoId || comments.length === 0) return 0;
  const data = { v: currentVideoId, c: comments };
  const json = JSON.stringify(data);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return compressed.length + window.location.origin.length + window.location.pathname.length + 1;
}

function updateGenerateBtn() {
  $generateBtn.disabled = comments.length === 0;
  const size = getDataSize();
  if (size === 0) {
    $sizeIndicator.textContent = '';
    $sizeIndicator.className = '';
  } else {
    const kb = (size / 1024).toFixed(1);
    $sizeIndicator.textContent = `~${kb} KB`;
    $sizeIndicator.className = size > 8192 ? 'danger' : size > 6144 ? 'warn' : '';
  }
}

$generateBtn.addEventListener('click', function() {
  if (comments.length === 0) return;
  const size = getDataSize();
  if (size > 10240) {
    alert('URL is too long. Try removing or shortening some comments.');
    return;
  }
  const url = generateLink();
  $generatedUrlInput.value = url;
  $generatedUrl.style.display = 'block';
  // Copy to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showCopyToast()).catch(() => showCopyToast('Select and copy the URL above'));
  } else {
    try {
      $generatedUrlInput.select();
      document.execCommand('copy');
      showCopyToast();
    } catch(e) {
      showCopyToast('Select and copy the URL above');
    }
  }
});

function showCopyToast(msg) {
  $copyToast.textContent = msg || 'Link copied!';
  $copyToast.style.display = 'inline';
  setTimeout(() => { $copyToast.style.display = 'none'; }, 3000);
}

function decodeHash(hash) {
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash);
    if (!json) return null;
    const data = JSON.parse(json);
    if (data && typeof data.v === 'string' && Array.isArray(data.c)) {
      // Validate each comment
      const valid = data.c.every(c => typeof c.t === 'number' && typeof c.s === 'string');
      if (valid) return data;
    }
  } catch(e) {}
  return null;
}

// ── Bubble engine ──
function startBubbleEngine() {
  if (pollInterval) return;
  pollInterval = setInterval(pollBubbles, 250);
}

function stopBubbleEngine() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function pollBubbles() {
  if (!player) return;
  const currentTime = player.getCurrentTime();
  // Seek-back detection
  if (currentTime < lastTime - 1) {
    for (const key of shownSet) {
      if (parseFloat(key) > currentTime) shownSet.delete(key);
    }
    clearBubbles();
  }
  lastTime = currentTime;
  // Find next unshown comment
  for (const c of viewerComments) {
    const key = `${c.t}:${c.s}`;
    if (!shownSet.has(key) && c.t <= currentTime) {
      shownSet.add(key);
      showBubble(c);
      break;
    }
  }
}

function showBubble(comment) {
  const el = document.createElement('div');
  el.className = 'bubble';
  el.textContent = comment.s;

  // Color rotation
  const color = BUBBLE_COLORS[bubbleColorIndex++ % BUBBLE_COLORS.length];
  el.style.setProperty('--bubble-bg', color.bg);
  el.style.setProperty('--bubble-border', color.border);

  // Auto-dismiss
  const duration = getDisplayDuration(comment.s);
  let dismissTimer = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('dismiss');
    setTimeout(() => el.remove(), 250);
  }, duration);

  // Click-to-dismiss
  el.addEventListener('click', function() {
    clearTimeout(dismissTimer);
    el.classList.remove('show');
    el.classList.add('dismiss');
    setTimeout(() => el.remove(), 250);
  });

  $bubbleStack.appendChild(el);

  // Trigger pop-in + bloop on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('show');
      playBloop();
    });
  });
}

function clearBubbles() {
  $bubbleStack.innerHTML = '';
}

// ── Watch button ──
$watchBtn.addEventListener('click', function() {
  const id = parseVideoId($urlInput.value);
  if (!id) {
    $urlError.textContent = 'Please enter a valid YouTube URL';
    return;
  }
  $urlError.textContent = '';
  enterCreatorMode(id);
});

$urlInput.addEventListener('input', function() {
  $urlError.textContent = '';
});

// Enter key on URL input
$urlInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') $watchBtn.click();
});

// ── Mute toggle ──
const $muteToggle = document.getElementById('mute-toggle');
const $muteIconText = document.getElementById('mute-icon-text');

function updateMuteIcon() {
  if ($muteIconText) $muteIconText.textContent = soundMuted ? '\u{1F507}' : '\u{1F50A}';
}

// Load saved preference
try {
  soundMuted = localStorage.getItem(SOUND_MUTE_KEY) === '1';
} catch(e) {}
updateMuteIcon();

if ($muteToggle) {
  $muteToggle.addEventListener('click', function() {
    soundMuted = !soundMuted;
    try { localStorage.setItem(SOUND_MUTE_KEY, soundMuted ? '1' : '0'); } catch(e) {}
    updateMuteIcon();
  });
}

// ── Init ──
(function init() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    // Viewer mode
    const data = decodeHash(hash);
    if (data) {
      enterViewerMode(data);
    } else {
      showMode('error');
    }
  } else {
    // Check for draft
    const draft = loadDraft();
    if (draft && draft.c.length > 0) {
      $draftInfo.textContent = `You have a draft with ${draft.c.length} comment${draft.c.length === 1 ? '' : 's'}.`;
      $draftBanner.style.display = 'block';
    }
    showMode('landing');
  }
})();
