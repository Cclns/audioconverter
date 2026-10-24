// Register Service Worker for offline PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

// DOM Elements
const dropZone = document.getElementById('dropZone');
const videoInput = document.getElementById('videoInput');
const pickerLabel = document.getElementById('pickerLabel');
const statusSection = document.getElementById('statusSection');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const analysisSection = document.getElementById('analysisSection');

const valDuration = document.getElementById('valDuration');
const valResolution = document.getElementById('valResolution');
const valSize = document.getElementById('valSize');
const valChannels = document.getElementById('valChannels');
const valSampleRate = document.getElementById('valSampleRate');
const valPeak = document.getElementById('valPeak');

const waveformCanvas = document.getElementById('waveformCanvas');
const audioPreview = document.getElementById('audioPreview');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const resetBtn = document.getElementById('resetBtn');

let currentWavBlob = null;
let currentWavFile = null;
let currentFileName = 'extracted_audio.wav';
let audioCtx = null;

// File picker triggers
dropZone.addEventListener('click', () => {
  videoInput.click();
});

videoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleVideoFile(e.target.files[0]);
  }
});

// Drag and drop support (useful on Mac / desktop)
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#0A84FF';
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.18)';
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleVideoFile(e.dataTransfer.files[0]);
  }
});

resetBtn.addEventListener('click', () => {
  analysisSection.classList.remove('active');
  statusSection.classList.remove('active');
  dropZone.style.display = 'block';
  videoInput.value = '';
  if (audioPreview.src) {
    URL.revokeObjectURL(audioPreview.src);
    audioPreview.removeAttribute('src');
  }
  currentWavBlob = null;
  currentWavFile = null;
});

// Update progress bar helper
function setProgress(percent, message) {
  statusSection.classList.add('active');
  progressBar.style.width = `${percent}%`;
  statusText.textContent = message;
}

// Format seconds into MM:SS
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Format bytes into readable MB
function formatFileSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

// Main Video Processing Routine
async function handleVideoFile(file) {
  if (!file) return;

  // Derive audio filename from video filename
  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'audio';
  currentFileName = `${baseName}.wav`;

  dropZone.style.display = 'none';
  analysisSection.classList.remove('active');
  setProgress(15, 'Reading video metadata...');

  let videoMeta = { width: null, height: null, duration: null };

  try {
    // 1. Extract video metadata via HTML5 video element
    videoMeta = await extractVideoMetadata(file);
    setProgress(35, 'Decoding audio track from video...');

    // 2. Read file as ArrayBuffer & decode via Web Audio API
    const arrayBuffer = await file.arrayBuffer();
    setProgress(60, 'Processing audio stream...');

    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    setProgress(80, 'Analyzing audio & encoding WAV...');

    // 3. Audio Analysis
    const duration = audioBuffer.duration;
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    let peak = 0;
    for (let c = 0; c < channels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const val = Math.abs(data[i]);
        if (val > peak) peak = val;
      }
    }
    const peakDb = peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : '-∞';

    // 4. Update UI Metrics
    valDuration.textContent = formatDuration(duration);
    valResolution.textContent = videoMeta.width && videoMeta.height ? `${videoMeta.width} x ${videoMeta.height}` : 'Audio-only';
    valSize.textContent = formatFileSize(file.size);
    valChannels.textContent = channels === 1 ? 'Mono (1 ch)' : channels === 2 ? 'Stereo (2 ch)' : `${channels} ch`;
    valSampleRate.textContent = `${(sampleRate / 1000).toFixed(1)} kHz`;
    valPeak.textContent = `${peakDb} dB`;

    // 5. Draw Waveform
    drawWaveform(audioBuffer);

    // 6. Encode to Lossless 16-bit PCM WAV
    currentWavBlob = audioBufferToWav(audioBuffer);
    currentWavFile = new File([currentWavBlob], currentFileName, { type: 'audio/wav' });

    // Set preview audio
    const audioUrl = URL.createObjectURL(currentWavBlob);
    audioPreview.src = audioUrl;

    setProgress(100, 'Audio extracted successfully!');
    setTimeout(() => {
      statusSection.classList.remove('active');
      analysisSection.classList.add('active');
    }, 400);

  } catch (error) {
    console.error('Extraction error:', error);
    statusSection.classList.add('active');
    progressBar.style.width = '100%';
    progressBar.style.background = '#FF453A';
    statusText.textContent = `Error: ${error.message || 'Could not extract audio. Ensure the video has an audio track.'}`;
    
    // Show reset option
    setTimeout(() => {
      dropZone.style.display = 'block';
    }, 2500);
  }
}

// Helper to inspect video dimensions and duration
function extractVideoMetadata(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const meta = {
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: video.duration || null
      };
      cleanup();
      resolve(meta);
    };

    video.onerror = () => {
      cleanup();
      resolve({ width: null, height: null, duration: null });
    };

    // Timeout fallback after 3 seconds
    setTimeout(() => {
      cleanup();
      resolve({ width: null, height: null, duration: null });
    }, 3000);
  });
}

// Draw crisp retina waveform
function drawWaveform(audioBuffer) {
  const canvas = waveformCanvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 360) * dpr;
  canvas.height = (rect.height || 80) * dpr;
  ctx.scale(dpr, dpr);

  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const channelData = audioBuffer.getChannelData(0);
  const step = Math.ceil(channelData.length / width);
  const amp = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Gradient for waveform
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#0A84FF');
  gradient.addColorStop(0.5, '#5E5CE6');
  gradient.addColorStop(1, '#5AC8FA');

  ctx.fillStyle = gradient;

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    const startIndex = i * step;

    for (let j = 0; j < step; j++) {
      const datum = channelData[startIndex + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }

    const y1 = (1 + min) * amp;
    const y2 = Math.max((1 + max) * amp, y1 + 1);
    ctx.fillRect(i, y1, 1, y2 - y1);
  }
}

// Convert AudioBuffer to Standard 16-bit PCM WAV Blob
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length;
  const dataSize = length * blockAlign;
  const bufferLength = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true);
  // block align
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataSize, true);

  // Write PCM audio samples
  let offset = 44;
  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      // Clamp between -1.0 and 1.0
      sample = Math.max(-1, Math.min(1, sample));
      // Scale to 16-bit signed integer (-32768 to 32767)
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Download Button
downloadBtn.addEventListener('click', () => {
  if (!currentWavBlob) return;
  const url = URL.createObjectURL(currentWavBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = currentFileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
});

// Native iOS Share Sheet Button (Save to Files, AirDrop, etc.)
shareBtn.addEventListener('click', async () => {
  if (!currentWavFile) return;

  if (navigator.canShare && navigator.canShare({ files: [currentWavFile] })) {
    try {
      await navigator.share({
        files: [currentWavFile],
        title: currentFileName,
        text: 'Extracted audio from video'
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Share sheet failed, falling back to download:', err);
        downloadBtn.click();
      }
    }
  } else {
    // Fallback if Web Share API files is unavailable
    downloadBtn.click();
  }
});
