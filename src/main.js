import './style.css';
const $ = (id) => document.getElementById(id);
const els = {
  browserBadge: $('browserBadge'), secureValue: $('secureValue'), simdValue: $('simdValue'), gpuValue: $('gpuValue'),
  threadsValue: $('threadsValue'), storageValue: $('storageValue'), persistValue: $('persistValue'),
  modelBadge: $('modelBadge'), modelProgress: $('modelProgress'), modelProgressText: $('modelProgressText'), modelPercent: $('modelPercent'),
  loadModelBtn: $('loadModelBtn'), modelStatus: $('modelStatus'), voiceSelect: $('voiceSelect'), speedRange: $('speedRange'), speedValue: $('speedValue'),
  sampleText: $('sampleText'), charCount: $('charCount'), generateBtn: $('generateBtn'), synthBadge: $('synthBadge'), synthStatus: $('synthStatus'),
  chunkCount: $('chunkCount'), synthProgress: $('synthProgress'), audioBadge: $('audioBadge'), audioPlayer: $('audioPlayer'),
  audioTitle: $('audioTitle'), audioMeta: $('audioMeta'), audioStats: $('audioStats'), downloadAudioBtn: $('downloadAudioBtn'),
  clearAudioBtn: $('clearAudioBtn'), clearLogBtn: $('clearLogBtn'), copyLogBtn: $('copyLogBtn'), logList: $('logList')
};

let tts = null;
let audioUrl = null;
let lastLogText = '';
let currentVoice = null;
let generatedSpeech = null;
let generationStarted = 0;
const logEntries = [];

function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEntries.unshift({ time, message, type });
  logEntries.splice(80);
  renderLog();
}
function renderLog() {
  els.logList.innerHTML = '';
  for (const item of logEntries) {
    const row = document.createElement('div');
    row.className = 'log-entry';
    const time = document.createElement('time'); time.textContent = item.time;
    const msg = document.createElement('span'); msg.className = `log-${item.type}`; msg.textContent = item.message;
    row.append(time, msg); els.logList.append(row);
  }
  if (!logEntries.length) els.logList.innerHTML = '<div class="empty-log">Diagnostics will appear here.</div>';
  lastLogText = logEntries.map((x) => `[${x.time}] ${x.message}`).join('\n');
}
function badge(el, text, state = 'neutral') { el.textContent = text; el.className = `state-pill ${state}`; }
function setModelProgress(percent, text) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  els.modelProgress.style.width = `${p}%`;
  els.modelPercent.textContent = `${Math.round(p)}%`;
  if (text) els.modelProgressText.textContent = text;
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function simdSupported() {
  // Minimal valid WebAssembly module that returns a v128 constant.
  // WebAssembly.validate() returns false when baseline SIMD is unsupported.
  const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11]);
  try { return WebAssembly.validate(bytes); } catch { return false; }
}
async function diagnostics() {
  const ua = navigator.userAgent;
  let family = /iPhone|iPad|iPod/.test(ua) ? 'iOS browser' : /Android/.test(ua) ? 'Android browser' : /Edg\//.test(ua) ? 'Microsoft Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  els.browserBadge.textContent = family;
  els.browserBadge.className = 'state-pill info';
  els.secureValue.textContent = window.isSecureContext ? 'Yes' : 'No';
  els.secureValue.className = window.isSecureContext ? 'good' : 'bad';
  const simd = typeof WebAssembly !== 'undefined' && simdSupported();
  els.simdValue.textContent = simd ? 'Available' : 'Not available';
  els.simdValue.className = simd ? 'good' : 'bad';
  els.gpuValue.textContent = navigator.gpu ? 'Available (not used)' : 'Not available';
  els.threadsValue.textContent = `${navigator.hardwareConcurrency || 'Unknown'} reported`;
  try {
    const est = await navigator.storage?.estimate?.();
    els.storageValue.textContent = est?.quota ? `${formatBytes(est.usage || 0)} / ${formatBytes(est.quota)}` : 'Unavailable';
  } catch { els.storageValue.textContent = 'Unavailable'; }
  els.persistValue.textContent = 'Not requested';
  log(`Diagnostics: ${family}; secure=${window.isSecureContext}; WASM SIMD=${simd}; WebGPU=${!!navigator.gpu}; cores=${navigator.hardwareConcurrency || 'unknown'}.`);
  if (!window.isSecureContext) log('A secure HTTPS context is required for reliable PWA and worker features.', 'error');
  if (!simd) log('This browser does not report WebAssembly SIMD support. The CPU backend may not run.', 'error');
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    els.persistValue.textContent = 'API unavailable';
    log('Persistent storage API is unavailable in this browser.', 'warn');
    return false;
  }
  try {
    const granted = await navigator.storage.persist();
    els.persistValue.textContent = granted ? 'Granted' : 'Not granted';
    log(granted ? 'Browser granted persistent storage.' : 'Browser did not grant persistent storage; Cache Storage may still retain model files.', granted ? 'success' : 'warn');
    return granted;
  } catch (error) {
    els.persistValue.textContent = 'Request failed';
    log(`Persistent storage request failed: ${error.message || error}`, 'warn');
    return false;
  }
}

