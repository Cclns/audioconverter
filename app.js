// Register Service Worker with active update check
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update();
    }).catch(err => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

// DOM Elements
const dropZone = document.getElementById('dropZone');
const videoInput = document.getElementById('videoInput');
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

// iOS AudioContext unlock on initial user touch
function unlockAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// File picker triggers
dropZone.addEventListener('click', () => {
  unlockAudioContext();
  videoInput.click();
});

videoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    unlockAudioContext();
    handleVideoFile(e.target.files[0]);
  }
});

// Drag and drop support
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
    unlockAudioContext();
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

function setProgress(percent, message) {
  statusSection.classList.add('active');
  progressBar.style.width = `${percent}%`;
  progressBar.style.background = 'var(--accent-gradient)';
  statusText.textContent = message;
}

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

// Map AAC sample rates to 4-bit index for ADTS headers
const AAC_SAMPLE_RATES = {
  96000: 0x0, 88200: 0x1, 64000: 0x2, 48000: 0x3,
  44100: 0x4, 32000: 0x5, 24000: 0x6, 22050: 0x7,
  16000: 0x8, 12000: 0x9, 11025: 0xa, 8000: 0xb, 7350: 0xc
};

// Main processing pipeline
async function handleVideoFile(file) {
  if (!file) return;

  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'audio';
  currentFileName = `${baseName}.wav`;

  dropZone.style.display = 'none';
  analysisSection.classList.remove('active');
  setProgress(5, 'Loading video from Camera Roll...');

  try {
    // 1. Read file as ArrayBuffer with smooth progress
    const arrayBuffer = await readFileAsArrayBuffer(file, (loaded, total) => {
      const pct = Math.round((loaded / total) * 35) + 5;
      const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
      const mbTotal = (total / (1024 * 1024)).toFixed(1);
      setProgress(pct, `Reading video (${mbLoaded}/${mbTotal} MB)...`);
    });

    setProgress(45, 'Demuxing audio track...');

    // 2. Try demuxing with MP4Box (fast & reliable for all iPhone MOV/MP4 recordings)
    let audioBuffer = null;
    let videoMeta = { width: null, height: null, duration: null };

    try {
      const demuxResult = await demuxWithMP4Box(arrayBuffer);
      videoMeta = demuxResult.videoMeta;

      setProgress(65, 'Decoding audio samples to PCM...');

      if (demuxResult.aacData) {
        // Pure ADTS AAC bitstream -> iOS Safari decodeAudioData handles this in milliseconds!
        audioBuffer = await decodeAudioBuffer(demuxResult.aacData.buffer);
      } else if (demuxResult.rawPcmBuffer) {
        audioBuffer = demuxResult.rawPcmBuffer;
      }
    } catch (demuxErr) {
      console.warn('MP4Box demux failed or not MP4, falling back to direct decode:', demuxErr);
      setProgress(50, 'Decoding media directly...');
      audioBuffer = await decodeAudioBuffer(arrayBuffer);
    }

    if (!audioBuffer) {
      throw new Error('Could not decode audio. Ensure the video contains an audio track.');
    }

    setProgress(85, 'Analyzing audio & encoding lossless WAV...');

    // 3. Audio Analysis
    const duration = audioBuffer.duration || videoMeta.duration || 0;
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
    valResolution.textContent = videoMeta.width && videoMeta.height ? `${videoMeta.width} x ${videoMeta.height}` : 'Audio track';
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
    }, 350);

  } catch (error) {
    console.error('Extraction error:', error);
    statusSection.classList.add('active');
    progressBar.style.width = '100%';
    progressBar.style.background = '#FF453A';
    statusText.textContent = `Error: ${error.message || 'Could not extract audio.'}`;
    
    setTimeout(() => {
      dropZone.style.display = 'block';
    }, 4000);
  }
}

// Read file with progress callbacks
function readFileAsArrayBuffer(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total);
      }
    };
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read video file.'));
    reader.readAsArrayBuffer(file);
  });
}