async function loadModel() {
  if (tts) return;
  els.loadModelBtn.disabled = true;
  els.loadModelBtn.textContent = 'Loading CPU model…';
  els.modelStatus.textContent = 'Loading Phonon CPU/WebAssembly runtime. Keep this page open.';
  badge(els.modelBadge, 'Loading', 'info');
  setModelProgress(0, 'Checking browser cache and loading the model…');
  const began = performance.now();
  try {
    await requestPersistentStorage();
    log('Loading Phonon 31M with backend="cpu" (WebGPU deliberately disabled).');
    log('Importing the Phonon library from the locally hosted vendor bundle.');
    const phononModuleUrl = new URL(
  '/vendor/phonon/phonon.js',
  window.location.origin
).href;

const { Phonon } = await import(
  /* @vite-ignore */ phononModuleUrl
);    log('Phonon JavaScript module loaded.', 'success');
    tts = await Phonon.load({
      model: 'phonon-31m-en',
      backend: 'cpu',
      threads: 1,
      progress: (percent) => {
        setModelProgress(percent, `Downloading model weights: ${Math.round(percent)}%`);
      }
    });
    const elapsed = ((performance.now() - began) / 1000).toFixed(1);
    currentVoice = tts.defaultVoice;
    populateVoices();
    badge(els.modelBadge, 'Loaded', 'success');
    badge(els.synthBadge, 'Ready', 'success');
    els.modelStatus.textContent = `Phonon loaded in ${elapsed}s using ${tts.backend.name.toUpperCase()} backend (${tts.backend.simd.toUpperCase()} SIMD, ${tts.backend.threads} thread${tts.backend.threads === 1 ? '' : 's'}).`;
    els.modelProgressText.textContent = 'Model loaded. Subsequent loads use browser cache when retained.';
    setModelProgress(100);
    els.generateBtn.disabled = false;
    els.speedRange.disabled = false;
    els.loadModelBtn.textContent = 'Model loaded';
    log(`Phonon initialized in ${elapsed}s. ${tts.voices.length} English voice profile(s) found.`, 'success');
    log(`Active backend: ${tts.backend.name}; SIMD: ${tts.backend.simd}; threads: ${tts.backend.threads}.`, 'success');
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage != null) {
      els.storageValue.textContent = `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`;
    }
  } catch (error) {
    tts = null;
    badge(els.modelBadge, 'Load failed', 'error');
    els.modelStatus.textContent = error?.message || String(error);
    els.loadModelBtn.disabled = false;
    els.loadModelBtn.textContent = 'Retry CPU model load';
    log(`Phonon load failed: ${error?.stack || error?.message || error}`, 'error');
  }
}
function populateVoices() {
  els.voiceSelect.innerHTML = '';
  for (const voice of tts.voices) {
    const opt = document.createElement('option');
    opt.value = voice.id;
    opt.textContent = `${voice.name} · ${voice.gender} · ${voice.locale}`;
    els.voiceSelect.append(opt);
  }
  const defaultVoice = tts.voices.find((v) => v.name === currentVoice || v.id === currentVoice) || tts.voices[0];
  if (defaultVoice) els.voiceSelect.value = defaultVoice.id;
  els.voiceSelect.disabled = !tts.voices.length;
  log(`Voice catalogue loaded: ${tts.voices.map((v) => v.name).join(', ')}.`, 'success');
}

function makeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataBytes, true);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    peak = Math.max(peak, Math.abs(s));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return { blob: new Blob([buffer], { type: 'audio/wav' }), peak };
}
async function generateSpeech() {
  if (!tts) return;
  const text = els.sampleText.value.trim();
  if (!text) { log('Enter some English text before generating speech.', 'warn'); return; }
  if (text.length > 4500) { log('This prototype limits each test to 4,500 characters.', 'warn'); return; }
  els.generateBtn.disabled = true;
  els.generateBtn.textContent = 'Generating on this device…';
  badge(els.synthBadge, 'Generating', 'info');
  els.synthStatus.textContent = 'CPU/WebAssembly inference running. Keep this page open.';
  els.synthProgress.style.width = '8%';
  els.chunkCount.textContent = '0 audio chunks';
  generationStarted = performance.now();
  let chunks = 0;
  let words = 0;
  const voiceId = els.voiceSelect.value;
  const speed = Number(els.speedRange.value);
  log(`Starting CPU synthesis: ${text.length} characters, voice ${voiceId}, speed ${speed.toFixed(2)}×.`);
  const timer = setInterval(() => {
    const sec = ((performance.now() - generationStarted) / 1000).toFixed(1);
    els.synthStatus.textContent = `Generating locally… ${sec}s elapsed`;
    els.synthProgress.style.width = `${Math.min(92, 8 + Number(sec) * 2)}%`;
  }, 500);
  try {
    const speech = await tts.speak(text, {
      voice: voiceId,
      speed,
      onAudio: () => { chunks++; els.chunkCount.textContent = `${chunks} audio chunks`; },
      onWord: () => { words++; }
    });
    clearInterval(timer);
    const elapsed = (performance.now() - generationStarted) / 1000;
    const duration = speech.audio.length / speech.sampleRate;
    const { blob, peak } = makeWav(speech.audio, speech.sampleRate);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
    els.audioPlayer.pause();
    els.audioPlayer.src = audioUrl;
    els.audioPlayer.load();
    generatedSpeech = speech;
    els.audioTitle.textContent = `${voiceId} · AI narration`;
    els.audioMeta.textContent = `${duration.toFixed(1)} seconds generated in ${elapsed.toFixed(2)} seconds`;
    els.audioStats.textContent = `${speech.sampleRate.toLocaleString()} Hz · Mono · 16-bit WAV · ${formatBytes(blob.size)}`;
    badge(els.audioBadge, 'Ready to play', 'success');
    badge(els.synthBadge, 'Complete', 'success');
    els.synthStatus.textContent = `Generated ${duration.toFixed(1)}s of speech in ${elapsed.toFixed(2)}s.`;
    els.synthProgress.style.width = '100%';
    els.downloadAudioBtn.disabled = false;
    els.clearAudioBtn.disabled = false;
    els.generateBtn.disabled = false;
    els.generateBtn.innerHTML = '<span class="btn-icon">✦</span> Generate speech';
    log(`Synthesis complete: ${speech.audio.length.toLocaleString()} samples, ${duration.toFixed(2)}s audio, ${elapsed.toFixed(2)}s compute, ${chunks} streamed chunks, ${words} word timings.`, 'success');
    log(`WAV ready: ${formatBytes(blob.size)}; peak amplitude ${(peak * 100).toFixed(1)}%. Tap Play to test background playback.`, 'success');
    setMediaSession(voiceId, duration);
  } catch (error) {
    clearInterval(timer);
    badge(els.synthBadge, 'Failed', 'error');
    els.synthStatus.textContent = error?.message || String(error);
    els.synthProgress.style.width = '0%';
    els.generateBtn.disabled = false;
    els.generateBtn.innerHTML = '<span class="btn-icon">✦</span> Retry speech generation';
    log(`Synthesis failed: ${error?.stack || error?.message || error}`, 'error');
  }
}
function setMediaSession(voiceId, duration) {
  if (!('mediaSession' in navigator)) { log('Media Session API unavailable; HTML audio controls remain available.', 'warn'); return; }
  try {
    if ('MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: `${voiceId} — Local AI narration`, artist: 'Phonon CPU Lab', album: 'PWA Audio Experiment' });
    navigator.mediaSession.setActionHandler('play', () => els.audioPlayer.play());
    navigator.mediaSession.setActionHandler('pause', () => els.audioPlayer.pause());
    navigator.mediaSession.setActionHandler('seekbackward', (d) => { els.audioPlayer.currentTime = Math.max(0, els.audioPlayer.currentTime - (d.seekOffset || 10)); });
    navigator.mediaSession.setActionHandler('seekforward', (d) => { els.audioPlayer.currentTime = Math.min(duration, els.audioPlayer.currentTime + (d.seekOffset || 10)); });
    log('Media Session metadata and playback actions configured.', 'success');
  } catch (error) { log(`Media Session setup notice: ${error.message || error}`, 'warn'); }
}

function downloadWav() {
  if (!audioUrl) return;
  const a = document.createElement('a'); a.href = audioUrl; a.download = 'phonon-local-ai-speech.wav'; a.click();
}
function clearAudio() {
  els.audioPlayer.pause(); els.audioPlayer.removeAttribute('src'); els.audioPlayer.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null; generatedSpeech = null;
  els.audioTitle.textContent = 'Your generated narration';
  els.audioMeta.textContent = 'Generate speech to create a WAV file';
  els.audioStats.textContent = '24 kHz · Mono · WAV';
  badge(els.audioBadge, 'No audio yet', 'neutral');
  els.downloadAudioBtn.disabled = true; els.clearAudioBtn.disabled = true;
  log('Generated audio cleared from memory.', 'info');
}

els.loadModelBtn.addEventListener('click', loadModel);
els.generateBtn.addEventListener('click', generateSpeech);
els.speedRange.addEventListener('input', () => { els.speedValue.textContent = `${Number(els.speedRange.value).toFixed(2)}×`; });
els.sampleText.addEventListener('input', () => { els.charCount.textContent = `${els.sampleText.value.length} / 4500`; });
els.downloadAudioBtn.addEventListener('click', downloadWav);
els.clearAudioBtn.addEventListener('click', clearAudio);
els.clearLogBtn.addEventListener('click', () => { logEntries.length = 0; renderLog(); });
els.copyLogBtn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(lastLogText || 'No logs yet.'); els.copyLogBtn.textContent = 'Copied'; setTimeout(() => els.copyLogBtn.textContent = 'Copy diagnostic log', 1500); }
  catch { log('Clipboard access unavailable. Select and copy the visible log instead.', 'warn'); }
});
els.audioPlayer.addEventListener('play', () => log('Generated audio playback started.', 'success'));
els.audioPlayer.addEventListener('ended', () => log('Generated audio playback ended.'));
els.audioPlayer.addEventListener('error', () => log(`Audio playback error: ${els.audioPlayer.error?.message || els.audioPlayer.error?.code || 'unknown'}`, 'error'));

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').then(() => log('PWA service worker registered.', 'success')).catch((e) => log(`Service worker registration failed: ${e.message}`, 'warn'));
}

els.charCount.textContent = `${els.sampleText.value.length} / 4500`;
els.speedValue.textContent = `${Number(els.speedRange.value).toFixed(2)}×`;
diagnostics();
log('Ready. The Phonon model is not downloaded until you tap Download & load CPU model.');