// MP4/MOV Demuxer using MP4Box
function demuxWithMP4Box(arrayBuffer) {
  return new Promise((resolve, reject) => {
    if (typeof MP4Box === 'undefined') {
      reject(new Error('MP4Box library not loaded.'));
      return;
    }

    // Pass true to keepMdatData so raw sample data is preserved when moov is at the end (iPhone camera videos)
    const mp4boxfile = MP4Box.createFile(true);
    let audioTrack = null;
    let videoTrack = null;
    const audioSamples = [];
    let fileInfo = null;

    mp4boxfile.onError = (e) => {
      reject(new Error('MP4Box error: ' + (e ? e.message || e : 'Unknown parsing error')));
    };

    mp4boxfile.onReady = (info) => {
      fileInfo = info;
      videoTrack = info.tracks.find(t => t.type === 'video');
      audioTrack = info.tracks.find(t => t.type === 'audio');

      if (!audioTrack) {
        reject(new Error('No audio track found in this video.'));
        return;
      }

      // Start sample extraction for audio track
      mp4boxfile.setExtractionOptions(audioTrack.id, null, { nbSamples: 200000 });
      mp4boxfile.start();
    };

    mp4boxfile.onSamples = (id, user, samples) => {
      if (audioTrack && id === audioTrack.id) {
        audioSamples.push(...samples);
      }
    };

    // Feed buffer to MP4Box
    try {
      const bufferCopy = arrayBuffer.slice(0);
      bufferCopy.fileStart = 0;
      mp4boxfile.appendBuffer(bufferCopy);
      mp4boxfile.flush();

      // If moov was at the end and samples were not extracted yet, seek and pump
      if (audioSamples.length === 0 && mp4boxfile.seek) {
        try {
          const seekInfo = mp4boxfile.seek(0, true);
          const startOffset = (seekInfo && isFinite(seekInfo.offset)) ? seekInfo.offset : 0;
          const retryChunk = arrayBuffer.slice(startOffset);
          retryChunk.fileStart = startOffset;
          mp4boxfile.appendBuffer(retryChunk);
          mp4boxfile.flush();
        } catch (seekErr) {
          console.warn('Seek retry warning:', seekErr);
        }
      }
    } catch (err) {
      reject(err);
      return;
    }

    if (!audioTrack || audioSamples.length === 0) {
      reject(new Error('No audio samples extracted.'));
      return;
    }

    // Video metadata
    const videoMeta = {
      width: videoTrack && videoTrack.video ? videoTrack.video.width : null,
      height: videoTrack && videoTrack.video ? videoTrack.video.height : null,
      duration: fileInfo.duration ? (fileInfo.duration / fileInfo.timescale) : null
    };

    const sampleRate = audioTrack.audio ? audioTrack.audio.sample_rate : 44100;
    const channels = audioTrack.audio ? audioTrack.audio.channel_count : 2;

    // Build ADTS AAC stream for AAC audio
    if (audioTrack.codec && audioTrack.codec.startsWith('mp4a')) {
      // Calculate total byte size (each sample + 7-byte ADTS header)
      let totalLength = 0;
      for (let i = 0; i < audioSamples.length; i++) {
        totalLength += 7 + audioSamples[i].data.byteLength;
      }

      const aacData = new Uint8Array(totalLength);
      let offset = 0;

      const sampleRateIdx = AAC_SAMPLE_RATES[sampleRate] !== undefined ? AAC_SAMPLE_RATES[sampleRate] : 4;
      const profile = 1; // AAC LC (object type 2 - 1)

      for (let i = 0; i < audioSamples.length; i++) {
        const sample = audioSamples[i];
        const dataLen = sample.data.byteLength;
        const frameLength = dataLen + 7;

        // 7-byte ADTS Header
        aacData[offset] = 0xFF;
        aacData[offset + 1] = 0xF1;
        aacData[offset + 2] = ((profile & 0x03) << 6) | ((sampleRateIdx & 0x0F) << 2) | ((channels >> 2) & 0x01);
        aacData[offset + 3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03);
        aacData[offset + 4] = (frameLength >> 3) & 0xFF;
        aacData[offset + 5] = ((frameLength & 0x07) << 5) | 0x1F;
        aacData[offset + 6] = 0xFC;
        offset += 7;

        // Copy raw AAC sample bytes
        aacData.set(new Uint8Array(sample.data), offset);
        offset += dataLen;
      }

      resolve({ videoMeta, aacData });
    } else {
      // For non-AAC tracks, fallback to standard decoding
      resolve({ videoMeta });
    }
  });
}

// Decode audio using Web Audio API with compatibility for iOS WebKit
function decodeAudioBuffer(buffer) {
  return new Promise((resolve, reject) => {
    unlockAudioContext();

    // Support both Promise and Callback signatures for WebKit
    const promise = audioCtx.decodeAudioData(
      buffer,
      (decoded) => resolve(decoded),
      (err) => reject(new Error('Audio decoding failed: ' + (err ? err.message || err : 'Unsupported audio format')))
    );

    if (promise && typeof promise.then === 'function') {
      promise.then(resolve).catch(reject);
    }

    // Safety timeout in case Safari's decodeAudioData hangs
    setTimeout(() => {
      reject(new Error('Decoding timed out. Video format may be unsupported.'));
    }, 15000);
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

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples
  let offset = 44;
  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample));
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

// iOS Share Sheet
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
        downloadBtn.click();
      }
    }
  } else {
    downloadBtn.click();
  }
});
